import SwiftUI

/// Buscar un concepto por nombre o palabra clave en el árbol guardado. Con
/// la caja vacía enseña los recientes; si el recibo trajo candidatos, van
/// arriba. Cada fila muestra la ruta para distinguir «Mercado» de «Mercado
/// de la oficina».
struct ConceptSearchView: View {
    @Bindable var modelo: FormModel
    @Environment(\.dismiss) private var dismiss

    init(modelo: FormModel) {
        self.modelo = modelo
    }

    private var consultaVacia: Bool {
        modelo.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                if modelo.indice == nil {
                    Text("Los conceptos aún no se han descargado. Guarda igual: la captura queda por clasificar.")
                        .foregroundStyle(.secondary)
                }
                if consultaVacia, !modelo.candidates.isEmpty {
                    Section {
                        ForEach(modelo.candidates, content: fila)
                    } header: {
                        Text("Propuestos por el recibo").textCase(nil)
                    }
                }
                if !modelo.resultados.isEmpty {
                    Section {
                        ForEach(modelo.resultados, content: fila)
                    } header: {
                        Text(consultaVacia ? "Recientes" : "Resultados").textCase(nil)
                    }
                } else if !consultaVacia {
                    ContentUnavailableView.search(text: modelo.query)
                }
            }
            .searchable(
                text: $modelo.query, placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Nombre o palabra clave"
            )
            .onChange(of: modelo.query) { _, nueva in modelo.search(nueva) }
            .task { modelo.search(modelo.query) }
            .navigationTitle("Concepto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func fila(_ entrada: IndexEntry) -> some View {
        Button {
            modelo.elegir(entrada)
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(entrada.name)
                Text(entrada.rutaLegible)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .tint(.primary)
    }
}
