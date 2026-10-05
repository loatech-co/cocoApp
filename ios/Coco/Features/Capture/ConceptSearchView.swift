import SwiftUI

/// Buscar un concepto por nombre o palabra clave en el árbol guardado. Con
/// la caja vacía enseña los recientes; si el recibo trajo candidatos, van
/// arriba. Cada fila muestra la ruta para distinguir «Mercado» de «Mercado
/// de la oficina».
struct ConceptSearchView: View {
    @Bindable var model: FormModel
    @Environment(\.dismiss) private var dismiss

    init(model: FormModel) {
        self.model = model
    }

    private var isQueryEmpty: Bool {
        model.query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                if model.index == nil {
                    Text("Los conceptos aún no se han descargado. Guarda igual: la captura queda por clasificar.")
                        .foregroundStyle(.secondary)
                }
                if isQueryEmpty, !model.candidates.isEmpty {
                    Section {
                        ForEach(model.candidates, content: row)
                    } header: {
                        Text("Propuestos por el recibo").textCase(nil)
                    }
                }
                if !model.results.isEmpty {
                    Section {
                        ForEach(model.results, content: row)
                    } header: {
                        Text(isQueryEmpty ? "Recientes" : "Resultados").textCase(nil)
                    }
                } else if !isQueryEmpty {
                    ContentUnavailableView.search(text: model.query)
                }
            }
            .searchable(
                text: $model.query, placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Nombre o palabra clave"
            )
            .onChange(of: model.query) { _, newQuery in model.search(newQuery) }
            .task { model.search(model.query) }
            .navigationTitle("Concepto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func row(_ entry: IndexEntry) -> some View {
        Button {
            model.choose(entry)
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(entry.name)
                Text(entry.readablePath)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .tint(.primary)
    }
}
