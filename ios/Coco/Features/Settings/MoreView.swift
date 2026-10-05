import SwiftUI

/// Lo que no cabe en las otras tres pestañas. Las entradas de la web abren
/// la ruta en el mismo webview de Inicio; el resto es nativo.
struct MoreView: View {
    let d: Dependencies

    @State private var confirmarSalida = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    row("Centros de costos", icono: "folder") { d.enrutador.go(.web(path: "/centros-de-costos")) }
                    row("Mi cuenta", icono: "person") { d.enrutador.go(.web(path: "/mi-cuenta")) }
                    if d.esAdmin {
                        row("Administración", icono: "person.2") { d.enrutador.go(.web(path: "/administracion")) }
                    }
                } footer: {
                    if let email = d.profile?.email { Text(email) }
                }

                Section {
                    row("Bienvenida y automatizaciones", icono: "wand.and.stars") { d.enrutador.go(.welcome) }
                    row("Ajustes", icono: "gearshape") { d.enrutador.go(.settings) }
                }

                Section {
                    Button("Cerrar sesión", role: .destructive) { confirmarSalida = true }
                }
            }
            .navigationTitle("Más")
            .confirmationDialog(
                "¿Cerrar sesión en este teléfono?", isPresented: $confirmarSalida, titleVisibility: .visible
            ) {
                Button("Cerrar sesión", role: .destructive) {
                    Task { await d.signOut() }
                }
            } message: {
                Text("Lo que esté pendiente de enviar se queda guardado y sale al volver a entrar.")
            }
        }
    }

    private func row(_ title: String, icono: String, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            HStack {
                Label(title, systemImage: icono)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .foregroundStyle(.primary)
    }
}
