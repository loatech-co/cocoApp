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
                    TextField(L10n.Session.signInEmail, text: $email)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    SecureField(L10n.Session.signInPassword, text: $password)
                        .textContentType(.password)
                        .onSubmit { if canSignIn { signIn() } }
                } footer: {
                    Text(L10n.Session.signInFooter)
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
                            Text(L10n.Session.signInSubmit)
                            if isSigningIn {
                                Spacer()
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!canSignIn)
                }
            }
            .navigationTitle(L10n.Session.signInTitle)
            .toolbar {
                if let onSettings {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button(L10n.Common.settings, systemImage: "gearshape", action: onSettings)
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
    nonisolated static func message(from error: Error) -> String {
        switch APIError.from(error) {
        case .unauthenticated:
            return L10n.Session.errorBadCredentials
        case .noNetwork:
            return L10n.Session.errorNoNetwork
        case .timedOut, .cancelled:
            return L10n.Session.errorTimedOut
        case .sessionRevoked:
            return L10n.Problem.sessionRevoked
        case .rejected(let problem), .duplicate(let problem):
            return problem.userMessage(fallback: L10n.Session.errorRejected)
        case .server(let status):
            return status == 429
                ? L10n.Session.errorTooManyAttempts : L10n.Session.errorServer(status)
        case .unreadableResponse, .unreadableSuccess:
            return L10n.Session.errorUnreadableResponse
        }
    }
}
