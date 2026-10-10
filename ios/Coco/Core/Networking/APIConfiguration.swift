import Foundation

/// Which API the app talks to. The base comes from `CocoAPIBaseURL` in Info.plist and
/// can be overridden from Settings (UserDefaults) to point to the local API.
struct APIConfiguration: Sendable, Equatable {
    static let defaultsKey = "api-base-url"
    static let plistKey = "CocoAPIBaseURL"

    /// Without `/api/v2` and without a trailing slash.
    let base: URL

    init(base: URL) {
        // The trailing slash is removed so that `apiV2` never gives `//api/v2`.
        var text = base.absoluteString
        while text.hasSuffix("/") { text.removeLast() }
        self.base = URL(string: text) ?? base
    }

    var apiV2: URL { base.appending(path: "api/v2") }

    /// The UserDefaults override wins; if there is none, the plist; if not even that, the
    /// local API, so that the app never starts without a destination.
    static func current(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> APIConfiguration {
        if let text = defaults.string(forKey: defaultsKey), let url = URL(string: text), url.host() != nil {
            return APIConfiguration(base: url)
        }
        if let text = bundle.object(forInfoDictionaryKey: plistKey) as? String, let url = URL(string: text),
            url.host() != nil
        {
            return APIConfiguration(base: url)
        }
        return APIConfiguration(base: URL(string: "http://localhost:3000") ?? URL(fileURLWithPath: "/"))
    }

    static func save(base: URL, defaults: UserDefaults = .standard) {
        defaults.set(APIConfiguration(base: base).base.absoluteString, forKey: defaultsKey)
    }

    static func reset(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: defaultsKey)
    }
}
