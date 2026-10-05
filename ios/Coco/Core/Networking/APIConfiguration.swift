import Foundation

/// A qué API habla la app. La base sale de `CocoAPIBaseURL` en Info.plist y
/// se puede pisar desde Ajustes (UserDefaults) para apuntar a la API local.
struct APIConfiguration: Sendable, Equatable {
    static let defaultsKey = "api-base-url"
    static let plistKey = "CocoAPIBaseURL"

    /// Sin `/api/v2` y sin barra final.
    let base: URL

    init(base: URL) {
        // Se quita la barra final para que `apiV2` nunca dé `//api/v2`.
        var text = base.absoluteString
        while text.hasSuffix("/") { text.removeLast() }
        self.base = URL(string: text) ?? base
    }

    var apiV2: URL { base.appending(path: "api/v2") }

    /// El override de UserDefaults manda; si no hay, el plist; si ni eso, la
    /// de desarrollo, para que la app nunca arranque sin destino.
    static func current(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> APIConfiguration {
        if let text = defaults.string(forKey: defaultsKey), let url = URL(string: text), url.host() != nil {
            return APIConfiguration(base: url)
        }
        if let text = bundle.object(forInfoDictionaryKey: plistKey) as? String, let url = URL(string: text),
            url.host() != nil
        {
            return APIConfiguration(base: url)
        }
        return APIConfiguration(base: URL(string: "https://dev-cocoapp.viteri.me") ?? URL(fileURLWithPath: "/"))
    }

    static func save(base: URL, defaults: UserDefaults = .standard) {
        defaults.set(APIConfiguration(base: base).base.absoluteString, forKey: defaultsKey)
    }

    static func reset(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: defaultsKey)
    }
}
