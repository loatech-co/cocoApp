import SwiftUI
import WidgetKit

/// The iOS 18 control: Control Center, lock screen and action
/// button (Settings → Action Button → Controls). A single button that opens the
/// app on the quick form.
@available(iOS 18.0, *)
struct CaptureControl: ControlWidget {
    static let kind = "co.loatech.coco.control.capture"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: Self.kind) {
            ControlWidgetButton(action: OpenCaptureIntent(destination: "manual")) {
                Label(L10n.Widget.captureTitle, systemImage: "plus.circle.fill")
            }
        }
        .displayName(L10n.Widget.captureTitleResource)
        .description(L10n.Widget.captureDescriptionResource)
    }
}
