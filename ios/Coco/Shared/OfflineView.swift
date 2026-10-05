import SwiftUI

/// Lo que se ve cuando no hay red y la web no llegó a cargar. Lo importante
/// es decir que capturar sigue funcionando.
struct OfflineView: View {
    let pending: Int
    let retry: () -> Void
    let capture: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Sin conexión")
                .font(.title2.weight(.semibold))
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Reintentar", action: retry)
                    .buttonStyle(.bordered)
                Button("Capturar", action: capture)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var text: String {
        var t = "Lo que captures se guarda en el teléfono y se envía solo al volver la red."
        if pending == 1 { t += " 1 pendiente." } else if pending > 1 { t += " \(pending) pendientes." }
        return t
    }
}

#Preview {
    OfflineView(pending: 3, retry: {}, capture: {})
}
