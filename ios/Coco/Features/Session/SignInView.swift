import SwiftUI

/// El único login de la app. Habla con `/auth/login` como cliente nativo; la
/// web embebida nunca enseña el suyo.
struct SignInView: View {
    private let sesion: Session
    private let alAjustes: (() -> Void)?

    @State private var correo = ""
    @State private var contrasena = ""
    @State private var error: String?
    @State private var entrando = false

    init(sesion: Session, alAjustes: (() -> Void)? = nil) {
        self.sesion = sesion
        self.alAjustes = alAjustes
    }

    private var puedeEntrar: Bool {
        !entrando && correo.contains("@") && !contrasena.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Correo", text: $correo)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Contraseña", text: $contrasena)
                        .textContentType(.password)
                        .onSubmit { if puedeEntrar { entrar() } }
                } footer: {
                    Text("La misma cuenta que en la web.")
                }

                if let error {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }

                Section {
                    Button(action: entrar) {
                        HStack {
                            Text("Entrar")
                            if entrando {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!puedeEntrar)
                }
            }
            .navigationTitle("Entrar en Coco")
            .toolbar {
                if let alAjustes {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Ajustes", systemImage: "gearshape", action: alAjustes)
                    }
                }
            }
            .interactiveDismissDisabled()
        }
    }

    private func entrar() {
        guard puedeEntrar else { return }
        entrando = true
        error = nil
        let correo = correo.trimmingCharacters(in: .whitespacesAndNewlines)
        let contrasena = contrasena
        Task {
            do {
                _ = try await sesion.entrar(correo: correo, contrasena: contrasena)
                AppLog.sesion.info("Entró \(correo, privacy: .private)")
                // RootView retira la cubierta al observar el cambio de estado.
            } catch {
                self.error = Self.mensaje(de: error)
                AppLog.sesion.error("Login falló: \(self.error ?? "", privacy: .public)")
            }
            entrando = false
        }
    }

    /// Un texto que diga qué hacer, no un código.
    static func mensaje(de error: Error) -> String {
        switch APIError.desde(error) {
        case .noAutenticado:
            return "Correo o contraseña incorrectos."
        case .sinRed:
            return "Sin conexión. Revisa la red e inténtalo otra vez."
        case .tiempoAgotado:
            return "La API no respondió a tiempo. Inténtalo otra vez."
        case .rechazada(_, _, let mensaje):
            return mensaje.isEmpty ? "La API rechazó la petición." : mensaje
        case .servidor(let status):
            return status == 429
                ? "Demasiados intentos. Espera un minuto." : "La API falló (\(status)). Inténtalo en un momento."
        case .respuestaIlegible:
            return "La API respondió algo que la app no entiende. Revisa la URL de la API en Ajustes."
        }
    }
}
