import SwiftUI

/// The amount as it is written in Colombia: «45.000». Below it, what Coco
/// understood —«$45.000»— or that it did not understand it, before save is tapped.
struct AmountField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 6) {
            Text("$").font(.title2).foregroundStyle(.secondary)
            TextField(L10n.Capture.amountPlaceholder, text: $text)
                .keyboardType(.decimalPad)
                .font(.title2.monospacedDigit())
                .accessibilityLabel(L10n.Capture.amountLabel)
        }
        if !text.isEmpty {
            if let normalized = AmountParser.normalize(text) {
                Text(PesoFormat.format(normalized))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Text(L10n.Capture.amountUnreadable)
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
    }
}
