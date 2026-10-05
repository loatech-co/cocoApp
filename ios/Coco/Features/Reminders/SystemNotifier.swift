import Foundation
import UserNotifications

/// Lo que el notificador necesita del centro de notificaciones: así se prueba
/// con un centro falso, porque `UNUserNotificationCenter` no se puede crear.
protocol NotificationCenterClient: Sendable {
    func pedirAutorizacion() async throws -> Bool
    func register(categories: Set<UNNotificationCategory>)
    func anadir(_ request: UNNotificationRequest) async throws
    func quitarPendientes(ids: [String])
    func pending() async -> [UNNotificationRequest]
    func setBadge(_ n: Int) async throws
}

extension UNUserNotificationCenter: NotificationCenterClient {
    func pedirAutorizacion() async throws -> Bool {
        try await requestAuthorization(options: [.alert, .sound, .badge])
    }
    func register(categories: Set<UNNotificationCategory>) { setNotificationCategories(categories) }
    func anadir(_ request: UNNotificationRequest) async throws { try await add(request) }
    func quitarPendientes(ids: [String]) { removePendingNotificationRequests(withIdentifiers: ids) }
    func pending() async -> [UNNotificationRequest] { await pendingNotificationRequests() }
    func setBadge(_ n: Int) async throws { try await setBadgeCount(n) }
}

/// Avisos locales. Solo locales: el equipo personal no permite APNs y no hace
/// falta, todo lo que hay que contar pasa en el propio teléfono.
struct SystemNotifier: Notifier {
    static let idDeVencimiento = "firma-vence"
    static let categoriaDeCaptura = "captura"
    static let accionAbrir = "abrir"
    /// A dónde lleva el aviso de una captura; lo lee el enrutador.
    static let destinoDeCaptura = "coco://capturas"

    let centro: NotificationCenterClient
    let clock: @Sendable () -> Date

    init(
        centro: NotificationCenterClient = UNUserNotificationCenter.current(),
        clock: @Sendable @escaping () -> Date = { Date() }
    ) {
        self.centro = centro
        self.clock = clock
    }

    /// Puro: lo que se lee de reojo. El resumen lo escribe la API.
    static func textoDeCaptura(_ r: SavedResult) -> (title: String, body: String) {
        let title: String
        if r.duplicate {
            title = "Ya estaba registrado"
        } else if r.merged {
            title = "Era el mismo pago"
        } else {
            title = "Gasto registrado"
        }
        let body = r.needsReview ? "\(r.summary) · por revisar" : r.summary
        return (title, body)
    }

    func requestPermission() async -> Bool {
        let abrir = UNNotificationAction(identifier: Self.accionAbrir, title: "Abrir", options: [.foreground])
        centro.register(categories: [
            UNNotificationCategory(identifier: Self.categoriaDeCaptura, actions: [abrir], intentIdentifiers: [])
        ])
        return (try? await centro.pedirAutorizacion()) ?? false
    }

    func captureSaved(_ r: SavedResult, source: CaptureSource) async {
        let text = Self.textoDeCaptura(r)
        await mostrar(
            id: "captura-\(r.transactionId)", title: text.title, body: text.body,
            categoria: Self.categoriaDeCaptura)
    }

    func captureFailed(reason: String) async {
        await mostrar(
            id: "captura-fallida-\(UUID().uuidString)", title: "No se pudo registrar", body: reason,
            categoria: Self.categoriaDeCaptura)
    }

    func queueSent(count: Int) async {
        guard count > 0 else { return }
        let body = count == 1 ? "Se envió 1 captura pendiente" : "Se enviaron \(count) capturas pendientes"
        await mostrar(
            id: "cola-enviada", title: "Capturas enviadas", body: body, categoria: Self.categoriaDeCaptura)
    }

    /// Un solo aviso con id fijo: programarlo dos veces lo reemplaza.
    func scheduleExpiry(_ expiresAt: Date, text: String) async {
        centro.quitarPendientes(ids: [Self.idDeVencimiento])
        let now = clock()
        guard let momento = ExpiryReminder.momentoDelAviso(expiresAt: expiresAt, now: now) else { return }
        let contenido = UNMutableNotificationContent()
        contenido.title = ExpiryReminder.text(expiresAt: expiresAt, now: momento).title
        contenido.body = text
        contenido.sound = .default
        let parts = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: momento)
        let disparador = UNCalendarNotificationTrigger(dateMatching: parts, repeats: false)
        try? await centro.anadir(
            UNNotificationRequest(identifier: Self.idDeVencimiento, content: contenido, trigger: disparador))
    }

    func setBadge(_ n: Int) async {
        try? await centro.setBadge(max(0, n))
    }

    private func mostrar(id: String, title: String, body: String, categoria: String) async {
        let contenido = UNMutableNotificationContent()
        contenido.title = title
        contenido.body = body
        contenido.sound = .default
        contenido.categoryIdentifier = categoria
        contenido.userInfo = ["destino": Self.destinoDeCaptura]
        try? await centro.anadir(UNNotificationRequest(identifier: id, content: contenido, trigger: nil))
    }
}
