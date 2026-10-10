import Foundation

/// The texts the user sees, with their key in `Localizable.xcstrings`.
/// No view writes a loose text: it asks for it here, and the Spanish value
/// lives in the catalog (CONTRIBUTING.md, «iOS»). `LocalizationTests` checks
/// that each key exists and keeps its usual text.
///
/// The extension does not see the .app's resources: it carries its own catalog.
/// The `displayName` and `description` of a control ask for a resource, not a text:
/// that is why there are `…Resource` variants.
enum L10n {
    enum Widget {
        static var captureDescription: String { text("widget.capture.description") }
        static var captureDescriptionResource: LocalizedStringResource { "widget.capture.description" }
        static var capturePhoto: String { text("widget.capture.photo") }
        static var captureRegister: String { text("widget.capture.register") }
        static var captureTitle: String { text("widget.capture.title") }
        static var captureTitleResource: LocalizedStringResource { "widget.capture.title" }
    }

    /// The catalog value; if the key is missing, `Bundle` returns the key
    /// itself and the test catches it.
    static func text(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: nil, table: nil)
    }
}
