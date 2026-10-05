import SwiftUI

/// Lo que se ve cuando no hay red y la web no llegó a cargar. Lo importante
/// es decir que capturar sigue funcionando.
struct SinConexionView: View {
    let pendientes: Int
    let reintentar: () -> Void
    let capturar: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text("Sin conexión")
                .font(.title2.weight(.semibold))
            Text(texto)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Reintentar", action: reintentar)
                    .buttonStyle(.bordered)
                Button("Capturar", action: capturar)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var texto: String {
        var t = "Lo que captures se guarda en el teléfono y se envía solo al volver la red."
        if pendientes == 1 { t += " 1 pendiente." } else if pendientes > 1 { t += " \(pendientes) pendientes." }
        return t
    }
}

#Preview {
    SinConexionView(pendientes: 3, reintentar: {}, capturar: {})
}
