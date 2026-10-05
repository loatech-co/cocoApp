import Foundation
import UserNotifications

/// Lo que el notificador necesita del centro de notificaciones: así se prueba
/// con un centro falso, porque `UNUserNotificationCenter` no se puede crear.
protocol CentroDeNotificaciones: Sendable {
    func pedirAutorizacion() async throws -> Bool
    func registrar(categorias: Set<UNNotificationCategory>)
    func anadir(_ peticion: UNNotificationRequest) async throws
    func quitarPendientes(ids: [String])
    func pendientes() async -> [UNNotificationRequest]
    func ponerInsignia(_ n: Int) async throws
}

extension UNUserNotificationCenter: CentroDeNotificaciones {
    func pedirAutorizacion() async throws -> Bool {
        try await requestAuthorization(options: [.alert, .sound, .badge])
    }
    func registrar(categorias: Set<UNNotificationCategory>) { setNotificationCategories(categorias) }
    func anadir(_ peticion: UNNotificationRequest) async throws { try await add(peticion) }
    func quitarPendientes(ids: [String]) { removePendingNotificationRequests(withIdentifiers: ids) }
    func pendientes() async -> [UNNotificationRequest] { await pendingNotificationRequests() }
    func ponerInsignia(_ n: Int) async throws { try await setBadgeCount(n) }
}

/// Avisos locales. Solo locales: el equipo personal no permite APNs y no hace
/// falta, todo lo que hay que contar pasa en el propio teléfono.
struct NotificadorDelSistema: Notificador {
    static let idDeVencimiento = "firma-vence"
    static let categoriaDeCaptura = "captura"
    static let accionAbrir = "abrir"
    /// A dónde lleva el aviso de una captura; lo lee el enrutador.
    static let destinoDeCaptura = "coco://capturas"

    let centro: CentroDeNotificaciones
    let reloj: @Sendable () -> Date

    init(centro: CentroDeNotificaciones = UNUserNotificationCenter.current(), reloj: @Sendable @escaping () -> Date = { Date() }) {
        self.centro = centro
        self.reloj = reloj
    }

    /// Puro: lo que se lee de reojo. El resumen lo escribe la API.
    static func textoDeCaptura(_ r: ResultadoGuardado) -> (titulo: String, cuerpo: String) {
        let titulo: String
        if r.repetido {
            titulo = "Ya estaba registrado"
        } else if r.fusionado {
            titulo = "Era el mismo pago"
        } else {
            titulo = "Gasto registrado"
        }
        let cuerpo = r.porRevisar ? "\(r.resumen) · por revisar" : r.resumen
        return (titulo, cuerpo)
    }

    func pedirPermiso() async -> Bool {
        let abrir = UNNotificationAction(identifier: Self.accionAbrir, title: "Abrir", options: [.foreground])
        centro.registrar(categorias: [UNNotificationCategory(identifier: Self.categoriaDeCaptura, actions: [abrir], intentIdentifiers: [])])
        return (try? await centro.pedirAutorizacion()) ?? false
    }

    func capturaRegistrada(_ r: ResultadoGuardado, origen: OrigenDeCaptura) async {
        let texto = Self.textoDeCaptura(r)
        await mostrar(id: "captura-\(r.transactionId)", titulo: texto.titulo, cuerpo: texto.cuerpo, categoria: Self.categoriaDeCaptura)
    }

    func capturaFallida(motivo: String) async {
        await mostrar(id: "captura-fallida-\(UUID().uuidString)", titulo: "No se pudo registrar", cuerpo: motivo, categoria: Self.categoriaDeCaptura)
    }

    func colaEnviada(cuantas: Int) async {
        guard cuantas > 0 else { return }
        let cuerpo = cuantas == 1 ? "Se envió 1 captura pendiente" : "Se enviaron \(cuantas) capturas pendientes"
        await mostrar(id: "cola-enviada", titulo: "Capturas enviadas", cuerpo: cuerpo, categoria: Self.categoriaDeCaptura)
    }

    /// Un solo aviso con id fijo: programarlo dos veces lo reemplaza.
    func programarVencimiento(_ vence: Date, texto: String) async {
        centro.quitarPendientes(ids: [Self.idDeVencimiento])
        let ahora = reloj()
        guard let momento = AvisoDeVencimiento.momentoDelAviso(vence: vence, ahora: ahora) else { return }
        let contenido = UNMutableNotificationContent()
        contenido.title = AvisoDeVencimiento.texto(vence: vence, ahora: momento).titulo
        contenido.body = texto
        contenido.sound = .default
        let partes = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: momento)
        let disparador = UNCalendarNotificationTrigger(dateMatching: partes, repeats: false)
        try? await centro.anadir(UNNotificationRequest(identifier: Self.idDeVencimiento, content: contenido, trigger: disparador))
    }

    func ponerInsignia(_ n: Int) async {
        try? await centro.ponerInsignia(max(0, n))
    }

    private func mostrar(id: String, titulo: String, cuerpo: String, categoria: String) async {
        let contenido = UNMutableNotificationContent()
        contenido.title = titulo
        contenido.body = cuerpo
        contenido.sound = .default
        contenido.categoryIdentifier = categoria
        contenido.userInfo = ["destino": Self.destinoDeCaptura]
        try? await centro.anadir(UNNotificationRequest(identifier: id, content: contenido, trigger: nil))
    }
}
