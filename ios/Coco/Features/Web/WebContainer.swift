import SwiftUI

/// La web con sus dos estados nativos encima: sin red antes de cargar y la
/// sesión web atascada. Con documento, la falta de red es una franja fina.
struct WebContainer: View {
    let bridge: WebBridge
    let connectivity: Connectivity
    let pending: Int
    let onCapture: () -> Void

    init(bridge: WebBridge, connectivity: Connectivity, pending: Int, onCapture: @escaping () -> Void) {
        self.bridge = bridge
        self.connectivity = connectivity
        self.pending = pending
        self.onCapture = onCapture
    }

    var body: some View {
        ZStack(alignment: .top) {
            WebViewRepresentable(bridge: bridge)
                .ignoresSafeArea()
            if noDocumentNoNetwork {
                OfflineView(pending: pending, retry: bridge.reload, capture: onCapture)
            } else if bridge.loadState == .webSessionStuck {
                sessionStuck
            } else if !connectivity.isOnline {
                offlineBanner
            }
        }
        .onChange(of: connectivity.isOnline) { _, hay in
            guard hay else { return }
            Task { await bridge.connectivityReturned() }
        }
    }

    private var noDocumentNoNetwork: Bool {
        if case .failure = bridge.loadState, !bridge.hasDocument { return true }
        return !connectivity.isOnline && !bridge.hasDocument
    }

    private var sessionStuck: some View {
        VStack(spacing: 12) {
            Text("No se pudo abrir la sesión web")
                .font(.headline)
            Button("Reintentar", action: bridge.reload)
                .buttonStyle(.borderedProminent)
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var offlineBanner: some View {
        Text("Sin conexión")
            .font(.caption.weight(.medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 6)
            .background(.thinMaterial)
    }
}
