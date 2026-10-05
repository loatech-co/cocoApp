import SwiftUI
import WidgetKit

/// El control de iOS 18: Centro de control, pantalla bloqueada y botón de
/// acción (Ajustes → Botón de acción → Controles). Un solo botón que abre la
/// app en el formulario rápido.
@available(iOS 18.0, *)
struct CaptureControl: ControlWidget {
    static let kind = "co.loatech.coco.control.captura"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: AbrirCapturaIntent(destino: "manual")) {
                Label(L10n.Widget.captureTitle, systemImage: "plus.circle.fill")
            }
        }
        .displayName(L10n.Widget.captureTitleResource)
        .description(L10n.Widget.captureDescriptionResource)
    }
}
