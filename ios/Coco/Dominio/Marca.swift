import Foundation

/// Cómo se presenta la app ante la API y ante la web embebida.
enum Marca {
    /// Mismo valor que `USER_AGENT_APP` en @coco/types; una prueba lo vigila.
    static let userAgentApp = "CocoiOS/"

    /// La versión del bundle (`MARKETING_VERSION`). Sin bundle —pruebas
    /// sueltas— vale `0.0.0` en vez de fallar.
    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"
    }

    /// `CocoiOS/0.1.0 (iOS 17.0)`: lo que va en `User-Agent` de cada petición.
    static func userAgent(
        version: String = Marca.version, sistema: String = ProcessInfo.processInfo.operatingSystemVersionString
    ) -> String {
        "\(userAgentApp)\(version) (iOS \(sistema))"
    }
}
