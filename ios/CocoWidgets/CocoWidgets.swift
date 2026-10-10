import SwiftUI
import WidgetKit

/// The quick-access extension. It registers the widget (iOS 17) and, only where
/// it exists, the control (iOS 18). The iOS 17 action button does not go through here:
/// the app's «Registrar gasto en Coco» App Shortcut covers it.
@main
struct CocoWidgets: WidgetBundle {
    var body: some Widget {
        CaptureWidget()
        if #available(iOS 18.0, *) {
            CaptureControl()
        }
    }
}
