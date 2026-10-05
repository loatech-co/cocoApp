import XCTest
import UserNotifications
@testable import Coco

final class CentroFalso: CentroDeNotificaciones, @unchecked Sendable {
    private let cerrojo = NSLock()
    private var peticiones: [UNNotificationRequest] = []
    var autorizado = true
    var insignia: Int?

    func pedirAutorizacion() async throws -> Bool { autorizado }
    func registrar(categorias: Set<UNNotificationCategory>) {}
    func anadir(_ peticion: UNNotificationRequest) async throws {
        guardar(peticion)
    }
    /// Como el centro real: el mismo id reemplaza.
    private func guardar(_ peticion: UNNotificationRequest) {
        cerrojo.withLock {
            peticiones.removeAll { $0.identifier == peticion.identifier }
            peticiones.append(peticion)
        }
    }
    func quitarPendientes(ids: [String]) {
        cerrojo.withLock { peticiones.removeAll { ids.contains($0.identifier) } }
    }
    func pendientes() async -> [UNNotificationRequest] {
        guardadas()
    }
    private func guardadas() -> [UNNotificationRequest] {
        cerrojo.withLock { peticiones }
    }
    func ponerInsignia(_ n: Int) async throws { insignia = n }
}

final class NotificadorTests: XCTestCase {
    private func resultado(repetido: Bool = false, fusionado: Bool = false, porRevisar: Bool = false) -> ResultadoGuardado {
        ResultadoGuardado(transactionId: 42, resumen: "Registrado: $45.000 · Mercado", repetido: repetido, fusionado: fusionado, porRevisar: porRevisar, terminadaEn: .now)
    }

    func testTextoDeCaptura() {
        XCTAssertEqual(NotificadorDelSistema.textoDeCaptura(resultado()).titulo, "Gasto registrado")
        XCTAssertEqual(NotificadorDelSistema.textoDeCaptura(resultado()).cuerpo, "Registrado: $45.000 · Mercado")
        XCTAssertEqual(NotificadorDelSistema.textoDeCaptura(resultado(repetido: true)).titulo, "Ya estaba registrado")
        XCTAssertEqual(NotificadorDelSistema.textoDeCaptura(resultado(fusionado: true)).titulo, "Era el mismo pago")
        XCTAssertEqual(NotificadorDelSistema.textoDeCaptura(resultado(porRevisar: true)).cuerpo, "Registrado: $45.000 · Mercado · por revisar")
    }

    func testProgramarVencimientoUnaSolaPeticionConIdFijo() async throws {
        let centro = CentroFalso()
        let ahora = Date(timeIntervalSince1970: 1_790_000_000)
        let n = NotificadorDelSistema(centro: centro, reloj: { ahora })
        await n.programarVencimiento(ahora.addingTimeInterval(5 * 86_400), texto: "Vuelve a instalarla desde Xcode con el cable.")
        await n.programarVencimiento(ahora.addingTimeInterval(3 * 86_400), texto: "Vuelve a instalarla desde Xcode con el cable.")
        let pendientes = await centro.pendientes()
        XCTAssertEqual(pendientes.count, 1)
        XCTAssertEqual(pendientes.first?.identifier, NotificadorDelSistema.idDeVencimiento)
        XCTAssertTrue(pendientes.first?.trigger is UNCalendarNotificationTrigger)
    }

    func testYaVencidoNoProgramaNada() async {
        let centro = CentroFalso()
        let ahora = Date()
        let n = NotificadorDelSistema(centro: centro, reloj: { ahora })
        await n.programarVencimiento(ahora.addingTimeInterval(-60), texto: "x")
        let pendientes = await centro.pendientes()
        XCTAssertTrue(pendientes.isEmpty)
    }

    func testCapturaRegistradaLlevaDestinoYColaEnviadaCuenta() async {
        let centro = CentroFalso()
        let n = NotificadorDelSistema(centro: centro)
        await n.capturaRegistrada(resultado(), origen: .sms)
        await n.colaEnviada(cuantas: 3)
        await n.colaEnviada(cuantas: 0)
        let pendientes = await centro.pendientes()
        XCTAssertEqual(pendientes.count, 2)
        XCTAssertEqual(pendientes.first?.content.userInfo["destino"] as? String, "coco://capturas")
        XCTAssertEqual(pendientes.last?.content.body, "Se enviaron 3 capturas pendientes")
        await n.ponerInsignia(2)
        XCTAssertEqual(centro.insignia, 2)
    }
}
