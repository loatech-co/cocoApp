import SwiftUI

/// El monto como se escribe en Colombia: «45.000». Debajo, lo que Coco
/// entendió —«$45.000»— o que no lo entendió, antes de que se pulse guardar.
struct AmountField: View {
    @Binding var texto: String

    var body: some View {
        HStack(spacing: 6) {
            Text("$").font(.title2).foregroundStyle(.secondary)
            TextField("45.000", text: $texto)
                .keyboardType(.decimalPad)
                .font(.title2.monospacedDigit())
                .accessibilityLabel("Monto")
        }
        if !texto.isEmpty {
            if let normalizado = AmountParser.normalizar(texto) {
                Text(PesoFormat.formatear(normalizado))
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
