import SwiftUI

/// Lo que no cabe en las otras tres pestañas. Las entradas de la web abren
/// la ruta en el mismo webview de Inicio; el resto es nativo.
struct MoreView: View {
    let d: Dependencies

    @State private var confirmSignOut = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row(L10n.More.costCenters, icon: "folder") { d.router.go(.web(path: "/cost-centers")) }
                    row(L10n.More.account, icon: "person") { d.router.go(.web(path: "/account")) }
                    if d.isAdmin {
                        row(L10n.More.admin, icon: "person.2") { d.router.go(.web(path: "/admin")) }
                    }
                } footer: {
                    if let email = d.profile?.email { Text(email) }
                }

                Section {
                    row(L10n.More.welcome, icon: "wand.and.stars") { d.router.go(.welcome) }
                    row(L10n.Common.settings, icon: "gearshape") { d.router.go(.settings) }
                }

                Section {
                    Button(L10n.More.signOutButton, role: .destructive) { confirmSignOut = true }
                }
            }
            .navigationTitle(L10n.More.title)
            .confirmationDialog(
                L10n.More.signOutConfirmTitle, isPresented: $confirmSignOut, titleVisibility: .visible
            ) {
                Button(L10n.More.signOutConfirm, role: .destructive) {
                    Task { await d.signOut() }
                }
            } message: {
                Text(L10n.More.signOutConfirmMessage)
            }
        }
    }

    private func row(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack {
                Label(title, systemImage: icon)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .foregroundStyle(.primary)
    }
}
