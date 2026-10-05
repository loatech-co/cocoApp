import SwiftUI

/// La URL de la API, la versión, cuándo caduca la firma y una prueba de los
/// avisos. Vive como hoja: se llega desde Más y desde la ficha de entrar.
struct AjustesView: View {
    let d: Dependencias

    @Environment(\.dismiss) private var dismiss
    @State private var urlTexto: String
    @State private var resultadoDelAviso: String?
    @State private var guardada = false

    init(d: Dependencias) {
        self.d = d
        _urlTexto = State(initialValue: d.configuracion.base.absoluteString)
    }

    private var validacion: Validacion { Self.validar(urlTexto) }
    private var cambio: Bool { validacion.url != nil && validacion.url != d.configuracion.base }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $urlTexto)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if let motivo = validacion.motivo {
                        Text(motivo).font(.footnote).foregroundStyle(.red)
                    }
                    Button("Guardar y cerrar sesión", action: guardar)
                        .disabled(!cambio)
                    Button("Restablecer la del bundle", action: restablecer)
                } header: {
                    Text("URL de la API").textCase(nil)
                } footer: {
                    Text(guardada
                         ? "Guardada. Cierra la app del todo y vuelve a abrirla para usar la nueva URL."
                         : "Cambiarla cierra la sesión de este teléfono; la nueva URL se usa al volver a abrir la app.")
                }

                Section {
                    LabeledContent("Versión", value: "\(Marca.version) (\(Self.build))")
                    LabeledContent("La firma caduca", value: Self.textoDeVencimiento(LectorDePerfil.delBundle()))
                    LabeledContent("Pendientes de envío", value: "\(d.pendientes)")
                    LabeledContent("API", value: d.configuracion.base.absoluteString)
                } header: {
                    Text("Esta instalación").textCase(nil)
                }

                Section {
                    Button("Probar notificación") { Task { await probarAviso() } }
                    if let resultadoDelAviso {
                        Text(resultadoDelAviso).font(.footnote).foregroundStyle(.secondary)
                    }
                } header: {
                    Text("Avisos").textCase(nil)
                }
            }
            .navigationTitle("Ajustes")
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Listo") { dismiss() }
                }
            }
        }
    }

    // MARK: Acciones

    private func guardar() {
        guard let url = validacion.url else { return }
        ConfiguracionDeLaAPI.guardar(base: url, defaults: d.defaults)
        guardada = true
        Bitacora.app.info("URL de la API cambiada a \(url.absoluteString, privacy: .public)")
        Task { await d.salir() }
    }

    private func restablecer() {
        ConfiguracionDeLaAPI.restablecer(defaults: d.defaults)
        urlTexto = ConfiguracionDeLaAPI.actual(defaults: d.defaults).base.absoluteString
        guardada = urlTexto != d.configuracion.base.absoluteString
        if guardada { Task { await d.salir() } }
    }

    private func probarAviso() async {
        guard await d.notificador.pedirPermiso() else {
            resultadoDelAviso = "Sin permiso de avisos. Actívalo en Ajustes de iOS → Coco."
            return
        }
        let prueba = ResultadoGuardado(transactionId: 0, resumen: "Prueba: si ves esto, los avisos funcionan.", repetido: false, fusionado: false, porRevisar: false, terminadaEn: .now)
        await d.notificador.capturaRegistrada(prueba, origen: .iosManual)
        resultadoDelAviso = "Enviada. Aparece arriba aunque la app esté abierta."
    }

    // MARK: Puros

    struct Validacion: Equatable {
        let url: URL?
        let motivo: String?
    }

    /// `http(s)://host[:puerto]`, sin ruta ni consulta: la base a la que la
    /// app añade `/api/v1`.
    static func validar(_ texto: String) -> Validacion {
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !limpio.isEmpty else { return Validacion(url: nil, motivo: nil) }
        guard let url = URL(string: limpio), let esquema = url.scheme?.lowercased(), let host = url.host(), !host.isEmpty else {
            return Validacion(url: nil, motivo: "Escribe una URL completa, como https://cocoapp.ejemplo.")
        }
        guard esquema == "http" || esquema == "https" else {
            return Validacion(url: nil, motivo: "Solo http o https.")
        }
        let ruta = url.path()
        guard ruta.isEmpty || ruta == "/", url.query() == nil, url.fragment() == nil else {
            return Validacion(url: nil, motivo: "Solo el servidor, sin ruta: la app añade /api/v1.")
        }
        return Validacion(url: ConfiguracionDeLaAPI(base: url).base, motivo: nil)
    }

    static func textoDeVencimiento(_ vence: Date?, ahora: Date = .now) -> String {
        guard let vence else { return "No disponible (simulador o sin perfil)" }
        let dias = AvisoDeVencimiento.diasRestantes(vence: vence, ahora: ahora)
        let fecha = vence.formatted(date: .abbreviated, time: .omitted)
        switch dias {
        case ..<0: return "Caducó el \(fecha)"
        case 0: return "Hoy (\(fecha))"
        case 1: return "Mañana (\(fecha))"
        default: return "\(fecha) · quedan \(dias) días"
        }
    }

    private static var build: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
    }
}
