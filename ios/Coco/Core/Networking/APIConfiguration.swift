import Foundation

/// A qué API habla la app. La base sale de `CocoAPIBaseURL` en Info.plist y
/// se puede pisar desde Ajustes (UserDefaults) para apuntar a la API local.
struct APIConfiguration: Sendable, Equatable {
    static let claveDeDefaults = "api-base-url"
    static let claveDelPlist = "CocoAPIBaseURL"

    /// Sin `/api/v1` y sin barra final.
    let base: URL

    init(base: URL) {
        // Se quita la barra final para que `apiV1` nunca dé `//api/v1`.
        var texto = base.absoluteString
        while texto.hasSuffix("/") { texto.removeLast() }
        self.base = URL(string: texto) ?? base
    }

    var apiV1: URL { base.appending(path: "api/v1") }

    /// El override de UserDefaults manda; si no hay, el plist; si ni eso, la
    /// de desarrollo, para que la app nunca arranque sin destino.
    static func actual(bundle: Bundle = .main, defaults: UserDefaults = .standard) -> APIConfiguration {
        if let texto = defaults.string(forKey: claveDeDefaults), let url = URL(string: texto), url.host() != nil {
            return APIConfiguration(base: url)
        }
        if let texto = bundle.object(forInfoDictionaryKey: claveDelPlist) as? String, let url = URL(string: texto),
            url.host() != nil
        {
            return APIConfiguration(base: url)
        }
        return APIConfiguration(base: URL(string: "https://dev-cocoapp.viteri.me") ?? URL(fileURLWithPath: "/"))
    }

    static func guardar(base: URL, defaults: UserDefaults = .standard) {
        defaults.set(APIConfiguration(base: base).base.absoluteString, forKey: claveDeDefaults)
    }

    static func restablecer(defaults: UserDefaults = .standard) {
        defaults.removeObject(forKey: claveDeDefaults)
    }
}
