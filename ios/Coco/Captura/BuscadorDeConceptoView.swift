import SwiftUI

/// Buscar un concepto por nombre o palabra clave en el árbol guardado. Con
/// la caja vacía enseña los recientes; si el recibo trajo candidatos, van
/// arriba. Cada fila muestra la ruta para distinguir «Mercado» de «Mercado
/// de la oficina».
struct BuscadorDeConceptoView: View {
    @Bindable var modelo: ModeloDelFormulario
    @Environment(\.dismiss) private var dismiss

    init(modelo: ModeloDelFormulario) {
        self.modelo = modelo
    }

    private var consultaVacia: Bool {
        modelo.consulta.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            List {
                if modelo.indice == nil {
                    Text("Los conceptos aún no se han descargado. Guarda igual: la captura queda por clasificar.")
                        .foregroundStyle(.secondary)
                }
                if consultaVacia, !modelo.candidatos.isEmpty {
                    Section {
                        ForEach(modelo.candidatos, content: fila)
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
                    ContentUnavailableView.search(text: modelo.consulta)
                }
            }
            .searchable(text: $modelo.consulta, placement: .navigationBarDrawer(displayMode: .always), prompt: "Nombre o palabra clave")
            .onChange(of: modelo.consulta) { _, nueva in modelo.buscar(nueva) }
            .task { modelo.buscar(modelo.consulta) }
            .navigationTitle("Concepto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { dismiss() }
                }
            }
        }
    }

    private func fila(_ entrada: EntradaDelIndice) -> some View {
        Button {
            modelo.elegir(entrada)
            dismiss()
        } label: {
            VStack(alignment: .leading, spacing: 2) {
                Text(entrada.nombre)
                Text(entrada.rutaLegible)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .tint(.primary)
    }
}
