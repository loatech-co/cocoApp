import SwiftUI

/// Lo que se capturó desde el teléfono: pendientes (con cuenta), esperando
/// sesión, fallidas y hechas de los últimos 30 días. Se lee de la cola
/// local, así que tiene contenido sin red.
struct CapturesView: View {
    private let cola: CaptureQueue
    private let navegacion: any Navigation

    @State private var capturas: [PendingCapture] = []
    @State private var cargado = false

    init(cola: CaptureQueue, navegacion: any Navigation) {
        self.cola = cola
        self.navegacion = navegacion
    }

    private var pendientes: [PendingCapture] {
        capturas.filter {
            if case .porEnviar = $0.fase { return true }
            if case .porSubirFoto = $0.fase { return true }
            return false
        }
    }
    private var esperandoSesion: [PendingCapture] { capturas.filter { $0.fase == .esperandoSesion } }
    private var fallidas: [PendingCapture] {
        capturas.filter { if case .fallida = $0.fase { return true } else { return false } }
    }
    private var hechas: [PendingCapture] {
        let limite = Date.now.addingTimeInterval(-30 * 86_400)
        return capturas.filter {
            if case .hecha(let r) = $0.fase { return r.terminadaEn >= limite }
            return false
        }
    }

    var body: some View {
        NavigationStack {
            List {
                if !cargado {
                    ProgressView()
                } else if capturas.isEmpty {
                    ContentUnavailableView(
                        "Nada capturado todavía",
                        systemImage: "tray",
                        description: Text("Lo que anotes desde el teléfono aparece aquí, con red o sin ella.")
                    )
                }
                seccion("Pendientes de envío · \(pendientes.count)", pendientes)
                seccion("Esperando sesión", esperandoSesion)
                seccion("Con error", fallidas)
                seccion("Enviadas en los últimos 30 días", hechas)
                Section {
                    Button {
                        navegacion.ir(.bienvenida)
                    } label: {
                        Label("Automatizaciones", systemImage: "wand.and.stars")
                    }
                }
            }
            .navigationTitle("Capturas")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        navegacion.ir(.formularioRapido(conCamara: false))
                    } label: {
                        Label("Nueva captura", systemImage: "plus")
                    }
                }
            }
            .task {
                await cola.purgar()
                capturas = await cola.todas()
                cargado = true
                for await lista in cola.cambios {
                    capturas = lista
                }
            }
        }
    }

    @ViewBuilder
    private func seccion(_ titulo: String, _ elementos: [PendingCapture]) -> some View {
        if !elementos.isEmpty {
            Section {
                ForEach(elementos) { captura in
                    CaptureRow(captura: captura)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if !captura.estaHecha {
                                Button("Descartar", role: .destructive) {
                                    Task { try? await cola.descartar(id: captura.id) }
                                }
                            }
                            if captura.sePuedeReintentar {
                                Button("Reintentar") {
                                    Task {
                                        await cola.reintentarAhora(id: captura.id)
                                        _ = await cola.procesar(presupuesto: .seconds(25))
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
    let captura: PendingCapture

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(titulo).lineLimit(1)
                Spacer()
                if let monto = captura.cuerpo.monto {
                    Text(PesoFormat.formatear(monto)).monospacedDigit()
                }
            }
            Text(estado)
                .font(.footnote)
                .foregroundStyle(captura.esFallida ? .red : .secondary)
            if let error = captura.ultimoError, !captura.estaHecha {
                Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }

    private var titulo: String {
        if case .hecha(let r) = captura.fase, !r.resumen.isEmpty { return r.resumen }
        if let comercio = captura.cuerpo.comercio, !comercio.isEmpty { return comercio }
        if let texto = captura.cuerpo.texto?.split(separator: "\n").first { return String(texto) }
        return "Captura"
    }

    private var estado: String {
        let fecha = captura.cuerpo.fecha ?? BogotaDate.dia(captura.creadaEn)
        switch captura.fase {
        case .porEnviar: return "\(fecha) · se enviará cuando haya red"
        case .porSubirFoto: return "\(fecha) · registrada, subiendo la foto"
        case .esperandoSesion: return "\(fecha) · inicia sesión para enviarla"
        case .fallida(let motivo): return "\(fecha) · \(motivo)"
        case .hecha(let r): return r.porRevisar ? "\(fecha) · por revisar" : fecha
        }
    }
}

extension PendingCapture {
    fileprivate var estaHecha: Bool { if case .hecha = fase { return true } else { return false } }
    fileprivate var esFallida: Bool { if case .fallida = fase { return true } else { return false } }
    fileprivate var sePuedeReintentar: Bool {
        switch fase {
        case .porEnviar, .esperandoSesion, .fallida: true
        case .porSubirFoto, .hecha: false
        }
    }
}
