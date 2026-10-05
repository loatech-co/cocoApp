import Foundation

/// Lo que dejó una corrida de `procesar()`.
struct SendSummary: Equatable, Sendable {
    var enviadas: Int = 0
    var fallidas: Int = 0
    var pendientes: Int = 0
    var resultados: [SavedResult] = []
}

/// La columna vertebral: toda captura se escribe en disco ANTES de tocar la
/// red, y de ahí sale de una en una, FIFO, con reintentos. Nada se pierde:
/// lo que la API rechaza queda `.fallida` con su motivo, visible, no borrado.
final actor CaptureQueue {
    private let almacen: QueueStore
    private let enviador: CaptureSender
    private let sesion: Session
    private let notificador: Notifier
    private let reintento: Retry
    private let reloj: @Sendable () -> Date
    private let separacion: Duration
    private let topeDeFotosBytes: Int
    private let encogerFoto: @Sendable (Data) -> Data

    /// Publica la cola entera tras cada transición; quien escucha saca de ahí
    /// el número de pendientes.
    nonisolated let cambios: AsyncStream<[PendingCapture]>
    private let continuacion: AsyncStream<[PendingCapture]>.Continuation

    private var enVuelo: Task<SendSummary, Never>?
    private var ultimoEnvio: ContinuousClock.Instant?

    init(
        almacen: QueueStore,
        enviador: CaptureSender,
        sesion: Session,
        notificador: Notifier,
        reintento: Retry = .init(),
        reloj: @Sendable @escaping () -> Date = Date.init,
        separacion: Duration = .milliseconds(300),
        topeDeFotosBytes: Int = 200 * 1024 * 1024,
        encogerFoto: @Sendable @escaping (Data) -> Data = { PhotoReducer.jpeg($0) }
    ) {
        self.almacen = almacen
        self.enviador = enviador
        self.sesion = sesion
        self.notificador = notificador
        self.reintento = reintento
        self.reloj = reloj
        self.separacion = separacion
        self.topeDeFotosBytes = topeDeFotosBytes
        self.encogerFoto = encogerFoto
        let (flujo, continuacion) = AsyncStream<[PendingCapture]>.makeStream(bufferingPolicy: .bufferingNewest(1))
        self.cambios = flujo
        self.continuacion = continuacion
    }

    // MARK: Entrada

    /// Idempotente por `id`: encolar dos veces la misma deja una. Persiste
    /// antes de devolver; si el disco falla, lanza y el que llama lo sabe.
    @discardableResult
    func encolar(
        _ cuerpo: CaptureBody, origen: CaptureSource, foto: Data?, id: UUID = UUID(), capturadaEn: Date = .now
    ) async throws -> PendingCapture {
        if let existente = try almacen.todas().first(where: { $0.id == id }) { return existente }
        var captura = PendingCapture(id: id, creadaEn: capturadaEn, origen: origen, cuerpo: cuerpo)
        if let foto {
            let jpeg = encogerFoto(foto)
            // Con el tope lleno no se escribe: una foto que no cabe no puede
            // dejar sin sitio al JSON de la captura siguiente.
            guard try almacen.bytesDeFotos() + jpeg.count <= topeDeFotosBytes else { throw QueueError.fotosLlenas }
            captura.fotoRelativa = try almacen.guardarFoto(jpeg, id: id)
        }
        try almacen.guardar(captura)
        await publicar()
        return captura
    }

    // MARK: Envío

    /// Una sola corrida en vuelo: quien llega mientras otra corre espera su
    /// resultado. Respeta `proximoIntento` y para al agotar el presupuesto.
    @discardableResult
    func procesar(presupuesto: Duration = .seconds(25)) async -> SendSummary {
        if let enVuelo { return await enVuelo.value }
        let tarea = Task { await self.correr(presupuesto: presupuesto) }
        enVuelo = tarea
        let resumen = await tarea.value
        enVuelo = nil
        return resumen
    }

    private func correr(presupuesto: Duration) async -> SendSummary {
        let limite = ContinuousClock.now + presupuesto
        var resumen = SendSummary()
        var enviadasQueEstabanEnCola = 0
        var yaIntentadas = Set<UUID>()

        while ContinuousClock.now < limite {
            let ahora = reloj()
            guard let captura = listas(en: ahora).first(where: { !yaIntentadas.contains($0.id) }) else { break }
            yaIntentadas.insert(captura.id)
            await respetarSeparacion()
            let estabaEnCola = captura.intentos > 0
            let salida = await enviar(captura)
            switch salida {
            case .hecha(let r):
                resumen.enviadas += 1
                resumen.resultados.append(r)
                if estabaEnCola { enviadasQueEstabanEnCola += 1 }
            case .fallida:
                resumen.fallidas += 1
            case .reintentar:
                continue
            case .sinRed:
                break
            }
            // Sin red no tiene sentido seguir con las demás: cada una
            // esperaría su propio timeout para decir lo mismo.
            if case .sinRed = salida { break }
        }

        resumen.pendientes = contarPendientes()
        if enviadasQueEstabanEnCola > 0 { await notificador.colaEnviada(cuantas: enviadasQueEstabanEnCola) }
        return resumen
    }

    private enum SendOutcome {
        case hecha(SavedResult)
        case fallida, reintentar, sinRed
    }

    /// Fase 1 (texto) y fase 2 (foto) sobre una captura. Cada transición se
    /// escribe en disco antes de seguir, así un reinicio a mitad no duplica.
    private func enviar(_ original: PendingCapture) async -> SendOutcome {
        var captura = original
        if case .porEnviar = captura.fase {
            do {
                let respuesta = try await conRenovacionSiHaceFalta { try await self.enviador.capturar(captura.request) }
                let resultado = SavedResult(
                    transactionId: respuesta.transaction.id,
                    resumen: respuesta.resumen,
                    repetido: respuesta.repetido,
                    fusionado: respuesta.fusionado,
                    porRevisar: respuesta.transaction.needsReview,
                    terminadaEn: reloj()
                )
                captura.ultimoError = nil
                if captura.fotoRelativa != nil {
                    captura.fase = .porSubirFoto(transactionId: resultado.transactionId)
                    captura.resultadoDeTexto = resultado
                    try? almacen.guardar(captura)
                } else {
                    return await terminar(&captura, con: resultado)
                }
            } catch {
                return await fallo(&captura, error: error)
            }
        }
        if case .porSubirFoto(let transactionId) = captura.fase {
            let resultado =
                captura.resultadoDeTexto
                ?? SavedResult(
                    transactionId: transactionId, resumen: "", repetido: false, fusionado: false, porRevisar: false,
                    terminadaEn: reloj())
            guard let ruta = captura.fotoRelativa, let jpeg = try? almacen.foto(en: ruta) else {
                // Sin archivo no hay nada que subir: el texto ya está registrado.
                return await terminar(&captura, con: resultado)
            }
            do {
                _ = try await conRenovacionSiHaceFalta {
                    try await self.enviador.subirFoto(jpeg, nombre: "\(captura.id.uuidString).jpg", a: transactionId)
                }
                return await terminar(&captura, con: resultado)
            } catch {
                return await fallo(&captura, error: error)
            }
        }
        return .reintentar
    }

    /// Un 401 pide UNA renovación y reintenta de inmediato; si sigue en 401,
    /// la captura espera a que la persona vuelva a entrar.
    private func conRenovacionSiHaceFalta<T>(_ operacion: () async throws -> T) async throws -> T {
        do {
            return try await operacion()
        } catch APIError.noAutenticado {
            do { try await sesion.renovarAhora() } catch { throw APIError.noAutenticado }
            return try await operacion()
        }
    }

    private func terminar(_ captura: inout PendingCapture, con resultado: SavedResult) async -> SendOutcome {
        if let ruta = captura.fotoRelativa {
            try? almacen.borrarFoto(en: ruta)
            captura.fotoRelativa = nil
        }
        captura.fase = .hecha(resultado)
        captura.resultadoDeTexto = nil
        captura.ultimoError = nil
        try? almacen.guardar(captura)
        await notificador.capturaRegistrada(resultado, origen: captura.origen)
        await publicar()
        return .hecha(resultado)
    }

    private func fallo(_ captura: inout PendingCapture, error: Error) async -> SendOutcome {
        let api = APIError.desde(error)
        let salida: SendOutcome
        switch api {
        case .noAutenticado:
            // Sin crecer la espera: no es culpa de la red, es de la sesión.
            captura.fase = .esperandoSesion
            captura.ultimoError = "La sesión expiró. Vuelve a entrar."
            salida = .reintentar
        case .rechazada(_, _, let mensaje):
            captura.fase = .fallida(motivo: mensaje)
            captura.ultimoError = mensaje
            await notificador.capturaFallida(motivo: mensaje)
            salida = .fallida
        case .respuestaIlegible:
            let motivo = "La API contestó algo que no se entiende."
            captura.fase = .fallida(motivo: motivo)
            captura.ultimoError = motivo
            await notificador.capturaFallida(motivo: motivo)
            salida = .fallida
        case .sinRed, .tiempoAgotado, .servidor:
            captura.intentos += 1
            captura.proximoIntento = reloj().addingTimeInterval(
                Self.segundos(reintento.espera(intento: captura.intentos - 1)))
            captura.ultimoError = Self.describir(api)
            salida = api.esDeRed ? .sinRed : .reintentar
        }
        try? almacen.guardar(captura)
        await publicar()
        return salida
    }

    private static func segundos(_ d: Duration) -> TimeInterval {
        Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
    }

    private static func describir(_ e: APIError) -> String {
        switch e {
        case .sinRed: "Sin conexión"
        case .tiempoAgotado: "La API tardó demasiado"
        case .servidor(let status): "La API no pudo ahora (\(status))"
        default: "Error"
        }
    }

    private func respetarSeparacion() async {
        if let ultimo = ultimoEnvio {
            let transcurrido = ContinuousClock.now - ultimo
            if transcurrido < separacion { try? await Task.sleep(for: separacion - transcurrido) }
        }
        ultimoEnvio = .now
    }

    /// Lo que toca enviar ahora, en el orden en que se capturó.
    private func listas(en ahora: Date) -> [PendingCapture] {
        let todas = (try? almacen.todas()) ?? []
        return
            todas
            .filter { c in
                switch c.fase {
                case .porEnviar, .porSubirFoto: c.proximoIntento <= ahora
                default: false
                }
            }
            .sorted { $0.creadaEn < $1.creadaEn }
    }
}

