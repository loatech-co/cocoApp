import SwiftUI

/// Una pantalla: monto, concepto, nota y foto. Guardar encola y cierra sin
/// esperar a la red; lo que pase después lo cuenta la cola por aviso.
struct QuickFormView: View {
    @Bindable var model: FormModel
    let opensCameraOnAppear: Bool
    let onClose: () -> Void

    @State private var isCameraOpen = false
    @State private var isSearchOpen = false

    init(model: FormModel, opensCameraOnAppear: Bool, onClose: @escaping () -> Void) {
        self.model = model
        self.opensCameraOnAppear = opensCameraOnAppear
        self.onClose = onClose
    }

    private var date: Binding<Date> {
        Binding(get: { model.date }, set: { model.changeDate($0) })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    AmountField(text: $model.amount)
                } header: {
                    Text("Monto").textCase(nil)
                }

                Section {
                    conceptRow
                } header: {
                    Text("Concepto").textCase(nil)
                }

                Section {
                    DatePicker("Fecha", selection: date, displayedComponents: .date)
                    if let merchant = model.merchant, !merchant.isEmpty {
                        LabeledContent("Comercio", value: merchant)
                    }
                    TextField("Nota (opcional)", text: $model.note, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    Text("Detalles").textCase(nil)
                }

                Section {
                    photoSection
                } header: {
                    Text("Recibo").textCase(nil)
                }

                if let error = model.error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Nuevo gasto")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancelar") { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Guardar") {
                        // Encola y cierra: la cola avisa cuando se envíe.
                        Task { await model.confirm() }
                        onClose()
                    }
                    .disabled(!model.canConfirm || model.isReading)
                }
            }
            .sheet(isPresented: $isSearchOpen) {
                ConceptSearchView(model: model)
            }
            .fullScreenCover(isPresented: $isCameraOpen) {
                CameraPicker(
                    onCapture: { image in
                        isCameraOpen = false
                        Task { await model.readPhoto(image) }
                    },
                    onCancel: { isCameraOpen = false }
                )
                .ignoresSafeArea()
            }
            .onChange(of: model.showsSearch) { _, open in
                if open {
                    model.showsSearch = false
                    isSearchOpen = true
                }
            }
            .task {
                if opensCameraOnAppear { isCameraOpen = true }
            }
        }
    }

    @ViewBuilder
    private var conceptRow: some View {
        Button {
            isSearchOpen = true
        } label: {
            HStack {
                if let concept = model.concept {
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 6) {
                            Text(concept.name)
                            if model.isConceptSuggested {
                                Text("sugerido")
                                    .font(.caption)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(.tint.opacity(0.15), in: Capsule())
                            }
                        }
                        Text(concept.rutaLegible)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text("Elegir concepto").foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
        }
        .tint(.primary)
        if model.concept != nil {
            Button("Quitar concepto", role: .destructive) { model.clearConcept() }
        }
    }

    @ViewBuilder
    private var photoSection: some View {
        if let photo = model.photo {
            Image(uiImage: photo)
                .resizable()
                .scaledToFit()
                .frame(maxHeight: 220)
                .clipShape(RoundedRectangle(cornerRadius: 10))
        }
        if model.isReading {
            HStack(spacing: 8) {
                ProgressView()
                Text("Leyendo el recibo…").foregroundStyle(.secondary)
            }
        } else if model.noNetwork {
            Label("Sin conexión: escribe los datos; la foto se adjuntará igual", systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
        }
        Button {
            isCameraOpen = true
        } label: {
            Label(
                model.photo == nil ? (CameraPicker.hayCamara ? "Tomar foto" : "Elegir foto") : "Cambiar foto",
                systemImage: "camera")
        }
        if model.photo != nil {
            Button("Quitar foto", role: .destructive) { model.removePhoto() }
        }
    }
}
