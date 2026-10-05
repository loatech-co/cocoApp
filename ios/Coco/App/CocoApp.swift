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
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegado
    @Environment(\.scenePhase) private var fase

    private let d: Dependencies

    init() {
        // Compone todo —y registra intents y tareas de fondo— antes de que
        // termine el arranque, que es cuando iOS lo exige.
        d = Dependencies.compartidas
        AppLog.app.info("Coco \(Brand.version, privacy: .public) arrancando")
    }

    var body: some Scene {
        WindowGroup {
            RootView(d: d)
                .onOpenURL { url in
                    AppLog.navigation.info("onOpenURL \(url.absoluteString, privacy: .public)")
                    d.enrutador.abrir(url: url)
                }
        }
        .onChange(of: fase) { _, nueva in
            switch nueva {
            case .active:
                d.volvioAPrimerPlano()
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

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async
        -> UNNotificationPresentationOptions
    {
        [.banner, .sound, .badge]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        guard let url = URL(string: SystemNotifier.destinoDeCaptura) else { return }
        await MainActor.run {
            _ = Dependencies.compartidas.enrutador.abrir(url: url)
        }
    }
}
