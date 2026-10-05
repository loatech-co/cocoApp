import Foundation

/// Lo que la web encuentra antes de su primer script: quién la aloja. Solo
/// el frame principal y congelado, para que ninguna página incrustada pueda
/// fingir ni cambiar la plataforma.
enum BootScript {
    static func source(version: String) -> String {
        let versionJSON = WebBridge.cadenaJSON(version)
        return "window.__COCO_APP__ = Object.freeze({ plataforma: 'ios', version: \(versionJSON) });"
    }
}
