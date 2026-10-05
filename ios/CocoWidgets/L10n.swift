import Foundation

/// Los textos que ve el usuario, con su clave en `Localizable.xcstrings`.
/// Ninguna vista escribe un texto suelto: lo pide aquí, y el valor en español
/// vive en el catálogo (CONTRIBUTING.md, «iOS»). `LocalizationTests` comprueba
/// que cada clave existe y conserva el texto de siempre.
///
/// La extensión no ve los recursos del .app: lleva su propio catálogo.
/// `displayName` y `description` de un control piden un recurso, no un texto:
/// por eso hay variantes `…Resource`.
enum L10n {
    enum Widget {
        static var captureDescription: String { text("widget.capture.description") }
        static var captureDescriptionResource: LocalizedStringResource { "widget.capture.description" }
        static var capturePhoto: String { text("widget.capture.photo") }
        static var captureRegister: String { text("widget.capture.register") }
        static var captureTitle: String { text("widget.capture.title") }
        static var captureTitleResource: LocalizedStringResource { "widget.capture.title" }
    }

    /// El valor del catálogo; si falta la clave, `Bundle` devuelve la clave
    /// misma y la prueba lo caza.
    static func text(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: nil, table: nil)
    }
}
