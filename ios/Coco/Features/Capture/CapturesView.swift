import SwiftUI

/// Lo que se capturó desde el teléfono: pendientes (con cuenta), esperando
/// sesión, fallidas y hechas de los últimos 30 días. Se lee de la cola
/// local, así que tiene contenido sin red.
struct CapturesView: View {
    private let queue: CaptureQueue
    private let navigation: any Navigation

    @State private var captures: [PendingCapture] = []
    @State private var cargado = false

    init(queue: CaptureQueue, navigation: any Navigation) {
        self.queue = queue
        self.navigation = navigation
    }

    private var pending: [PendingCapture] {
        captures.filter {
            if case .porEnviar = $0.fase { return true }
            if case .porSubirFoto = $0.fase { return true }
            return false
        }
    }
    private var esperandoSesion: [PendingCapture] { captures.filter { $0.fase == .esperandoSesion } }
    private var fallidas: [PendingCapture] {
        captures.filter { if case .failed = $0.fase { return true } else { return false } }
    }
    private var hechas: [PendingCapture] {
        let limite = Date.now.addingTimeInterval(-30 * 86_400)
        return captures.filter {
            if case .hecha(let r) = $0.fase { return r.finishedAt >= limite }
            return false
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if !cargado {
                    ProgressView()
                } else if captures.isEmpty {
                    ContentUnavailableView(
                        "Nada capturado todavía",
                        systemImage: "tray",
                        description: Text("Lo que anotes desde el teléfono aparece aquí, con red o sin ella.")
                    )
                }
                seccion("Pendientes de envío · \(pending.count)", pending)
                seccion("Esperando sesión", esperandoSesion)
                seccion("Con error", fallidas)
                seccion("Enviadas en los últimos 30 días", hechas)
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
                await queue.purgar()
                captures = await queue.all()
                cargado = true
                for await lista in queue.changes {
                    captures = lista
                }
            }
        }
    }

    @ViewBuilder
    private func seccion(_ titulo: String, _ elementos: [PendingCapture]) -> some View {
        if !elementos.isEmpty {
            Section {
                ForEach(elementos) { capture in
                    CaptureRow(capture: capture)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if !capture.estaHecha {
                                Button("Descartar", role: .destructive) {
                                    Task { try? await queue.discard(id: capture.id) }
                                }
                            }
                            if capture.sePuedeReintentar {
                                Button("Reintentar") {
                                    Task {
                                        await queue.reintentarAhora(id: capture.id)
                                        _ = await queue.process(budget: .seconds(25))
                                    }
                                }
                                .tint(.accentColor)
                            }
                        }
                }
            } header: {
                Text(titulo).textCase(nil)
            }
        }
    }
}

private struct CaptureRow: View {
    let capture: PendingCapture

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(titulo).lineLimit(1)
                Spacer()
                if let amount = capture.body.amount {
                    Text(PesoFormat.format(amount)).monospacedDigit()
                }
            }
            Text(state)
                .font(.footnote)
                .foregroundStyle(capture.esFallida ? .red : .secondary)
            if let error = capture.ultimoError, !capture.estaHecha {
                Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }

    private var titulo: String {
        if case .hecha(let r) = capture.fase, !r.summary.isEmpty { return r.summary }
        if let merchant = capture.body.merchant, !merchant.isEmpty { return merchant }
        if let text = capture.body.text?.split(separator: "\n").first { return String(text) }
        return "Captura"
    }

    private var state: String {
        let date = capture.body.date ?? BogotaDate.day(capture.creadaEn)
        switch capture.fase {
        case .porEnviar: return "\(date) · se enviará cuando haya red"
        case .porSubirFoto: return "\(date) · registrada, subiendo la foto"
        case .esperandoSesion: return "\(date) · inicia sesión para enviarla"
        case .failed(let reason): return "\(date) · \(reason)"
        case .hecha(let r): return r.needsReview ? "\(date) · por revisar" : date
        }
    }
}

extension PendingCapture {
    fileprivate var estaHecha: Bool { if case .hecha = fase { return true } else { return false } }
    fileprivate var esFallida: Bool { if case .failed = fase { return true } else { return false } }
    fileprivate var sePuedeReintentar: Bool {
        switch fase {
        case .porEnviar, .esperandoSesion, .failed: true
        case .porSubirFoto, .hecha: false
        }
    }
}
