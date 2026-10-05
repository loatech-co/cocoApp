import XCTest

@testable import Coco

final class CaptureQueueTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var almacen: DiskQueueStore = .init(root: URL(fileURLWithPath: "/"))
    private var enviador = SenderDouble()
    private var session = SessionDouble()
    private var notifier = NotifierDouble()
    /// Reloj fijo que las pruebas mueven a mano.
    private let now = ControlledNow()

    final class ControlledNow: @unchecked Sendable {
        private let lock = NSLock()
        private var value = Date(timeIntervalSince1970: 1_800_000_000)
        func read() -> Date { lock.withLock { value } }
        func avanzar(_ s: TimeInterval) { lock.withLock { value = value.addingTimeInterval(s) } }
    }

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directorio()
        almacen = DiskQueueStore(root: root)
        enviador = SenderDouble()
        session = SessionDouble()
        notifier = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func queue(almacen: QueueStore? = nil, separacion: Duration = .zero, topeDeFotos: Int = 200 * 1024 * 1024)
        -> CaptureQueue
    {
        let reloj = now
        return CaptureQueue(
            almacen: almacen ?? self.almacen,
            enviador: enviador,
            session: session,
            notifier: notifier,
            reintento: Retry(jitter: 0),
            reloj: { reloj.read() },
            separacion: separacion,
            topeDeFotosBytes: topeDeFotos,
            encogerFoto: { $0 }
        )
    }

    private let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")
    private let photo = Data(repeating: 0xAB, count: 1024)

    // MARK: Persistencia

    func testEncolarPersisteYOtraColaSobreElMismoDirectorioLaVe() async throws {
        let id = UUID()
        let c = try await queue().encolar(body, source: .wallet, photo: photo, id: id)
        XCTAssertEqual(c.request.externalRef, id.uuidString)

        let otra = queue()
        let all = await otra.all()
        XCTAssertEqual(all.map(\.id), [id])
        XCTAssertEqual(all.first?.request.externalRef, id.uuidString)
        XCTAssertEqual(all.first?.fotoRelativa, "Fotos/\(id.uuidString).jpg")
        XCTAssertEqual(try almacen.photo(at: "Fotos/\(id.uuidString).jpg"), photo)
    }

    func testUnaEscrituraQueFallaDejaElJSONAnteriorIntegro() throws {
        let id = UUID()
        let original = PendingCapture(id: id, source: .sms, body: body)
        try almacen.save(original)
        // Lo que había en disco antes del intento (el Date vuelve con milisegundos).
        let enDisco = try almacen.all()
        XCTAssertEqual(enDisco.map(\.id), [id])
        // Sin permiso de escritura el reemplazo falla a mitad de camino.
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o500], ofItemAtPath: root.path(percentEncoded: false))
        defer {
            try? FileManager.default.setAttributes(
                [.posixPermissions: 0o700], ofItemAtPath: root.path(percentEncoded: false))
        }
        var cambiada = original
        cambiada.intentos = 9
        XCTAssertThrowsError(try almacen.save(cambiada))
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o700], ofItemAtPath: root.path(percentEncoded: false))
        XCTAssertEqual(try almacen.all(), enDisco)
    }

    // MARK: Idempotencia

    func testEncolarDosVecesElMismoIdDejaUna() async throws {
        let id = UUID()
        let c = queue()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        try await c.encolar(CaptureBody(text: "otra"), source: .sms, photo: nil, id: id)
        let all = await c.all()
        XCTAssertEqual(all.count, 1)
        XCTAssertEqual(all.first?.body, body)
    }

    func testProcesarDosVecesMandaUnPostPorCaptura() async throws {
        let c = queue()
        try await c.encolar(body, source: .wallet, photo: nil)
        try await c.encolar(body, source: .sms, photo: nil)
        await c.process()
        await c.process()
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(enviador.refsUnicos.count, 2)
    }

    func testRepetidoCuentaComoHecha() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        // El doble contesta repetido:true cuando ya vio el external_ref.
        _ = try await enviador.capture(PendingCapture(id: id, source: .wallet, body: body).request)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
        guard case .hecha(let r)? = await c.capture(id: id)?.fase else { return XCTFail("no quedó hecha") }
        XCTAssertTrue(r.duplicate)
    }

    func testSiElAlmacenMuereTrasLaFase1SeReenviaElMismoRefYLaFotoSubeUnaVez() async throws {
        let fragile = FailingStore(real: almacen)
        let c = queue(almacen: fragile)
        let id = UUID()
        try await c.encolar(body, source: .iosPhoto, photo: photo, id: id)
        fragile.fallarGuardado = true
        enviador.responderFoto(.falla(APIError.noNetwork(.notConnectedToInternet)))
        await c.process()
        // La fase 1 llegó pero no se pudo anotar: sigue .porEnviar en disco.
        guard case .porEnviar? = await c.capture(id: id)?.fase else { return XCTFail("debería seguir porEnviar") }

        fragile.fallarGuardado = false
        let segunda = queue(almacen: fragile)
        let summary = await segunda.process()
        XCTAssertEqual(summary.sent, 1)
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(enviador.refsUnicos.count, 1)
        XCTAssertEqual(enviador.subidas.filter { $0.transactionId == 100 }.count, 2)
        XCTAssertEqual(Set(enviador.subidas.map(\.name)).count, 1)
        XCTAssertEqual(try almacen.photoBytes(), 0)
    }

    // MARK: Reintentos

    func testDosFallosDeRedCrecenLaEsperaYNadaSeEnviaAntesDeTiempo() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)

        enviador.responderCaptura(.falla(APIError.noNetwork(.notConnectedToInternet)))
        await c.process()
        var capture = await c.capture(id: id)
        XCTAssertEqual(capture?.intentos, 1)
        XCTAssertEqual(capture?.proximoIntento, now.read().addingTimeInterval(5))

        // Antes de tiempo no se toca la red.
        now.avanzar(4)
        await c.process()
        XCTAssertEqual(enviador.requests.count, 1)

        now.avanzar(1)
        enviador.responderCaptura(.falla(APIError.timedOut))
        await c.process()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.intentos, 2)
        XCTAssertEqual(capture?.proximoIntento, now.read().addingTimeInterval(10))

        now.avanzar(10)
        enviador.responderCaptura(.falla(APIError.server(status: 503)))
        await c.process()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.intentos, 3)
        XCTAssertEqual(capture?.proximoIntento, now.read().addingTimeInterval(20))
        XCTAssertEqual(enviador.requests.count, 3)
    }

    func testTopeDeLaEsperaEsUnaHora() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        for _ in 0..<12 {
            enviador.responderCaptura(.falla(APIError.server(status: 500)))
            await c.process()
            now.avanzar(4000)
        }
        let capture = await c.capture(id: id)
        XCTAssertEqual(capture?.intentos, 12)
        XCTAssertEqual(capture?.proximoIntento, now.read().addingTimeInterval(3600 - 4000))
    }

    func testLos429Y5xxY408SonReintentables() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        for status in [429, 503, 408] {
            enviador.responderCaptura(.falla(APIError.server(status: status)))
            await c.process()
            guard case .porEnviar? = await c.capture(id: id)?.fase else {
                return XCTFail("\(status) debería seguir porEnviar")
            }
            now.avanzar(4000)
        }
        XCTAssertEqual(notifier.fallos, [])
    }

    func testUn401RenuevaUnaVezYReintentaDeInmediato() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        enviador.responderCaptura(.falla(APIError.unauthenticated))
        let summary = await c.process()
        XCTAssertEqual(session.renovaciones, 1)
        XCTAssertEqual(enviador.requests.count, 2)
        XCTAssertEqual(summary.sent, 1)
    }

    func testSiSigue401EsperaSesionSinCrecerLaEsperaYSesionVolvioLaDevuelve() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        enviador.responderCaptura(.falla(APIError.unauthenticated))
        enviador.responderCaptura(.falla(APIError.unauthenticated))
        await c.process()
        var capture = await c.capture(id: id)
        XCTAssertEqual(capture?.fase, .esperandoSesion)
        XCTAssertEqual(capture?.intentos, 0)
        XCTAssertEqual(session.renovaciones, 1)

        await c.process()
        XCTAssertEqual(enviador.requests.count, 2, "esperando sesión no se reenvía")

        await c.sesionVolvio()
        capture = await c.capture(id: id)
        XCTAssertEqual(capture?.fase, .porEnviar)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
    }

    func testUn422QuedaFallidaConMensajeYSinMasIntentos() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: id)
        enviador.responderCaptura(
            .falla(APIError.rejected(status: 422, code: "VALIDATION", message: "Falta el texto")))
        let summary = await c.process()
        XCTAssertEqual(summary.fallidas, 1)
        let fase422 = await c.capture(id: id)?.fase
        XCTAssertEqual(fase422, .failed(reason: "Falta el texto"))
        XCTAssertEqual(notifier.fallos, ["Falta el texto"])
        await c.process()
        XCTAssertEqual(enviador.requests.count, 1)
        // Sigue en disco: nada se pierde.
        XCTAssertEqual(try almacen.all().count, 1)
    }

    // MARK: Orden y ritmo

    func testFIFOPorCreadaEn() async throws {
        let c = queue()
        let base = now.read()
        let tercera = UUID()
        let primera = UUID()
        let segunda = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: tercera, capturadaEn: base.addingTimeInterval(30))
        try await c.encolar(body, source: .wallet, photo: nil, id: primera, capturadaEn: base)
        try await c.encolar(body, source: .wallet, photo: nil, id: segunda, capturadaEn: base.addingTimeInterval(10))
        await c.process()
        XCTAssertEqual(enviador.requests.map(\.externalRef), [primera, segunda, tercera].map(\.uuidString))
    }

    func testSeparacionDe300msEntreEnvios() async throws {
        let c = queue(separacion: .milliseconds(300))
        try await c.encolar(body, source: .wallet, photo: nil)
        try await c.encolar(body, source: .wallet, photo: nil)
        await c.process()
        let instantes = enviador.instantes
        XCTAssertEqual(instantes.count, 2)
        XCTAssertGreaterThanOrEqual(instantes[1] - instantes[0], .milliseconds(290))
    }

    // MARK: Dos fases

    func testTrasSubirLaFotoSeBorraDelDisco() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .iosPhoto, photo: photo, id: id)
        XCTAssertEqual(try almacen.photoBytes(), photo.count)
        let summary = await c.process()
        XCTAssertEqual(summary.sent, 1)
        XCTAssertEqual(enviador.subidas.count, 1)
        XCTAssertEqual(enviador.subidas.first?.jpeg, photo)
        XCTAssertEqual(enviador.subidas.first?.transactionId, 100)
        XCTAssertEqual(try almacen.photoBytes(), 0)
        let capture = await c.capture(id: id)
        XCTAssertNil(capture?.fotoRelativa)
        guard case .hecha(let r)? = capture?.fase else { return XCTFail("la captura no quedó hecha") }
        XCTAssertEqual(r.summary, "Gasto de 45000 en D1")
    }

    func testSiSoportesFallaQuedaPorSubirFotoYElSiguienteIntentoSoloSube() async throws {
        let c = queue()
        let id = UUID()
        try await c.encolar(body, source: .iosPhoto, photo: photo, id: id)
        enviador.responderFoto(.falla(APIError.server(status: 503)))
        await c.process()
        let faseTrasFallo = await c.capture(id: id)?.fase
        XCTAssertEqual(faseTrasFallo, .porSubirFoto(transactionId: 100))
        XCTAssertEqual(try almacen.photoBytes(), photo.count)

        now.avanzar(10)
        await c.process()
        XCTAssertEqual(enviador.requests.count, 1, "la fase 1 no se repite")
        XCTAssertEqual(enviador.subidas.count, 2)
        guard case .hecha? = await c.capture(id: id)?.fase else { return XCTFail("la captura no quedó hecha") }
    }

    func testConElTopeDeFotosLlenoEncolarConFotoLanzaYSinFotoEntra() async throws {
        let c = queue(topeDeFotos: photo.count + 10)
        try await c.encolar(body, source: .iosPhoto, photo: photo)
        do {
            try await c.encolar(body, source: .iosPhoto, photo: photo)
            XCTFail("debería lanzar")
        } catch let e as QueueError {
            XCTAssertEqual(e, .photosFull)
        }
        try await c.encolar(body, source: .wallet, photo: nil)
        let count = await c.all().count
        XCTAssertEqual(count, 2)
    }

    // MARK: Limpieza y estado

    func testPurgaLasHechasDeMasDe30Dias() async throws {
        let c = queue()
        let vieja = UUID()
        let recent = UUID()
        let pendiente = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: vieja)
        await c.process()
        now.avanzar(31 * 86_400)
        try await c.encolar(body, source: .wallet, photo: nil, id: recent)
        await c.process()
        enviador.responderCaptura(.falla(APIError.noNetwork(.notConnectedToInternet)))
        try await c.encolar(body, source: .wallet, photo: nil, id: pendiente)
        await c.process()
        await c.purgar()
        let quedan = Set(await c.all().map(\.id))
        XCTAssertEqual(quedan, [recent, pendiente])
    }

    func testCambiosPublicaLaColaTrasCadaTransicionYLaInsigniaLlevaLosPendientes() async throws {
        let c = queue()
        var pendientesVistos: [Int] = []
        let lector = Task {
            for await lista in c.changes {
                pendientesVistos.append(lista.filter(\.estaPendiente).count)
                if pendientesVistos.count == 2 { break }
            }
        }
        enviador.responderCaptura(.falla(APIError.noNetwork(.notConnectedToInternet)))
        try await c.encolar(body, source: .wallet, photo: nil)
        await c.process()
        // La publicación va por un buffer de uno; se da tiempo al lector.
        try await Task.sleep(for: .milliseconds(50))
        await c.process()
        await lector.value
        XCTAssertEqual(pendientesVistos.first, 1)
        XCTAssertEqual(notifier.insignias.first, 1)
        let pendientesAntes = await c.pending()
        XCTAssertEqual(pendientesAntes, 1)

        now.avanzar(10)
        await c.process()
        XCTAssertEqual(notifier.insignias.last, 0)
        let pendientesDespues = await c.pending()
        XCTAssertEqual(pendientesDespues, 0)
    }

    func testAvisaCuandoSeEnvianCapturasQueEstabanEnCola() async throws {
        let c = queue()
        enviador.responderCaptura(.falla(APIError.noNetwork(.notConnectedToInternet)))
        try await c.encolar(body, source: .wallet, photo: nil)
        await c.process()
        XCTAssertEqual(notifier.colasEnviadas, [])
        now.avanzar(10)
        await c.process()
        XCTAssertEqual(notifier.colasEnviadas, [1])
        XCTAssertEqual(notifier.isRegistered.count, 1)
    }

    func testEditarSoloFallidasOPorEnviarYDescartarBorraLaFoto() async throws {
        let c = queue()
        let hecha = UUID()
        let conFoto = UUID()
        try await c.encolar(body, source: .wallet, photo: nil, id: hecha)
        await c.process()
        do {
            try await c.editar(id: hecha, body: CaptureBody(text: "x"))
            XCTFail("una hecha no se edita")
        } catch let e as QueueError {
            XCTAssertEqual(e, .notEditable(hecha))
        }
        try await c.encolar(body, source: .iosPhoto, photo: photo, id: conFoto)
        try await c.editar(id: conFoto, body: CaptureBody(text: "editada"))
        let textoEditado = await c.capture(id: conFoto)?.body.text
        XCTAssertEqual(textoEditado, "editada")
        try await c.discard(id: conFoto)
        let descartada = await c.capture(id: conFoto)
        XCTAssertNil(descartada)
        XCTAssertEqual(try almacen.photoBytes(), 0)
    }
}
