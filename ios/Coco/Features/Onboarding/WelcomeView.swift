import SwiftUI

/// La guía para crear las dos automatizaciones y los accesos. Se marca como
/// vista en UserDefaults y se puede reabrir desde Más y desde Capturas.
struct WelcomeView: View {
    static let key = "bienvenida-vista"

    let onFinish: () -> Void
    let defaults: UserDefaults

    init(onFinish: @escaping () -> Void, defaults: UserDefaults = .standard) {
        self.onFinish = onFinish
        self.defaults = defaults
    }

    static func wasSeen(defaults: UserDefaults = .standard) -> Bool {
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
                section("Pagos con Wallet", steps: AutomationSteps.transaction)
                section("Mensajes del banco", steps: AutomationSteps.message)
                section("Accesos rápidos", steps: AutomationSteps.accessPoints)
                Section {
                    Button("Abrir Atajos") { ShortcutsLauncher.open() }
                }
            }
            .navigationTitle("Bienvenida")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") {
                        defaults.set(true, forKey: Self.key)
                        onFinish()
                    }
                }
            }
        }
    }

    private func section(_ title: String, steps: [AutomationStep]) -> some View {
        Section(title) {
            ForEach(steps) { step in
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(step.title).font(.body)
                        Text(step.detail).font(.subheadline).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: step.symbol)
                }
            }
        }
    }
}

#Preview {
    WelcomeView(onFinish: {})
}
