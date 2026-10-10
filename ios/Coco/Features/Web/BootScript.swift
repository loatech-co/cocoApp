import Foundation

/// What the web finds before its first script: who hosts it. Only
/// the main frame and frozen, so that no embedded page can
/// fake or change the platform.
enum BootScript {
    static func source(version: String) -> String {
        let versionJSON = WebBridge.jsonString(version)
        return "window.__COCO_APP__ = Object.freeze({ plataforma: 'ios', version: \(versionJSON) });"
    }
}
