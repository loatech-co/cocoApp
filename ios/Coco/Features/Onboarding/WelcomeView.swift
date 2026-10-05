import SwiftUI

/// La guía para crear las dos automatizaciones y los accesos. Se marca como
/// vista en UserDefaults y se puede reabrir desde Más y desde Capturas.
struct WelcomeView: View {
    static let key = "bienvenida-vista"

    let alTerminar: () -> Void
    let defaults: UserDefaults

    init(alTerminar: @escaping () -> Void, defaults: UserDefaults = .standard) {
        self.alTerminar = alTerminar
        self.defaults = defaults
    }

    static func yaVista(defaults: UserDefaults = .standard) -> Bool {
        defaults.bool(forKey: key)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text(
                        """
                        Coco registra lo que pagas sin que tengas que abrirla: Atajos le pasa cada pago de Wallet y \
                        cada mensaje del banco.
                        """
                    )
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                section("Pagos con Wallet", pasos: AutomationSteps.transaccion)
                section("Mensajes del banco", pasos: AutomationSteps.message)
                section("Accesos rápidos", pasos: AutomationSteps.accesos)
                Section {
                    Button("Abrir Atajos") { ShortcutsLauncher.abrir() }
                }
            }
            .navigationTitle("Bienvenida")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") {
                        defaults.set(true, forKey: Self.key)
                        alTerminar()
                    }
                }
            }
        }
    }

    private func section(_ title: String, pasos: [AutomationStep]) -> some View {
        Section(title) {
            ForEach(pasos) { paso in
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(paso.title).font(.body)
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
    WelcomeView(alTerminar: {})
}
