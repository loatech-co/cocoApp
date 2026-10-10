import SwiftUI

/// One screen: amount, concept, note and photo. Saving enqueues and closes without
/// waiting for the network; whatever happens next the queue tells by a notice.
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
                    Text(L10n.Capture.formAmount).textCase(nil)
                }

                Section {
                    conceptRow
                } header: {
                    Text(L10n.Capture.formConcept).textCase(nil)
                }

                Section {
                    DatePicker(L10n.Capture.formDate, selection: date, displayedComponents: .date)
                    if let merchant = model.merchant, !merchant.isEmpty {
                        LabeledContent(L10n.Capture.formMerchant, value: merchant)
                    }
                    TextField(L10n.Capture.formNote, text: $model.note, axis: .vertical)
                        .lineLimit(1...3)
                } header: {
                    Text(L10n.Capture.formDetails).textCase(nil)
                }

                Section {
                    photoSection
                } header: {
                    Text(L10n.Capture.formReceipt).textCase(nil)
                }

                if let error = model.error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle(L10n.Capture.formTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.Common.cancel) { onClose() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Capture.formSave) {
                        // Enqueues and closes: the queue notifies when it is sent.
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
                                Text(L10n.Capture.formSuggested)
                                    .font(.caption)
                                    .padding(.horizontal, 6)
                                    .padding(.vertical, 2)
                                    .background(.tint.opacity(0.15), in: Capsule())
                            }
                        }
                        Text(concept.readablePath)
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                } else {
                    Text(L10n.Capture.formChooseConcept).foregroundStyle(.secondary)
                }
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.footnote)
                    .foregroundStyle(.tertiary)
            }
        }
        .tint(.primary)
        if model.concept != nil {
            Button(L10n.Capture.formRemoveConcept, role: .destructive) { model.clearConcept() }
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
                Text(L10n.Capture.receiptReading).foregroundStyle(.secondary)
            }
        } else if model.noNetwork {
            Label(L10n.Capture.receiptOffline, systemImage: "wifi.slash")
                .foregroundStyle(.secondary)
        }
        Button {
            isCameraOpen = true
        } label: {
            Label(
                model.photo == nil
                    ? (CameraPicker.hasCamera ? L10n.Capture.photoTake : L10n.Capture.photoChoose)
                    : L10n.Capture.photoChange,
                systemImage: "camera")
        }
        if model.photo != nil {
            Button(L10n.Capture.photoRemove, role: .destructive) { model.removePhoto() }
        }
    }
}
