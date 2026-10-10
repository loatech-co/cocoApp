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
        guard let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty else {
            publish(.signedOut)
            return
        }
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
        if let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty {
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
    /// ONLY a real 401 wipes the Keychain.
    private func refresh(retryingNetwork: Bool) async throws -> TokenPair {
        guard let refresh = try? keychain.read(.refreshToken), !refresh.isEmpty else {
            closeLocally()
            throw SessionError.signedOut
        }
        var attempts = retryingNetwork ? 2 : 1
        while true {
            attempts -= 1
            do {
                let data = try await api.sendRaw(
                    RequestBuilder.refresh(refreshToken: refresh), token: nil)
                let (response, userJSON) = try Self.decodeSession(data)
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
            } catch {
                // Network (already retried), server down or an odd response: none
                // of that says the session died. The Keychain is kept.
                publish(.offline(last: tokens?.profile))
                throw SessionError.offline
            }
        }
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

/// Cuts out, byte by byte, the object value of a key inside another object
/// of a JSON. It interprets nothing: it only counts braces and respects strings.
enum JSONSlicer {
    // A byte scanner: one case per structural character and a state that
    // crosses them all. Splitting it into functions forces passing that state from hand
    // to hand and reads worse than the whole loop.
    // swiftlint:disable:next cyclomatic_complexity function_body_length
    static func object(key: String, inside parent: String, at data: Data) -> Data? {
        let bytes = [UInt8](data)
        var i = 0
        var depth = 0
        var currentKey: [UInt8] = []
        var awaitingValue = false
        var insideParent = false
        var parentDepth = 0
        let target = Array(key.utf8)
        let parentName = Array(parent.utf8)

        while i < bytes.count {
            let b = bytes[i]
            switch b {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                let content = Array(bytes[(i + 1)..<end])
                // A string followed by ':' is a key; if not, it is a value.
                var j = end + 1
                while j < bytes.count, isBlankByte(bytes[j]) { j += 1 }
                if j < bytes.count, bytes[j] == UInt8(ascii: ":") {
                    currentKey = content
                    awaitingValue = true
                    i = j + 1
                    continue
                }
                awaitingValue = false
                i = end + 1
            case UInt8(ascii: "{"):
                if awaitingValue {
                    if depth == 1, currentKey == parentName {
                        insideParent = true
                        parentDepth = 2
                    } else if insideParent, depth == parentDepth, currentKey == target {
                        guard let close = endOfObject(bytes, from: i) else { return nil }
                        return Data(bytes[i...close])
                    }
                }
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "}"):
                depth -= 1
                if insideParent, depth < parentDepth { insideParent = false }
                i += 1
            case UInt8(ascii: "["):
                awaitingValue = false
                depth += 1
                i += 1
            case UInt8(ascii: "]"):
                depth -= 1
                i += 1
            default:
                if !isBlankByte(b) { awaitingValue = false }
                i += 1
            }
        }
        return nil
    }

    private static func isBlankByte(_ b: UInt8) -> Bool {
        b == 0x20 || b == 0x0A || b == 0x0D || b == 0x09
    }

    /// Index of the quote that closes the string opened at `from`.
    private static func endOfString(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from + 1
        while i < bytes.count {
            if bytes[i] == UInt8(ascii: "\\") {
                i += 2
                continue
            }
            if bytes[i] == UInt8(ascii: "\"") { return i }
            i += 1
        }
        return nil
    }

    /// Index of the brace that closes the object opened at `from`.
    private static func endOfObject(_ bytes: [UInt8], from: Int) -> Int? {
        var i = from
        var level = 0
        while i < bytes.count {
            switch bytes[i] {
            case UInt8(ascii: "\""):
                guard let end = endOfString(bytes, from: i) else { return nil }
                i = end
            case UInt8(ascii: "{"), UInt8(ascii: "["):
                level += 1
            case UInt8(ascii: "}"), UInt8(ascii: "]"):
                level -= 1
                if level == 0 { return i }
            default:
                break
            }
            i += 1
        }
        return nil
    }
}
