import UserNotifications
import XCTest

@testable import Coco

final class FakeNotificationCenter: NotificationCenterClient, @unchecked Sendable {
    private let lock = NSLock()
    private var peticiones: [UNNotificationRequest] = []
    var autorizado = true
    var insignia: Int?

    func pedirAutorizacion() async throws -> Bool { autorizado }
    func register(categories: Set<UNNotificationCategory>) {}
    func anadir(_ request: UNNotificationRequest) async throws {
        save(request)
    }
    /// Como el centro real: el mismo id reemplaza.
    private func save(_ request: UNNotificationRequest) {
        lock.withLock {
            peticiones.removeAll { $0.identifier == request.identifier }
            peticiones.append(request)
        }
    }
    func quitarPendientes(ids: [String]) {
        lock.withLock { peticiones.removeAll { ids.contains($0.identifier) } }
    }
    func pending() async -> [UNNotificationRequest] {
        guardadas()
    }
    private func guardadas() -> [UNNotificationRequest] {
        lock.withLock { peticiones }
    }
    func setBadge(_ n: Int) async throws { insignia = n }
}

final class NotifierTests: XCTestCase {
    private func result(duplicate: Bool = false, merged: Bool = false, needsReview: Bool = false)
        -> SavedResult
    {
        SavedResult(
            transactionId: 42, summary: "Registrado: $45.000 · Mercado", duplicate: duplicate, merged: merged,
            needsReview: needsReview, finishedAt: .now)
    }

    func testTextoDeCaptura() {
        XCTAssertEqual(SystemNotifier.textoDeCaptura(result()).titulo, "Gasto registrado")
        XCTAssertEqual(SystemNotifier.textoDeCaptura(result()).body, "Registrado: $45.000 · Mercado")
        XCTAssertEqual(SystemNotifier.textoDeCaptura(result(duplicate: true)).titulo, "Ya estaba registrado")
        XCTAssertEqual(SystemNotifier.textoDeCaptura(result(merged: true)).titulo, "Era el mismo pago")
        XCTAssertEqual(
            SystemNotifier.textoDeCaptura(result(needsReview: true)).body,
            "Registrado: $45.000 · Mercado · por revisar")
    }

    func testProgramarVencimientoUnaSolaPeticionConIdFijo() async throws {
        let centro = FakeNotificationCenter()
        let now = Date(timeIntervalSince1970: 1_790_000_000)
        let n = SystemNotifier(centro: centro, reloj: { now })
        await n.scheduleExpiry(
            now.addingTimeInterval(5 * 86_400), text: "Vuelve a instalarla desde Xcode con el cable.")
        await n.scheduleExpiry(
            now.addingTimeInterval(3 * 86_400), text: "Vuelve a instalarla desde Xcode con el cable.")
        let pending = await centro.pending()
        XCTAssertEqual(pending.count, 1)
        XCTAssertEqual(pending.first?.identifier, SystemNotifier.idDeVencimiento)
        XCTAssertTrue(pending.first?.trigger is UNCalendarNotificationTrigger)
    }

    func testYaVencidoNoProgramaNada() async {
        let centro = FakeNotificationCenter()
        let now = Date()
        let n = SystemNotifier(centro: centro, reloj: { now })
        await n.scheduleExpiry(now.addingTimeInterval(-60), text: "x")
        let pending = await centro.pending()
        XCTAssertTrue(pending.isEmpty)
    }

    func testCapturaRegistradaLlevaDestinoYColaEnviadaCuenta() async {
        let centro = FakeNotificationCenter()
        let n = SystemNotifier(centro: centro)
        await n.captureSaved(result(), source: .sms)
        await n.queueSent(count: 3)
        await n.queueSent(count: 0)
        let pending = await centro.pending()
        XCTAssertEqual(pending.count, 2)
        XCTAssertEqual(pending.first?.content.userInfo["destino"] as? String, "coco://capturas")
        XCTAssertEqual(pending.last?.content.body, "Se enviaron 3 capturas pendientes")
        await n.setBadge(2)
        XCTAssertEqual(centro.insignia, 2)
    }
}