// MARK: Acciones de la persona

extension CaptureQueue {

    func reintentarAhora(id: UUID) async {
        guard var captura = buscar(id) else { return }
        switch captura.fase {
        case .fallida, .esperandoSesion: captura.fase = .porEnviar
        case .porEnviar, .porSubirFoto: break
        case .hecha: return
        }
        captura.proximoIntento = .distantPast
        try? almacen.guardar(captura)
        await publicar()
    }

    /// Solo lo que aún no llegó a la API: editar algo ya registrado sería
    /// mentir sobre lo que se envió.
    func editar(id: UUID, cuerpo: CaptureBody) async throws {
        guard var captura = buscar(id) else { throw QueueError.noExiste(id) }
        switch captura.fase {
        case .fallida, .porEnviar: break
        default: throw QueueError.noEditable(id)
        }
        captura.cuerpo = cuerpo
        captura.fase = .porEnviar
        captura.proximoIntento = .distantPast
        captura.ultimoError = nil
        try almacen.guardar(captura)
        await publicar()
    }

    func descartar(id: UUID) async throws {
        guard let captura = buscar(id) else { return }
        if let ruta = captura.fotoRelativa { try? almacen.borrarFoto(en: ruta) }
        try almacen.borrar(id: id)
        await publicar()
    }

