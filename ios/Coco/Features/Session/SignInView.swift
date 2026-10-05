import SwiftUI

/// El único login de la app. Habla con `/auth/login` como cliente nativo; la
/// web embebida nunca enseña el suyo.
struct SignInView: View {
    private let session: Session
    private let onSettings: (() -> Void)?

    @State private var email = ""
    @State private var password = ""
    @State private var error: String?
    @State private var isSigningIn = false

    init(session: Session, onSettings: (() -> Void)? = nil) {
        self.session = session
        self.onSettings = onSettings
    }

    private var canSignIn: Bool {
        !isSigningIn && email.contains("@") && !password.isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Correo", text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField("Contraseña", text: $password)
                        .textContentType(.password)
                        .onSubmit { if canSignIn { signIn() } }
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
                    Button(action: signIn) {
                        HStack {
                            Text("Entrar")
                            if isSigningIn {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!canSignIn)
                }
            }
            .navigationTitle("Entrar en Coco")
            .toolbar {
                if let onSettings {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button("Ajustes", systemImage: "gearshape", action: onSettings)
                    }
                }
            }
            .interactiveDismissDisabled()
        }
    }

    private func signIn() {
        guard canSignIn else { return }
        isSigningIn = true
        error = nil
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let password = password
        Task {
            do {
                _ = try await session.signIn(email: email, password: password)
                AppLog.session.info("Entró \(email, privacy: .private)")
                // RootView retira la cubierta al observar el cambio de estado.
            } catch {
                self.error = Self.message(from: error)
                AppLog.session.error("Login falló: \(self.error ?? "", privacy: .public)")
            }
            isSigningIn = false
        }
    }

    /// Un texto que diga qué hacer, no un código.
    static func message(from error: Error) -> String {
        switch APIError.from(error) {
        case .unauthenticated:
            return "Correo o contraseña incorrectos."
        case .noNetwork:
            return "Sin conexión. Revisa la red e inténtalo otra vez."
        case .timedOut:
            return "La API no respondió a tiempo. Inténtalo otra vez."
        case .rejected(_, _, let message):
            return message.isEmpty ? "La API rechazó la petición." : message
        case .server(let status):
            return status == 429
                ? "Demasiados intentos. Espera un minuto." : "La API falló (\(status)). Inténtalo en un momento."
        case .unreadableResponse:
            return "La API respondió algo que la app no entiende. Revisa la URL de la API en Ajustes."
        }
    }
}
