import SwiftUI

/// La web con sus dos estados nativos encima: sin red antes de cargar y la
/// sesión web atascada. Con documento, la falta de red es una franja fina.
struct ContenedorWeb: View {
    let puente: PuenteWeb
    let conectividad: Conectividad
    let pendientes: Int
    let alCapturar: () -> Void

    init(puente: PuenteWeb, conectividad: Conectividad, pendientes: Int, alCapturar: @escaping () -> Void) {
        self.puente = puente
        self.conectividad = conectividad
        self.pendientes = pendientes
        self.alCapturar = alCapturar
    }

    var body: some View {
        ZStack(alignment: .top) {
            VistaWeb(puente: puente)
                .ignoresSafeArea()
            if sinDocumentoNiRed {
                SinConexionView(pendientes: pendientes, reintentar: puente.recargar, capturar: alCapturar)
            } else if puente.estadoDeCarga == .sesionWebAtascada {
                sesionAtascada
            } else if !conectividad.hayRed {
                franjaSinRed
            }
        }
        .onChange(of: conectividad.hayRed) { _, hay in
            guard hay else { return }
            Task { await puente.conectividadVolvio() }
        }
    }

    private var sinDocumentoNiRed: Bool {
        if case .fallo = puente.estadoDeCarga, !puente.hayDocumento { return true }
        return !conectividad.hayRed && !puente.hayDocumento
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
