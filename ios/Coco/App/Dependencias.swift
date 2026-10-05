import Foundation
import Observation

/// La composición de la app, hecha UNA vez. Todo lo que cruza módulos nace
/// aquí y se pasa por el constructor: nadie más llama a `.shared` ni a un
/// `.standard` escondido. Las pruebas la construyen con dobles y sin red.
@Observable @MainActor
final class Dependencias {
    static let compartidas = Dependencias()

    typealias RegistroDeIntents = @MainActor (any Capturador, any Navegacion) -> Void
    typealias RegistroDeTareas = @MainActor (Sesion, ColaDeCapturas, SincronizadorDelArbol, Notificador) -> Void

    let configuracion: ConfiguracionDeLaAPI
    let api: ClienteAPI
    let sesion: Sesion
    let cola: ColaDeCapturas
    let capturador: CapturadorConCola
    let arbol: SincronizadorDelArbol
    let puente: PuenteWeb
    let notificador: Notificador
    let conectividad: Conectividad
    let enrutador: Enrutador
    let defaults: UserDefaults

    /// Espejo del estado del actor de sesión, para que las vistas lo observen.
    private(set) var estadoDeSesion: EstadoDeSesion = .cargando
    /// Capturas que aún no llegaron a la API: la insignia de la pestaña.
    private(set) var pendientes = 0
    private(set) var arrancada = false
    private(set) var intentsRegistrados = false
    private(set) var tareasRegistradas = false

    private var observadores: [Task<Void, Never>] = []

    init(
        configuracion: ConfiguracionDeLaAPI = .actual(),
        transporte: Transporte = TransporteURLSession(),
        llavero: Llavero = LlaveroDelSistema(),
        almacenDeCola: AlmacenDeCola? = nil,
        almacenDelArbol: AlmacenDelArbol? = nil,
        notificador: Notificador = NotificadorDelSistema(),
        conectividad: Conectividad? = nil,
        defaults: UserDefaults = .standard,
        registrarIntents: @escaping RegistroDeIntents = { DependenciasDeIntents.registrar(capturador: $0, navegacion: $1) },
        registrarTareas: @escaping RegistroDeTareas = { TareasDeFondo.registrar(sesion: $0, cola: $1, arbol: $2, notificador: $3) }
    ) {
        self.configuracion = configuracion
        self.defaults = defaults
        self.conectividad = conectividad ?? Conectividad()
        let api = ClienteAPI(configuracion: configuracion, transporte: transporte)
        self.api = api
        let sesion = SesionNativa(api: api, llavero: llavero)
        self.sesion = sesion
        let enrutador = Enrutador()
        self.enrutador = enrutador

        // La cola cuenta sus pendientes cada vez que cambia y se lo dice al
        // notificador (insignia del icono); se intercepta ahí para la pestaña.
        let contador = ContadorDePendientes(notificador: notificador)
        self.notificador = contador

        let cola = ColaDeCapturas(
            almacen: almacenDeCola ?? Self.almacenDeColaPorDefecto(),
            enviador: EnviadorPorAPI(api: api, sesion: sesion),
            sesion: sesion,
            notificador: contador
        )
        self.cola = cola
        let capturador = CapturadorConCola(cola: cola, notificador: contador)
        self.capturador = capturador
        let arbol = SincronizadorDelArbol(api: api, sesion: sesion, almacen: almacenDelArbol ?? Self.almacenDelArbolPorDefecto())
        self.arbol = arbol
        puente = PuenteWeb(sesion: sesion, configuracion: configuracion, navegacion: enrutador)

        contador.alContar = { [weak self] n in self?.pendientes = n }

        // Antes de que iOS pueda lanzar un intent o una tarea de fondo: en el
        // init de la App, no después.
        registrarIntents(capturador, enrutador)
        intentsRegistrados = true
        registrarTareas(sesion, cola, arbol, contador)
        tareasRegistradas = true
    }

    // MARK: Ciclo de vida

    /// Una vez, cuando aparece la raíz: red, observadores, web, sesión, cola.
    func arrancar() async {
        guard !arrancada else { return }
        arrancada = true
        Bitacora.app.info("Arranca contra \(self.configuracion.base.absoluteString, privacy: .public)")
        conectividad.empezar()
        observar()
        puente.cargarInicio()
        await sesion.restaurar()
        await programarVencimiento()
        pendientes = await cola.pendientes()
        Task { _ = await self.cola.procesar() }
    }

    /// Al volver a primer plano: árbol si toca y cola.
    func volvioAPrimerPlano() {
        guard arrancada else { return }
        Task {
            await self.arbol.refrescarSiHaceFalta()
            _ = await self.cola.procesar()
        }
    }

    /// Cerrar sesión desde Más: logout nativo con el refresh y Keychain
    /// limpio; la web se entera por el observador de cambios.
    func salir() async {
        await sesion.salir()
    }

    /// Un formulario nuevo con el árbol que haya en el teléfono.
    func nuevoModeloDelFormulario() async -> ModeloDelFormulario {
        ModeloDelFormulario(indice: await arbol.indice(), api: api, sesion: sesion, capturador: capturador, conectividad: conectividad)
    }

