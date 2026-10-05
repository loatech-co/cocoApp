import SwiftUI

/// La URL de la API, la versión, cuándo caduca la firma y una prueba de los
/// avisos. Vive como hoja: se llega desde Más y desde la ficha de entrar.
struct SettingsView: View {
    let d: Dependencies

    @Environment(\.dismiss) private var dismiss
    @State private var urlText: String
    @State private var testNotificationResult: String?
    @State private var saved = false

    init(d: Dependencies) {
        self.d = d
        _urlText = State(initialValue: d.configuration.base.absoluteString)
    }

    private var validation: Validation { Self.validate(urlText) }
    private var hasChanged: Bool { validation.url != nil && validation.url != d.configuration.base }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("https://…", text: $urlText)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if let reason = validation.reason {
                        Text(reason).font(.footnote).foregroundStyle(.red)
                    }
                    Button("Guardar y cerrar sesión", action: save)
                        .disabled(!hasChanged)
                    Button("Restablecer la del bundle", action: reset)
                } header: {
                    Text("URL de la API").textCase(nil)
                } footer: {
                    Text(
                        saved
                            ? "Guardada. Cierra la app del todo y vuelve a abrirla para usar la nueva URL."
                            : """
                            Cambiarla cierra la sesión de este teléfono; la nueva URL se usa al volver a abrir \
                            la app.
                            """
                    )
                }

                Section {
                    LabeledContent("Versión", value: "\(Brand.version) (\(Self.build))")
                    LabeledContent(
                        "La firma caduca", value: Self.expiryText(ProvisioningProfileReader.fromBundle()))
                    LabeledContent("Pendientes de envío", value: "\(d.pending)")
                    LabeledContent("API", value: d.configuration.base.absoluteString)
                } header: {
                    Text("Esta instalación").textCase(nil)
                }

                Section {
                    Button("Probar notificación") { Task { await sendTestNotification() } }
                    if let testNotificationResult {
                        Text(testNotificationResult).font(.footnote).foregroundStyle(.secondary)
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

    private func save() {
        guard let url = validation.url else { return }
        APIConfiguration.save(base: url, defaults: d.defaults)
        saved = true
        AppLog.app.info("URL de la API cambiada a \(url.absoluteString, privacy: .public)")
        Task { await d.signOut() }
    }

    private func reset() {
        APIConfiguration.reset(defaults: d.defaults)
        urlText = APIConfiguration.current(defaults: d.defaults).base.absoluteString
        saved = urlText != d.configuration.base.absoluteString
        if saved { Task { await d.signOut() } }
    }

    private func sendTestNotification() async {
        guard await d.notifier.requestPermission() else {
            testNotificationResult = "Sin permiso de avisos. Actívalo en Ajustes de iOS → Coco."
            return
        }
        let sample = SavedResult(
            transactionId: 0, summary: "Prueba: si ves esto, los avisos funcionan.", duplicate: false, merged: false,
            needsReview: false, finishedAt: .now)
        await d.notifier.captureSaved(sample, source: .iosManual)
        testNotificationResult = "Enviada. Aparece arriba aunque la app esté abierta."
    }

    // MARK: Puros

    struct Validation: Equatable {
        let url: URL?
        let reason: String?
    }

    /// `http(s)://host[:puerto]`, sin ruta ni consulta: la base a la que la
    /// app añade `/api/v1`.
    static func validate(_ text: String) -> Validation {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return Validation(url: nil, reason: nil) }
        guard let url = URL(string: cleaned), let scheme = url.scheme?.lowercased(), let host = url.host(),
            !host.isEmpty
        else {
            return Validation(url: nil, reason: "Escribe una URL completa, como https://cocoapp.ejemplo.")
        }
        guard scheme == "http" || scheme == "https" else {
            return Validation(url: nil, reason: "Solo http o https.")
        }
        let path = url.path()
        guard path.isEmpty || path == "/", url.query() == nil, url.fragment() == nil else {
            return Validation(url: nil, reason: "Solo el servidor, sin ruta: la app añade /api/v1.")
        }
        return Validation(url: APIConfiguration(base: url).base, reason: nil)
    }

    static func expiryText(_ expiresAt: Date?, now: Date = .now) -> String {
        guard let expiresAt else { return "No disponible (simulador o sin perfil)" }
        let days = ExpiryReminder.daysLeft(expiresAt: expiresAt, now: now)
        let date = expiresAt.formatted(date: .abbreviated, time: .omitted)
        switch days {
        case ..<0: return "Caducó el \(date)"
        case 0: return "Hoy (\(date))"
        case 1: return "Mañana (\(date))"
        default: return "\(date) · quedan \(days) días"
        }
    }

    private static var build: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
    }
}
