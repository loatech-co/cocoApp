import SwiftUI

/// La web con sus dos estados nativos encima: sin red antes de cargar y la
/// sesión web atascada. Con documento, la falta de red es una franja fina.
struct WebContainer: View {
    let puente: WebBridge
    let connectivity: Connectivity
    let pending: Int
    let onCapture: () -> Void

    init(puente: WebBridge, connectivity: Connectivity, pending: Int, onCapture: @escaping () -> Void) {
        self.puente = puente
        self.connectivity = connectivity
        self.pending = pending
        self.onCapture = onCapture
    }

    var body: some View {
        ZStack(alignment: .top) {
            WebViewRepresentable(puente: puente)
                .ignoresSafeArea()
            if sinDocumentoNiRed {
                OfflineView(pending: pending, retry: puente.recargar, capture: onCapture)
            } else if puente.estadoDeCarga == .sesionWebAtascada {
                sesionAtascada
            } else if !connectivity.isOnline {
                franjaSinRed
            }
        }
        .onChange(of: connectivity.isOnline) { _, hay in
            guard hay else { return }
            Task { await puente.conectividadVolvio() }
        }
    }

    private var sinDocumentoNiRed: Bool {
        if case .failure = puente.estadoDeCarga, !puente.hayDocumento { return true }
        return !connectivity.isOnline && !puente.hayDocumento
    }

    private var sesionAtascada: some View {
        VStack(spacing: 12) {
            Text("No se pudo abrir la sesión web")
                .font(.headline)
            Button("Reintentar", action: puente.recargar)
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var franjaSinRed: some View {
        Text("Sin conexión")
            .font(.caption.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(.thinMaterial)
    }
}
