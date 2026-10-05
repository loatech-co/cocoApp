import SwiftUI

/// El monto como se escribe en Colombia: «45.000». Debajo, lo que Coco
/// entendió —«$45.000»— o que no lo entendió, antes de que se pulse guardar.
struct AmountField: View {
    @Binding var text: String

    var body: some View {
        HStack(spacing: 6) {
            Text("$").font(.title2).foregroundStyle(.secondary)
            TextField("45.000", text: $text)
                .keyboardType(.decimalPad)
                .font(.title2.monospacedDigit())
                .accessibilityLabel("Monto")
        }
        if !text.isEmpty {
            if let normalized = AmountParser.normalize(text) {
                Text(PesoFormat.format(normalized))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else {
                Text("No se entiende el monto")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
        }
    }
}
