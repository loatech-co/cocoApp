import XCTest

@testable import Coco

final class ColaDeCapturasTests: XCTestCase {
    private var raiz: URL = URL(fileURLWithPath: "/")
    private var almacen: AlmacenDeColaEnDisco = .init(raiz: URL(fileURLWithPath: "/"))
    private var enviador = EnviadorDoble()
    private var sesion = SesionDoble()
    private var notificador = NotificadorDoble()
    /// Reloj fijo que las pruebas mueven a mano.
    private let ahora = Ahora()

    final class Ahora: @unchecked Sendable {
        private let cerrojo = NSLock()
        private var valor = Date(timeIntervalSince1970: 1_800_000_000)
        func leer() -> Date { cerrojo.withLock { valor } }
        func avanzar(_ s: TimeInterval) { cerrojo.withLock { valor = valor.addingTimeInterval(s) } }
    }

    override func setUpWithError() throws {
        raiz = try Temporal.directorio()
        almacen = AlmacenDeColaEnDisco(raiz: raiz)
        enviador = EnviadorDoble()
        sesion = SesionDoble()
        notificador = NotificadorDoble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: raiz)
    }

    private func cola(almacen: AlmacenDeCola? = nil, separacion: Duration = .zero, topeDeFotos: Int = 200 * 1024 * 1024)
        -> ColaDeCapturas
    {
        let reloj = ahora
        return ColaDeCapturas(
            almacen: almacen ?? self.almacen,
            enviador: enviador,
            sesion: sesion,
            notificador: notificador,
            reintento: Reintento(jitter: 0),
            reloj: { reloj.leer() },
            separacion: separacion,
            topeDeFotosBytes: topeDeFotos,
            encogerFoto: { $0 }
        )
    }

    private let cuerpo = CuerpoDeCaptura(comercio: "D1", monto: "45000", fecha: "2026-10-05")
    private let foto = Data(repeating: 0xAB, count: 1024)

    // MARK: Persistencia

    func testEncolarPersisteYOtraColaSobreElMismoDirectorioLaVe() async throws {
        let id = UUID()
        let c = try await cola().encolar(cuerpo, origen: .wallet, foto: foto, id: id)
        XCTAssertEqual(c.request.external_ref, id.uuidString)

        let otra = cola()
        let todas = await otra.todas()
        XCTAssertEqual(todas.map(\.id), [id])
        XCTAssertEqual(todas.first?.request.external_ref, id.uuidString)
        XCTAssertEqual(todas.first?.fotoRelativa, "Fotos/\(id.uuidString).jpg")
        XCTAssertEqual(try almacen.foto(en: "Fotos/\(id.uuidString).jpg"), foto)
    }

    func testUnaEscrituraQueFallaDejaElJSONAnteriorIntegro() throws {
        let id = UUID()
        let original = CapturaPendiente(id: id, origen: .sms, cuerpo: cuerpo)
        try almacen.guardar(original)
        // Lo que había en disco antes del intento (el Date vuelve con milisegundos).
        let enDisco = try almacen.todas()
        XCTAssertEqual(enDisco.map(\.id), [id])
        // Sin permiso de escritura el reemplazo falla a mitad de camino.
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o500], ofItemAtPath: raiz.path(percentEncoded: false))
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o700], ofItemAtPath: raiz.path(percentEncoded: false))
        }
        var cambiada = original
        cambiada.intentos = 9
        XCTAssertThrowsError(try almacen.guardar(cambiada))
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700], ofItemAtPath: raiz.path(percentEncoded: false))
        XCTAssertEqual(try almacen.todas(), enDisco)
    }

    // MARK: Idempotencia

    func testEncolarDosVecesElMismoIdDejaUna() async throws {
        let id = UUID()
        let c = cola()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        try await c.encolar(CuerpoDeCaptura(texto: "otra"), origen: .sms, foto: nil, id: id)
        let todas = await c.todas()
        XCTAssertEqual(todas.count, 1)
        XCTAssertEqual(todas.first?.cuerpo, cuerpo)
    }

    func testProcesarDosVecesMandaUnPostPorCaptura() async throws {
        let c = cola()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        try await c.encolar(cuerpo, origen: .sms, foto: nil)
        await c.procesar()
        await c.procesar()
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(enviador.refsUnicos.count, 2)
    }

    func testRepetidoCuentaComoHecha() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        // El doble contesta repetido:true cuando ya vio el external_ref.
        _ = try await enviador.capturar(CapturaPendiente(id: id, origen: .wallet, cuerpo: cuerpo).request)
        let resumen = await c.procesar()
        XCTAssertEqual(resumen.enviadas, 1)
        guard case .hecha(let r)? = await c.captura(id: id)?.fase else { return XCTFail("no quedó hecha") }
        XCTAssertTrue(r.repetido)
    }

    func testSiElAlmacenMuereTrasLaFase1SeReenviaElMismoRefYLaFotoSubeUnaVez() async throws {
        let frágil = AlmacenQueFalla(real: almacen)
        let c = cola(almacen: frágil)
        let id = UUID()
        try await c.encolar(cuerpo, origen: .iosFoto, foto: foto, id: id)
        frágil.fallarGuardado = true
        enviador.responderFoto(.falla(ErrorDeAPI.sinRed(.notConnectedToInternet)))
        await c.procesar()
        // La fase 1 llegó pero no se pudo anotar: sigue .porEnviar en disco.
        guard case .porEnviar? = await c.captura(id: id)?.fase else { return XCTFail("debería seguir porEnviar") }

        frágil.fallarGuardado = false
        let segunda = cola(almacen: frágil)
        let resumen = await segunda.procesar()
        XCTAssertEqual(resumen.enviadas, 1)
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(enviador.refsUnicos.count, 1)
        XCTAssertEqual(enviador.subidas.filter { $0.transactionId == 100 }.count, 2)
        XCTAssertEqual(Set(enviador.subidas.map(\.nombre)).count, 1)
        XCTAssertEqual(try almacen.bytesDeFotos(), 0)
    }

    // MARK: Reintentos

    func testDosFallosDeRedCrecenLaEsperaYNadaSeEnviaAntesDeTiempo() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)

        enviador.responderCaptura(.falla(ErrorDeAPI.sinRed(.notConnectedToInternet)))
        await c.procesar()
        var captura = await c.captura(id: id)
        XCTAssertEqual(captura?.intentos, 1)
        XCTAssertEqual(captura?.proximoIntento, ahora.leer().addingTimeInterval(5))

        // Antes de tiempo no se toca la red.
        ahora.avanzar(4)
        await c.procesar()
        XCTAssertEqual(enviador.requests.count, 1)

        ahora.avanzar(1)
        enviador.responderCaptura(.falla(ErrorDeAPI.tiempoAgotado))
        await c.procesar()
        captura = await c.captura(id: id)
        XCTAssertEqual(captura?.intentos, 2)
        XCTAssertEqual(captura?.proximoIntento, ahora.leer().addingTimeInterval(10))

        ahora.avanzar(10)
        enviador.responderCaptura(.falla(ErrorDeAPI.servidor(status: 503)))
        await c.procesar()
        captura = await c.captura(id: id)
        XCTAssertEqual(captura?.intentos, 3)
        XCTAssertEqual(captura?.proximoIntento, ahora.leer().addingTimeInterval(20))
        XCTAssertEqual(enviador.requests.count, 3)
    }

    func testTopeDeLaEsperaEsUnaHora() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        for _ in 0..<12 {
            enviador.responderCaptura(.falla(ErrorDeAPI.servidor(status: 500)))
            await c.procesar()
            ahora.avanzar(4000)
        }
        let captura = await c.captura(id: id)
        XCTAssertEqual(captura?.intentos, 12)
        XCTAssertEqual(captura?.proximoIntento, ahora.leer().addingTimeInterval(3600 - 4000))
    }

    func testLos429Y5xxY408SonReintentables() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        for status in [429, 503, 408] {
            enviador.responderCaptura(.falla(ErrorDeAPI.servidor(status: status)))
            await c.procesar()
            guard case .porEnviar? = await c.captura(id: id)?.fase else {
                return XCTFail("\(status) debería seguir porEnviar")
            }
            ahora.avanzar(4000)
        }
        XCTAssertEqual(notificador.fallos, [])
    }

    func testUn401RenuevaUnaVezYReintentaDeInmediato() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        enviador.responderCaptura(.falla(ErrorDeAPI.noAutenticado))
        let resumen = await c.procesar()
        XCTAssertEqual(sesion.renovaciones, 1)
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(resumen.enviadas, 1)
    }

    func testSiSigue401EsperaSesionSinCrecerLaEsperaYSesionVolvioLaDevuelve() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        enviador.responderCaptura(.falla(ErrorDeAPI.noAutenticado))
        enviador.responderCaptura(.falla(ErrorDeAPI.noAutenticado))
        await c.procesar()
        var captura = await c.captura(id: id)
        XCTAssertEqual(captura?.fase, .esperandoSesion)
        XCTAssertEqual(captura?.intentos, 0)
        XCTAssertEqual(sesion.renovaciones, 1)

        await c.procesar()
        XCTAssertEqual(enviador.requests.count, 2, "esperando sesión no se reenvía")

        await c.sesionVolvio()
        captura = await c.captura(id: id)
        XCTAssertEqual(captura?.fase, .porEnviar)
        let resumen = await c.procesar()
        XCTAssertEqual(resumen.enviadas, 1)
    }

    func testUn422QuedaFallidaConMensajeYSinMasIntentos() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: id)
        enviador.responderCaptura(
            .falla(ErrorDeAPI.rechazada(status: 422, code: "VALIDATION", mensaje: "Falta el texto")))
        let resumen = await c.procesar()
        XCTAssertEqual(resumen.fallidas, 1)
        let fase422 = await c.captura(id: id)?.fase
        XCTAssertEqual(fase422, .fallida(motivo: "Falta el texto"))
        XCTAssertEqual(notificador.fallos, ["Falta el texto"])
        await c.procesar()
        XCTAssertEqual(enviador.requests.count, 1)
        // Sigue en disco: nada se pierde.
        XCTAssertEqual(try almacen.todas().count, 1)
    }

    // MARK: Orden y ritmo

    func testFIFOPorCreadaEn() async throws {
        let c = cola()
        let base = ahora.leer()
        let tercera = UUID()
        let primera = UUID()
        let segunda = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: tercera, capturadaEn: base.addingTimeInterval(30))
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: primera, capturadaEn: base)
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: segunda, capturadaEn: base.addingTimeInterval(10))
        await c.procesar()
        XCTAssertEqual(enviador.requests.map(\.external_ref), [primera, segunda, tercera].map(\.uuidString))
    }

    func testSeparacionDe300msEntreEnvios() async throws {
        let c = cola(separacion: .milliseconds(300))
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        await c.procesar()
        let instantes = enviador.instantes
        XCTAssertEqual(instantes.count, 2)
        XCTAssertGreaterThanOrEqual(instantes[1] - instantes[0], .milliseconds(290))
    }

    // MARK: Dos fases

    func testTrasSubirLaFotoSeBorraDelDisco() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .iosFoto, foto: foto, id: id)
        XCTAssertEqual(try almacen.bytesDeFotos(), foto.count)
        let resumen = await c.procesar()
        XCTAssertEqual(resumen.enviadas, 1)
        XCTAssertEqual(enviador.subidas.count, 1)
        XCTAssertEqual(enviador.subidas.first?.jpeg, foto)
        XCTAssertEqual(enviador.subidas.first?.transactionId, 100)
        XCTAssertEqual(try almacen.bytesDeFotos(), 0)
        let captura = await c.captura(id: id)
        XCTAssertNil(captura?.fotoRelativa)
        guard case .hecha(let r)? = captura?.fase else { return XCTFail() }
        XCTAssertEqual(r.resumen, "Gasto de 45000 en D1")
    }

    func testSiSoportesFallaQuedaPorSubirFotoYElSiguienteIntentoSoloSube() async throws {
        let c = cola()
        let id = UUID()
        try await c.encolar(cuerpo, origen: .iosFoto, foto: foto, id: id)
        enviador.responderFoto(.falla(ErrorDeAPI.servidor(status: 503)))
        await c.procesar()
        let faseTrasFallo = await c.captura(id: id)?.fase
        XCTAssertEqual(faseTrasFallo, .porSubirFoto(transactionId: 100))
        XCTAssertEqual(try almacen.bytesDeFotos(), foto.count)

        ahora.avanzar(10)
        await c.procesar()
        XCTAssertEqual(enviador.requests.count, 1, "la fase 1 no se repite")
        XCTAssertEqual(enviador.subidas.count, 2)
        guard case .hecha? = await c.captura(id: id)?.fase else { return XCTFail() }
    }

    func testConElTopeDeFotosLlenoEncolarConFotoLanzaYSinFotoEntra() async throws {
        let c = cola(topeDeFotos: foto.count + 10)
        try await c.encolar(cuerpo, origen: .iosFoto, foto: foto)
        do {
            try await c.encolar(cuerpo, origen: .iosFoto, foto: foto)
            XCTFail("debería lanzar")
        } catch let e as ErrorDeCola {
            XCTAssertEqual(e, .fotosLlenas)
        }
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        let cuantas = await c.todas().count
        XCTAssertEqual(cuantas, 2)
    }

    // MARK: Limpieza y estado

    func testPurgaLasHechasDeMasDe30Dias() async throws {
        let c = cola()
        let vieja = UUID()
        let reciente = UUID()
        let pendiente = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: vieja)
        await c.procesar()
        ahora.avanzar(31 * 86_400)
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: reciente)
        await c.procesar()
        enviador.responderCaptura(.falla(ErrorDeAPI.sinRed(.notConnectedToInternet)))
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: pendiente)
        await c.procesar()
        await c.purgar()
        let quedan = Set(await c.todas().map(\.id))
        XCTAssertEqual(quedan, [reciente, pendiente])
    }

    func testCambiosPublicaLaColaTrasCadaTransicionYLaInsigniaLlevaLosPendientes() async throws {
        let c = cola()
        var pendientesVistos: [Int] = []
        let lector = Task {
            for await lista in c.cambios {
                pendientesVistos.append(lista.filter(\.estaPendiente).count)
                if pendientesVistos.count == 2 { break }
            }
        }
        enviador.responderCaptura(.falla(ErrorDeAPI.sinRed(.notConnectedToInternet)))
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        await c.procesar()
        // La publicación va por un buffer de uno; se da tiempo al lector.
        try await Task.sleep(for: .milliseconds(50))
        await c.procesar()
        await lector.value
        XCTAssertEqual(pendientesVistos.first, 1)
        XCTAssertEqual(notificador.insignias.first, 1)
        let pendientesAntes = await c.pendientes()
        XCTAssertEqual(pendientesAntes, 1)

        ahora.avanzar(10)
        await c.procesar()
        XCTAssertEqual(notificador.insignias.last, 0)
        let pendientesDespues = await c.pendientes()
        XCTAssertEqual(pendientesDespues, 0)
    }

    func testAvisaCuandoSeEnvianCapturasQueEstabanEnCola() async throws {
        let c = cola()
        enviador.responderCaptura(.falla(ErrorDeAPI.sinRed(.notConnectedToInternet)))
        try await c.encolar(cuerpo, origen: .wallet, foto: nil)
        await c.procesar()
        XCTAssertEqual(notificador.colasEnviadas, [])
        ahora.avanzar(10)
        await c.procesar()
        XCTAssertEqual(notificador.colasEnviadas, [1])
        XCTAssertEqual(notificador.registradas.count, 1)
    }

    func testEditarSoloFallidasOPorEnviarYDescartarBorraLaFoto() async throws {
        let c = cola()
        let hecha = UUID()
        let conFoto = UUID()
        try await c.encolar(cuerpo, origen: .wallet, foto: nil, id: hecha)
        await c.procesar()
        do {
            try await c.editar(id: hecha, cuerpo: CuerpoDeCaptura(texto: "x"))
            XCTFail("una hecha no se edita")
        } catch let e as ErrorDeCola {
            XCTAssertEqual(e, .noEditable(hecha))
        }
        try await c.encolar(cuerpo, origen: .iosFoto, foto: foto, id: conFoto)
        try await c.editar(id: conFoto, cuerpo: CuerpoDeCaptura(texto: "editada"))
        let textoEditado = await c.captura(id: conFoto)?.cuerpo.texto
        XCTAssertEqual(textoEditado, "editada")
        try await c.descartar(id: conFoto)
        let descartada = await c.captura(id: conFoto)
        XCTAssertNil(descartada)
        XCTAssertEqual(try almacen.bytesDeFotos(), 0)
    }
}
