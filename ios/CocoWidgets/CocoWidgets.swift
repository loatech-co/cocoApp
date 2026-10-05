import SwiftUI
import WidgetKit

/// La extensión de accesos rápidos. Registra el widget (iOS 17) y, solo donde
/// existe, el control (iOS 18). El botón de acción de iOS 17 no pasa por aquí:
/// lo cubre el App Shortcut «Registrar gasto en Coco» de la app.
@main
struct CocoWidgets: WidgetBundle {
    var body: some Widget {
        CaptureWidget()
        if #available(iOS 18.0, *) {
            CaptureControl()
        }
    }
}
