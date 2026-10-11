import Foundation

/// The only owner of the refresh token and the ONLY rotator of the Supabase
/// family on the phone. The queue, the webview, the intents and the background
/// task all go through here; two `/auth/refresh` at once would trigger
/// GoTrue's reuse detection and kill the whole family.
final actor NativeSession: Session {
    private struct TokenPair {
        var access: String
        var expiresAt: Date
        /// The `user` just as it arrived: the web receives it without a single key rewritten.
        var userJSON: Data
        var profile: PublicProfile
    }

    private let api: APIClient
    private let keychain: KeychainStore
    private let clock: @Sendable () -> Date
    /// Greater than the web's 60 s: what the web receives through the bridge must
    /// never trigger its own refresh loop.
    private let margin: TimeInterval

    private var tokens: TokenPair?
    /// The single-flight: whoever arrives while a refresh is in flight
    /// waits for THAT one, it does not open another.
    private var refreshInFlight: Task<TokenPair, Error>?
    private(set) var currentState: SessionState = .loading

    nonisolated let changes: AsyncStream<SessionState>
    private nonisolated let continuation: AsyncStream<SessionState>.Continuation

    init(
        api: APIClient, keychain: KeychainStore, clock: @Sendable @escaping () -> Date = Date.init,
        margin: TimeInterval = 120
    ) {
        self.api = api
        self.keychain = keychain
        self.clock = clock
        self.margin = margin
        let (stream, cont) = AsyncStream.makeStream(of: SessionState.self)
        changes = stream
        continuation = cont
    }

    var state: SessionState { currentState }

    // MARK: Signing in and restoring

    /// At launch: if there is a refresh token in the Keychain it is refreshed; if not, there is no
    /// session. A network failure leaves the Keychain intact and goes offline.
    func restore() async {
        // The errors already left the state where it belongs (signedOut or offline).
        _ = try? await sharedRefresh()
    }

    func signIn(email: String, password: String) async throws -> PublicProfile {
        let data = try await api.sendRaw(
            RequestBuilder.login(email: email, password: password), token: nil)
        let (response, userJSON) = try Self.decodeSession(data)
        guard let refresh = response.refreshToken else { throw APIError.unreadableResponse }
        try keychain.write(refresh, for: .refreshToken)
        publish(tokens: Self.tokens(from: response, userJSON: userJSON, now: clock()))
        return response.user
    }

    // MARK: Access token

    func validAccessToken() async throws -> String {
        if let tokens, isValid(tokens) { return tokens.access }
        return try await sharedRefresh().access
    }

    /// After an unexpected 401: refreshes even if the clock thinks it is still valid.
    func refreshNow() async throws {
        _ = try await sharedRefresh()
    }

    func webSession() async throws -> WebSession {
        let access = try await validAccessToken()
        guard let tokens, tokens.access == access else { throw SessionError.signedOut }
        let remaining = Int(tokens.expiresAt.timeIntervalSince(clock()).rounded(.down))
        return WebSession(accessToken: access, expiresIn: remaining, userJSON: tokens.userJSON)
    }

    // MARK: Signing out

    /// Tells the server with the refresh token and wipes the Keychain no matter what:
    /// whoever tapped «salir» does not see their session again because of a network failure.
    func signOut() async {
        refreshInFlight?.cancel()
        if let refresh = try? storedRefreshToken() {
            try? await api.sendWithoutBody(RequestBuilder.logout(refreshToken: refresh), token: nil)
        }
        closeLocally()
    }

    /// Local only: the web reported that the server already closed the family.
    func discard() async {
        refreshInFlight?.cancel()
        closeLocally()
    }

    // MARK: Refresh

    private func sharedRefresh() async throws -> TokenPair {
        if let inFlight = refreshInFlight {
            return try await inFlight.value
        }
        let task = Task { try await self.refresh(retryingNetwork: true) }
        refreshInFlight = task
        defer { refreshInFlight = nil }
        return try await task.value
    }

    /// Order: call → write the new refresh token to the keychain → publish.
    /// A `URLError` NEVER wipes the Keychain: it retries once with the same
    /// refresh token (within GoTrue's reuse interval it returns the same
    /// session) and, if it fails again, keeps everything and goes offline.
    /// ONLY a real 401 wipes the Keychain. A cancelled refresh (`signOut`, `discard`)
    /// publishes nothing: whoever cancelled it already decided the state.
    private func refresh(retryingNetwork: Bool) async throws -> TokenPair {
        let refresh = try refreshTokenOrPublish()
        var attempts = retryingNetwork ? 2 : 1
        while true {
            attempts -= 1
            do {
                let data = try await api.sendRaw(
                    RequestBuilder.refresh(refreshToken: refresh), token: nil)
                let (response, userJSON) = try Self.decodeSession(data)
                // Cancelled while the answer was on its way: the family is closed, or closing,
                // on this phone. The rotated token is not kept and nothing is published.
                try Task.checkCancellation()
                // If for whatever reason no refresh token came, the previous one is still
                // the last one known: it is not overwritten with anything.
                if let newRefresh = response.refreshToken {
                    try keychain.write(newRefresh, for: .refreshToken)
                }
                let tokens = Self.tokens(from: response, userJSON: userJSON, now: clock())
                publish(tokens: tokens)
                return tokens
            } catch APIError.unauthenticated, APIError.sessionRevoked {
                closeLocally()
                throw SessionError.signedOut
            } catch let error as APIError where error.isNetworkError && attempts > 0 {
                continue
            } catch APIError.cancelled {
                throw APIError.cancelled
            } catch is CancellationError {
                throw APIError.cancelled
            } catch {
                // Network (already retried), server down or an odd response: none
                // of that says the session died. The Keychain is kept.
                publish(.offline(last: tokens?.profile))
                throw SessionError.offline
            }
        }
    }

    /// The token to refresh with. No token is a closed session; a Keychain that
    /// cannot be read (locked after a reboot, for instance) is NOT: the token may
    /// well still be there, so the state goes offline and nothing is wiped.
    private func refreshTokenOrPublish() throws -> String {
        let stored: String?
        do {
            stored = try storedRefreshToken()
        } catch {
            publish(.offline(last: tokens?.profile))
            throw SessionError.offline
        }
        guard let stored else {
            closeLocally()
            throw SessionError.signedOut
        }
        return stored
    }

    /// `nil` when there is no token; it throws when the Keychain could not be read.
    private func storedRefreshToken() throws -> String? {
        guard let refresh = try keychain.read(.refreshToken), !refresh.isEmpty else { return nil }
        return refresh
    }

    private func isValid(_ t: TokenPair) -> Bool {
        t.expiresAt.timeIntervalSince(clock()) >= margin
    }

    private func publish(tokens newTokens: TokenPair) {
        tokens = newTokens
        publish(.active(newTokens.profile))
    }

    private func closeLocally() {
        try? keychain.delete(.refreshToken)
        tokens = nil
        publish(.signedOut)
    }

    private func publish(_ state: SessionState) {
        guard state != currentState else { return }
        currentState = state
        continuation.yield(state)
    }

    // MARK: Reading the response

    private static func tokens(from r: SessionResponse, userJSON: Data, now: Date) -> TokenPair {
        TokenPair(
            access: r.accessToken, expiresAt: now.addingTimeInterval(TimeInterval(r.expiresIn)), userJSON: userJSON,
            profile: r.user)
    }

    /// Decodes the envelope and, separately, cuts the raw `user` out of the body. If
    /// the cut does not find the object, what was decoded is serialized again
    /// with `JSONSerialization`: same keys, same values.
    private static func decodeSession(_ data: Data) throws -> (SessionResponse, Data) {
        let response: SessionResponse
        do {
            response = try JSONDecoder().decode(Envelope<SessionResponse>.self, from: data).data
        } catch {
            throw APIError.unreadableResponse
        }
        if let raw = JSONSlicer.object(key: "user", inside: "data", at: data) {
            return (response, raw)
        }
        guard let envelope = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let data = envelope["data"] as? [String: Any],
            let user = data["user"],
            let userJSON = try? JSONSerialization.data(withJSONObject: user)
        else { throw APIError.unreadableResponse }
        return (response, userJSON)
    }
}
