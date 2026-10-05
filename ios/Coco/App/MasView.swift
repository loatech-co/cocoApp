import SwiftUI

/// Lo que no cabe en las otras tres pestañas. Las entradas de la web abren
/// la ruta en el mismo webview de Inicio; el resto es nativo.
struct MasView: View {
    let d: Dependencias

    @State private var confirmarSalida = false

    var body: some View {
        NavigationStack {
            List {
                Section {
                    fila("Centros de costos", icono: "folder") { d.enrutador.ir(.web(ruta: "/centros-de-costos")) }
                    fila("Mi cuenta", icono: "person") { d.enrutador.ir(.web(ruta: "/mi-cuenta")) }
                    if d.esAdmin {
                        fila("Administración", icono: "person.2") { d.enrutador.ir(.web(ruta: "/administracion")) }
                    }
                } footer: {
                    if let correo = d.perfil?.email { Text(correo) }
                }

                Section {
                    fila("Bienvenida y automatizaciones", icono: "wand.and.stars") { d.enrutador.ir(.bienvenida) }
                    fila("Ajustes", icono: "gearshape") { d.enrutador.ir(.ajustes) }
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
                    Task { await d.salir() }
                }
            } message: {
                Text("Lo que esté pendiente de enviar se queda guardado y sale al volver a entrar.")
            }
        }
    }

    private func fila(_ titulo: String, icono: String, accion: @escaping () -> Void) -> some View {
        Button(action: accion) {
            HStack {
                Label(titulo, systemImage: icono)
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.tertiary)
            }
        }
        .foregroundStyle(.primary)
    }
}
