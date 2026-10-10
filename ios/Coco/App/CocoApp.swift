import BackgroundTasks
import SwiftUI
import UserNotifications

/// The phone app.
///
/// It is a thin capturer with the web inside: what can be done with one
/// hand in ten seconds —jotting down an expense, photographing a receipt,
/// receiving what Wallet or an SMS brings— is native; everything else is the
/// same web, in a `WKWebView`, with the same session. Each screen exists only once.
@main
struct CocoApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @Environment(\.scenePhase) private var phase

    private let d: Dependencies

    init() {
        // Composes everything —and registers intents and background tasks—
        // before launch finishes, which is when iOS demands it.
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

/// What SwiftUI does not cover: being the notification delegate, to
/// show them with the app open and go to the destination when tapped.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    // `nonisolated`: the notification center calls from its own thread and
    // what it hands over is not `Sendable`; here only the destination URL is looked at.
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
