import Foundation
import Observation

/// The four tabs of the native bar. Home is the web; the other three
/// are native screens.
enum AppTab: Hashable, CaseIterable {
    case home
    case register
    case captures
    case more
}

/// What rises as a sheet on top of the active tab.
enum Sheet: Identifiable, Equatable {
    case welcome
    case settings

    var id: String {
        switch self {
        case .welcome: "welcome"
        case .settings: "settings"
        }
    }
}

/// The ONLY source of the active tab and sheet. It is used by the intents, the
/// notifications, the `coco://` URLs and the bridge with the web. If there is no
/// session, `RootView` covers everything with `SignInView` and the destination stays set
/// for when the user signs in.
@Observable @MainActor
final class Router: Navigation {
    /// Each request to open the form (deep link, intent, bridge) is a
    /// new generation: the view is recreated clean, and with the camera if it was asked for.
    struct FormRequest: Equatable, Sendable {
        let generation: Int
        let withCamera: Bool
    }

    var tab: AppTab = .home
    var sheet: Sheet?
    /// Route the Home tab has to open in the web as soon as it is shown.
    var pendingWebPath: String?
    /// The web has to open its search sheet as soon as it is shown.
    var searchPending = false
    private(set) var formRequest = FormRequest(generation: 0, withCamera: false)

    func go(_ destination: Destination) {
        AppLog.navigation.info("ir \(String(describing: destination), privacy: .public)")
        switch destination {
        case .quickForm(let withCamera):
            formRequest = FormRequest(generation: formRequest.generation + 1, withCamera: withCamera)
            sheet = nil
            tab = .register
        case .captures:
            sheet = nil
            tab = .captures
        case .web(let path):
            sheet = nil
            pendingWebPath = path
            tab = .home
        case .search:
            sheet = nil
            searchPending = true
            tab = .home
        case .welcome:
            sheet = .welcome
        case .settings:
            sheet = .settings
        }
    }

    /// `coco://capture/manual`, `coco://capture/photo`, `coco://captures`.
    /// Returns `false` if the URL is not the app's.
    @discardableResult
    func open(url: URL) -> Bool {
        guard let destination = Self.destination(from: url) else {
            AppLog.navigation.warning("URL desconocida \(url.absoluteString, privacy: .public)")
            return false
        }
        go(destination)
        return true
    }

    /// Pure: which destination a `coco://` URL names.
    nonisolated static func destination(from url: URL) -> Destination? {
        guard url.scheme?.lowercased() == "coco" else { return nil }
        let host = url.host()?.lowercased() ?? ""
        let segments = url.path().split(separator: "/").map { $0.lowercased() }
        guard segments.count <= 1 else { return nil }
        switch (host, segments.first) {
        case ("capture", nil), ("capture", "manual"?):
            return .quickForm(withCamera: false)
        case ("capture", "photo"?):
            return .quickForm(withCamera: true)
        case ("captures", nil):
            return .captures
        default:
            return nil
        }
    }
}
