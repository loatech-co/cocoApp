import BackgroundTasks
import SwiftUI
import UserNotifications

/// La app del teléfono.
///
/// Es un capturador delgado con la web dentro: lo que se puede hacer con una
/// mano en diez segundos —anotar un gasto, fotografiar un recibo, recibir lo
/// que Wallet o un SMS traen— es nativo; todo lo demás es la misma web, en un
/// `WKWebView`, con la misma sesión. Cada pantalla existe una sola vez.
@main
struct CocoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var phase

    private let d: Dependencies

    init() {
        // Compone todo —y registra intents y tareas de fondo— antes de que
        // termine el arranque, que es cuando iOS lo exige.
        d = Dependencies.shared
        AppLog.app.info("Coco \(Brand.version, privacy: .public) arrancando")
    }

    var body: some Scene {
        WindowGroup {
            RootView(d: d)
                .onOpenURL { url in
                    AppLog.navigation.info("onOpenURL \(url.absoluteString, privacy: .public)")
                    d.router.open(url: url)
                }
        }
        .onChange(of: phase) { _, newPhase in
            switch newPhase {
            case .active:
                d.returnedToForeground()
            case .background:
                BackgroundJobs.schedule()
            case .inactive:
                break
            @unknown default:
                break
            }
        }
    }
}

/// Lo que SwiftUI no cubre: ser el delegado de las notificaciones para
/// enseñarlas con la app abierta y llevar al destino al tocarlas.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // `nonisolated`: el centro de notificaciones llama desde su propio hilo y
    // lo que entrega no es `Sendable`; aquí solo se mira la URL de destino.
    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, willPresent notification: UNNotification
    ) async
        -> UNNotificationPresentationOptions
    {
        [.banner, .sound, .badge]
    }

    nonisolated func userNotificationCenter(
        _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
    ) async {
        guard let url = URL(string: SystemNotifier.captureDestination) else { return }
        await MainActor.run {
            _ = Dependencies.shared.router.open(url: url)
        }
    }
}
