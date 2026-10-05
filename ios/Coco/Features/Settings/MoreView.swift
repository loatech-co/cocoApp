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
                    row("Centros de costos", icon: "folder") { d.router.go(.web(path: "/centros-de-costos")) }
                    row("Mi cuenta", icon: "person") { d.router.go(.web(path: "/mi-cuenta")) }
                    if d.esAdmin {
                        row("Administración", icon: "person.2") { d.router.go(.web(path: "/administracion")) }
                    }
                } footer: {
                    if let email = d.profile?.email { Text(email) }
                }

                Section {
                    row("Bienvenida y automatizaciones", icon: "wand.and.stars") { d.router.go(.welcome) }
                    row("Ajustes", icon: "gearshape") { d.router.go(.settings) }
                }

                Section {
                    Button("Cerrar sesión", role: .destructive) { confirmSignOut = true }
                }
            }
            .navigationTitle("Más")
            .confirmationDialog(
                "¿Cerrar sesión en este teléfono?", isPresented: $confirmSignOut, titleVisibility: .visible
            ) {
                Button("Cerrar sesión", role: .destructive) {
                    Task { await d.signOut() }
                }
            } message: {
                Text("Lo que esté pendiente de enviar se queda guardado y sale al volver a entrar.")
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
