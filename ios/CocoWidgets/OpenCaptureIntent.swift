import AppIntents
import Foundation

/// Las URLs con las que los accesos abren la app. La app las resuelve en
/// `onOpenURL` (si no hay sesión, primero entrar y después el destino).
enum CaptureURL {
    /// El formulario rápido.
    static let manual = url(destination: "manual")
    /// El formulario con la cámara ya levantada.
    static let photo = url(destination: "photo")

    static func url(destination: String) -> URL {
        // Los destinos son fijos y de letras: si esto falla es un error de
        // programación, no algo que llegue de fuera.
        guard let url = URL(string: "coco://capture/\(destination)") else {
            preconditionFailure("URL de captura inválida para el destino «\(destination)»")
        }
        return url
    }
}

/// Abre Coco en el formulario rápido. Lo ejecuta el control de iOS 18.
///
/// Vive en la extensión, y no en la app, porque un control del Centro de
/// control solo puede ejecutar intents de su propio binario. No lee la cola ni
/// la sesión: solo lanza la app por `coco://capture/<destination>`.
///
/// Es iOS 18 porque `OpenURLIntent` lo es; en iOS 17 el widget abre la app con
/// `widgetURL` y `Link`, que no pasan por un intent.
@available(iOS 18.0, *)
struct OpenCaptureIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco en el formulario rápido.")
    static let openAppWhenRun = true

    /// `manual` abre el formulario; `foto`, el formulario con la cámara levantada.
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
