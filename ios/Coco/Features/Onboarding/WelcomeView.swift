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
                        L10n.Onboarding.welcomeIntro
                    )
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                section(L10n.Onboarding.welcomeWalletSection, steps: AutomationSteps.transaction)
                section(L10n.Onboarding.welcomeMessageSection, steps: AutomationSteps.message)
                section(L10n.Onboarding.welcomeAccessSection, steps: AutomationSteps.accessPoints)
                Section {
                    Button(L10n.Onboarding.welcomeOpenShortcuts) { ShortcutsLauncher.open() }
                }
            }
            .navigationTitle(L10n.Onboarding.welcomeTitle)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.done) {
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
