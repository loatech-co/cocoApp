import AppIntents
import Foundation

/// The URLs with which the shortcuts open the app. The app resolves them in
/// `onOpenURL` (if there is no session, first sign in and then the destination).
enum CaptureURL {
    /// The quick form.
    static let manual = url(destination: "manual")
    /// The form with the camera already up.
    static let photo = url(destination: "photo")

    static func url(destination: String) -> URL {
        // The destinations are fixed and made of letters: if this fails it is a programming
        // error, not something that comes from outside.
        guard let url = URL(string: "coco://capture/\(destination)") else {
            preconditionFailure("URL de captura inválida para el destino «\(destination)»")
        }
        return url
    }
}

/// Opens Coco on the quick form. The iOS 18 control runs it.
///
/// It lives in the extension, and not in the app, because a Control
/// Center control can only run intents from its own binary. It reads neither the queue nor
/// the session: it only launches the app through `coco://capture/<destination>`.
///
/// It is iOS 18 because `OpenURLIntent` is; on iOS 17 the widget opens the app with
/// `widgetURL` and `Link`, which do not go through an intent.
@available(iOS 18.0, *)
struct OpenCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco en el formulario rápido.")
    static let openAppWhenRun = true

    /// `manual` opens the form; `photo`, the form with the camera up.
    @Parameter(title: "Destino", default: "manual")
    var destination: String

    init() {}

    init(destination: String) {
        self.destination = destination
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(CaptureURL.url(destination: destination)))
    }
}
