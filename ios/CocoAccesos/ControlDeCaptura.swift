import SwiftUI
import WidgetKit

/// El control de iOS 18: Centro de control, pantalla bloqueada y botón de
/// acción (Ajustes → Botón de acción → Controles). Un solo botón que abre la
/// app en el formulario rápido.
@available(iOS 18.0, *)
struct ControlDeCaptura: ControlWidget {
    static let kind = "co.loatech.coco.control.captura"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: AbrirCapturaIntent(destino: "manual")) {
                Label("Registrar gasto", systemImage: "plus.circle.fill")
            }
        }
        .displayName("Registrar gasto")
        .description("Abre Coco en el formulario rápido.")
    }
}
