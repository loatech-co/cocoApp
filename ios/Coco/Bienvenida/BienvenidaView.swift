import SwiftUI

/// La guía para crear las dos automatizaciones y los accesos. Se marca como
/// vista en UserDefaults y se puede reabrir desde Más y desde Capturas.
struct BienvenidaView: View {
    static let clave = "bienvenida-vista"

    let alTerminar: () -> Void
    let defaults: UserDefaults

    init(alTerminar: @escaping () -> Void, defaults: UserDefaults = .standard) {
        self.alTerminar = alTerminar
        self.defaults = defaults
    }

    static func yaVista(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: clave)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Coco registra lo que pagas sin que tengas que abrirla: Atajos le pasa cada pago de Wallet y cada mensaje del banco.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                seccion("Pagos con Wallet", pasos: PasosDeAutomatizacion.transaccion)
                seccion("Mensajes del banco", pasos: PasosDeAutomatizacion.mensaje)
                seccion("Accesos rápidos", pasos: PasosDeAutomatizacion.accesos)
                Section {
                    Button("Abrir Atajos") { AbrirAtajos.abrir() }
                }
            }
            .navigationTitle("Bienvenida")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") {
                        defaults.set(true, forKey: Self.clave)
                        alTerminar()
                    }
                }
            }
        }
    }

    private func seccion(_ titulo: String, pasos: [PasoDeAutomatizacion]) -> some View {
        Section(titulo) {
            ForEach(pasos) { paso in
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(paso.titulo).font(.body)
                        Text(paso.detalle).font(.subheadline).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: paso.simbolo)
                }
            }
        }
    }
}

#Preview {
    BienvenidaView(alTerminar: {})
}
