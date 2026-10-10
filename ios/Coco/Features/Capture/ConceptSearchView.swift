import SwiftUI

/// Searching for a concept by name or keyword in the saved tree. With
/// the box empty it shows the recent ones; if the receipt brought candidates, they go
/// on top. Each row shows the path to tell «Mercado» from «Mercado
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
                    Text(L10n.Capture.conceptTreeMissing)
                        .foregroundStyle(.secondary)
                }
                if isQueryEmpty, !model.candidates.isEmpty {
                    Section {
                        ForEach(model.candidates, content: row)
                    } header: {
                        Text(L10n.Capture.conceptSuggested).textCase(nil)
                    }
                }
                if !model.results.isEmpty {
                    Section {
                        ForEach(model.results, content: row)
                    } header: {
                        Text(isQueryEmpty ? L10n.Capture.conceptRecent : L10n.Capture.conceptResults).textCase(nil)
                    }
                } else if !isQueryEmpty {
                    ContentUnavailableView.search(text: model.query)
                }
            }
            .searchable(
                text: $model.query, placement: .navigationBarDrawer(displayMode: .always),
                prompt: L10n.Capture.conceptSearchPrompt
            )
            .onChange(of: model.query) { _, newQuery in model.search(newQuery) }
            .task { model.search(model.query) }
            .navigationTitle(L10n.Capture.conceptTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(L10n.Common.cancel) { dismiss() }
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
