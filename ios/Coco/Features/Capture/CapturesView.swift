import SwiftUI

/// Lo que se capturó desde el teléfono: pendientes (con cuenta), esperando
/// sesión, fallidas y hechas de los últimos 30 días. Se lee de la cola
/// local, así que tiene contenido sin red.
struct CapturesView: View {
    private let queue: CaptureQueue
    private let navigation: any Navigation

    @State private var captures: [PendingCapture] = []
    @State private var loaded = false

    init(queue: CaptureQueue, navigation: any Navigation) {
        self.queue = queue
        self.navigation = navigation
    }

    private var pending: [PendingCapture] {
        captures.filter {
            if case .toSend = $0.phase { return true }
            if case .photoToUpload = $0.phase { return true }
            return false
        }
    }
    private var awaitingSession: [PendingCapture] { captures.filter { $0.phase == .awaitingSession } }
    private var failedCaptures: [PendingCapture] {
        captures.filter { if case .failed = $0.phase { return true } else { return false } }
    }
    private var doneCaptures: [PendingCapture] {
        let limit = Date.now.addingTimeInterval(-30 * 86_400)
        return captures.filter {
            if case .done(let r) = $0.phase { return r.finishedAt >= limit }
            return false
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if !loaded {
                    ProgressView()
                } else if captures.isEmpty {
                    ContentUnavailableView(
                        "Nada capturado todavía",
                        systemImage: "tray",
                        description: Text("Lo que anotes desde el teléfono aparece aquí, con red o sin ella.")
                    )
                }
                section("Pendientes de envío · \(pending.count)", pending)
                section("Esperando sesión", awaitingSession)
                section("Con error", failedCaptures)
                section("Enviadas en los últimos 30 días", doneCaptures)
                Section {
                    Button {
                        navigation.go(.welcome)
                    } label: {
                        Label("Automatizaciones", systemImage: "wand.and.stars")
                    }
                }
            }
            .navigationTitle("Capturas")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        navigation.go(.quickForm(withCamera: false))
                    } label: {
                        Label("Nueva captura", systemImage: "plus")
                    }
                }
            }
            .task {
                await queue.purge()
                captures = await queue.all()
                loaded = true
                for await list in queue.changes {
                    captures = list
                }
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [PendingCapture]) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { capture in
                    CaptureRow(capture: capture)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if !capture.isDone {
                                Button("Descartar", role: .destructive) {
                                    Task { try? await queue.discard(id: capture.id) }
                                }
                            }
                            if capture.canRetry {
                                Button("Reintentar") {
                                    Task {
                                        await queue.retryNow(id: capture.id)
                                        _ = await queue.process(budget: .seconds(25))
                                    }
                                }
                                .tint(.accentColor)
                            }
                        }
                }
            } header: {
                Text(title).textCase(nil)
            }
        }
    }
}

private struct CaptureRow: View {
    let capture: PendingCapture

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(title).lineLimit(1)
                Spacer()
                if let amount = capture.body.amount {
                    Text(PesoFormat.format(amount)).monospacedDigit()
                }
            }
            Text(state)
                .font(.footnote)
                .foregroundStyle(capture.isFailed ? .red : .secondary)
            if let error = capture.lastError, !capture.isDone {
                Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }

    private var title: String {
        if case .done(let r) = capture.phase, !r.summary.isEmpty { return r.summary }
        if let merchant = capture.body.merchant, !merchant.isEmpty { return merchant }
        if let text = capture.body.text?.split(separator: "\n").first { return String(text) }
        return "Captura"
    }

    private var state: String {
        let date = capture.body.date ?? BogotaDate.day(capture.createdAt)
        switch capture.phase {
        case .toSend: return "\(date) · se enviará cuando haya red"
        case .photoToUpload: return "\(date) · registrada, subiendo la foto"
        case .awaitingSession: return "\(date) · inicia sesión para enviarla"
        case .failed(let reason): return "\(date) · \(reason)"
        case .done(let r): return r.needsReview ? "\(date) · por revisar" : date
        }
    }
}

extension PendingCapture {
    fileprivate var isDone: Bool { if case .done = phase { return true } else { return false } }
    fileprivate var isFailed: Bool { if case .failed = phase { return true } else { return false } }
    fileprivate var canRetry: Bool {
        switch phase {
        case .toSend, .awaitingSession, .failed: true
        case .photoToUpload, .done: false
        }
    }
}
