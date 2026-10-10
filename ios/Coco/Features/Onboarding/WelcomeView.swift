import SwiftUI

/// The guide to create the two automations and the shortcuts. It is marked as
/// seen in UserDefaults and can be reopened from More and from Captures.
struct WelcomeView: View {
    nonisolated static let key = "welcome-seen"

    let onFinish: () -> Void
    let defaults: UserDefaults

    init(onFinish: @escaping () -> Void, defaults: UserDefaults = .standard) {
        self.onFinish = onFinish
        self.defaults = defaults
    }

    nonisolated static func wasSeen(defaults: UserDefaults = .standard) -> Bool {
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