    var perfil: PerfilPublico? {
        switch estadoDeSesion {
        case .activa(let p): p
        case .sinConexion(let ultima): ultima
        case .cargando, .sinSesion: nil
        }
    }

    var esAdmin: Bool { perfil?.role == "admin" }

    var haySesion: Bool {
        switch estadoDeSesion {
        case .activa, .sinConexion: true
        case .cargando, .sinSesion: false
        }
    }

    // MARK: Observadores

    private func observar() {
        observadores.append(Task { [weak self] in
            guard let cambios = self?.sesion.cambios else { return }
            for await estado in cambios {
                guard let self else { return }
                await self.sesionCambio(estado)
            }
        })
        observadores.append(Task { [weak self] in
            guard let cambios = self?.conectividad.cambios else { return }
            for await hay in cambios where hay {
                guard let self else { return }
                _ = await self.cola.procesar()
            }
        })
    }

    private func sesionCambio(_ estado: EstadoDeSesion) async {
        Bitacora.sesion.info("Sesión: \(Self.nombre(de: estado), privacy: .public)")
        estadoDeSesion = estado
        switch estado {
        case .activa:
            // Con documento cargado, la web recibe la sesión sin recargar; sin
            // él, la pedirá ella por el puente al arrancar.
            if puente.hayDocumento { await puente.empujarSesion() }
            await cola.sesionVolvio()
            Task { _ = await self.cola.procesar() }
            Task { await self.arbol.refrescarSiHaceFalta() }
            await pedirPermisoDeAvisosLaPrimeraVez()
            if !BienvenidaView.yaVista(defaults: defaults), enrutador.hoja == nil {
                enrutador.ir(.bienvenida)
            }
        case .sinSesion:
            if puente.hayDocumento { puente.avisarSesionCerrada() }
        case .sinConexion, .cargando:
            break
        }
    }

    private static let clavePermisoPedido = "permiso-de-avisos-pedido"

    private func pedirPermisoDeAvisosLaPrimeraVez() async {
        guard !defaults.bool(forKey: Self.clavePermisoPedido) else { return }
        defaults.set(true, forKey: Self.clavePermisoPedido)
        _ = await notificador.pedirPermiso()
    }

    /// El aviso de que la firma del equipo personal caduca. Sin perfil
    /// embebido —simulador— no hay nada que programar.
    private func programarVencimiento() async {
        guard let vence = LectorDePerfil.delBundle() else { return }
        let momento = AvisoDeVencimiento.momentoDelAviso(vence: vence, ahora: .now) ?? .now
        await notificador.programarVencimiento(vence, texto: AvisoDeVencimiento.texto(vence: vence, ahora: momento).cuerpo)
    }

    // MARK: Por defecto

    /// Si el disco de la app no se deja crear, la cola va al temporal: peor
    /// que lo normal, pero mejor que arrancar sin cola.
    private static func almacenDeColaPorDefecto() -> AlmacenDeCola {
        let raiz = (try? AlmacenDeColaEnDisco.raizPorDefecto()) ?? FileManager.default.temporaryDirectory.appending(path: "cola", directoryHint: .isDirectory)
        return AlmacenDeColaEnDisco(raiz: raiz)
    }

    private static func almacenDelArbolPorDefecto() -> AlmacenDelArbol {
        (try? AlmacenDelArbolEnDisco.porDefecto()) ?? AlmacenDelArbolEnDisco(archivo: FileManager.default.temporaryDirectory.appending(path: "arbol.json"))
    }

    private static func nombre(de estado: EstadoDeSesion) -> String {
        switch estado {
        case .cargando: "cargando"
        case .sinSesion: "sin sesión"
        case .activa(let p): "activa (\(p.email))"
        case .sinConexion: "sin conexión"
        }
    }
}

/// Reenvía todo al notificador real y, de paso, cuenta lo que la cola dice
/// que está pendiente cada vez que actualiza la insignia del icono.
final class ContadorDePendientes: Notificador, @unchecked Sendable {
    private let real: Notificador
    private let cerrojo = NSLock()
    private var _alContar: (@MainActor (Int) -> Void)?

    var alContar: (@MainActor (Int) -> Void)? {
        get { cerrojo.withLock { _alContar } }
        set { cerrojo.withLock { _alContar = newValue } }
    }

    init(notificador: Notificador) {
        real = notificador
    }

    func pedirPermiso() async -> Bool { await real.pedirPermiso() }
    func capturaRegistrada(_ r: ResultadoGuardado, origen: OrigenDeCaptura) async { await real.capturaRegistrada(r, origen: origen) }
    func capturaFallida(motivo: String) async { await real.capturaFallida(motivo: motivo) }
    func colaEnviada(cuantas: Int) async { await real.colaEnviada(cuantas: cuantas) }
    func programarVencimiento(_ vence: Date, texto: String) async { await real.programarVencimiento(vence, texto: texto) }
    func ponerInsignia(_ n: Int) async {
        if let alContar { await alContar(n) }
        await real.ponerInsignia(n)
    }
}
