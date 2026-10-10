import Foundation

/// The real transport. Ephemeral session: no cache or cookies on disk, because
/// the only long-lived credential lives in the Keychain and not here.
struct URLSessionTransport: Transport {
    let session: URLSession

    init(session: URLSession = URLSessionTransport.defaultSession()) {
        self.session = session
    }

    static func defaultSession() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        // Waiting for the network is governed by the queue with its retries, not by URLSession.
        c.waitsForConnectivity = false
        return URLSession(configuration: c)
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        let (data, response) = try await session.data(for: request)
        guard let http = response as? HTTPURLResponse else { throw APIError.unreadableResponse }
        return (data, http)
    }
}
