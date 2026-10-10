import SwiftUI
import WidgetKit

/// The iOS 17 widget: home screen (`systemSmall`, `systemMedium`) and
/// lock screen (`accessoryCircular`, `accessoryRectangular`, where on
/// iOS 17 there are no controls). It only opens the app by URL: without an App Group it cannot
/// read the queue, so it does not show the pending counter; that number lives
/// inside the app and in the icon badge.
struct CaptureWidget: Widget {
    static let kind = "co.loatech.coco.widget.capture"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: FixedProvider()) { _ in
            CaptureWidgetView()
        }
        .configurationDisplayName(L10n.Widget.captureTitle)
        .description(L10n.Widget.captureDescription)
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

/// There is nothing to refresh: the widget is a button. A single entry, for
/// good.
struct FixedEntry: TimelineEntry {
    let date: Date
}

struct FixedProvider: TimelineProvider {
    func placeholder(in context: Context) -> FixedEntry {
        FixedEntry(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (FixedEntry) -> Void) {
        completion(FixedEntry(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FixedEntry>) -> Void) {
        completion(Timeline(entries: [FixedEntry(date: .now)], policy: .never))
    }
}

/// One view per family. The single-action ones use `widgetURL`; the medium one
/// carries two `Link`s, because a widget with two zones cannot use `widgetURL`.
struct CaptureWidgetView: View {
    @Environment(\.widgetFamily) private var family

    private let manual = CaptureURL.manual
    private let photo = CaptureURL.photo

    var body: some View {
        switch family {
        case .systemMedium:
            HStack(spacing: 12) {
                Link(destination: manual) {
                    WidgetActionButton(title: L10n.Widget.captureRegister, symbol: "plus.circle.fill")
                }
                Link(destination: photo) {
                    WidgetActionButton(title: L10n.Widget.capturePhoto, symbol: "camera.fill")
                }
            }
            .containerBackground(.fill.tertiary, for: .widget)
        case .accessoryCircular:
            Image(systemName: "plus.circle.fill")
                .font(.title)
                .widgetURL(manual)
                .containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            Label(L10n.Widget.captureTitle, systemImage: "plus.circle.fill")
                .font(.headline)
                .widgetURL(manual)
                .containerBackground(.clear, for: .widget)
        default:
            WidgetActionButton(title: L10n.Widget.captureTitle, symbol: "plus.circle.fill")
                .widgetURL(manual)
                .containerBackground(.fill.tertiary, for: .widget)
        }
    }
}

/// A large icon and its label, for the home screen.
private struct WidgetActionButton: View {
    let title: String
    let symbol: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: symbol)
                .font(.system(size: 32))
                .foregroundStyle(.tint)
            Spacer(minLength: 0)
            Text(title)
                .font(.headline)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
