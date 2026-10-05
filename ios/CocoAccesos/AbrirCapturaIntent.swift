import AppIntents
import Foundation

/// Las URLs con las que los accesos abren la app. La app las resuelve en
/// `onOpenURL` (si no hay sesión, primero entrar y después el destino).
enum URLDeCaptura {
    /// El formulario rápido.
    static let manual = url(destino: "manual")
    /// El formulario con la cámara ya levantada.
    static let foto = url(destino: "foto")

    static func url(destino: String) -> URL {
        URL(string: "coco://capturar/\(destino)")!
    }
}

/// Abre Coco en el formulario rápido. Lo ejecuta el control de iOS 18.
///
/// Vive en la extensión, y no en la app, porque un control del Centro de
/// control solo puede ejecutar intents de su propio binario. No lee la cola ni
/// la sesión: solo lanza la app por `coco://capturar/<destino>`.
///
/// Es iOS 18 porque `OpenURLIntent` lo es; en iOS 17 el widget abre la app con
/// `widgetURL` y `Link`, que no pasan por un intent.
@available(iOS 18.0, *)
struct AbrirCapturaIntent: AppIntent {
    static let title: LocalizedStringResource = "Registrar gasto"
    static let description = IntentDescription("Abre Coco en el formulario rápido.")
    static let openAppWhenRun = true

    /// `manual` abre el formulario; `foto`, el formulario con la cámara levantada.
    @Parameter(title: "Destino", default: "manual")
    var destino: String

    init() {}

    init(destino: String) {
        self.destino = destino
    }

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(URLDeCaptura.url(destino: destino)))
    }
}
