import Foundation

/// How the app presents itself to the API and to the embedded web.
enum Brand {
    /// Same value as `USER_AGENT_APP` in `frontend/src/shared/lib/native-contract.ts`; a test watches it.
    static let userAgentApp = "CocoiOS/"

    /// The bundle version (`MARKETING_VERSION`). Without a bundle —standalone
    /// tests— it is `0.0.0` instead of failing.
    static var version: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String) ?? "0.0.0"
    }

    /// `CocoiOS/0.1.0 (iOS 17.0)`: what goes in the `User-Agent` of each request.
    static func userAgent(
        version: String = Brand.version, system: String = ProcessInfo.processInfo.operatingSystemVersionString
    ) -> String {
        "\(userAgentApp)\(version) (iOS \(system))"
    }
}