    /// Tras un login: lo que esperaba sesión vuelve a la fila.
    func sesionVolvio() async {
        for var captura in (try? almacen.todas()) ?? [] where captura.fase == .esperandoSesion {
            captura.fase = .porEnviar
            captura.proximoIntento = .distantPast
            try? almacen.guardar(captura)
        }
        await publicar()
    }

    func purgar(hechasMasViejasQue edad: Duration = .seconds(30 * 86_400)) async {
        let ahora = reloj()
        let segundos = TimeInterval(edad.components.seconds)
        for captura in (try? almacen.todas()) ?? [] {
            if case .hecha(let r) = captura.fase, ahora.timeIntervalSince(r.terminadaEn) > segundos {
                try? almacen.borrar(id: captura.id)
            }
        }
        await publicar()
    }

    // MARK: Lectura

    func pendientes() async -> Int { contarPendientes() }

    func todas() async -> [PendingCapture] {
        ((try? almacen.todas()) ?? []).sorted { $0.creadaEn > $1.creadaEn }
    }

    func captura(id: UUID) async -> PendingCapture? { buscar(id) }

    private func buscar(_ id: UUID) -> PendingCapture? {
        (try? almacen.todas())?.first { $0.id == id }
    }

    private func contarPendientes() -> Int {
        ((try? almacen.todas()) ?? []).filter(\.estaPendiente).count
    }

    private func publicar() async {
        let todas = ((try? almacen.todas()) ?? []).sorted { $0.creadaEn > $1.creadaEn }
        continuacion.yield(todas)
        await notificador.ponerInsignia(todas.filter(\.estaPendiente).count)
    }
}
