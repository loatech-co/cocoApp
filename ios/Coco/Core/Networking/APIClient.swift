import Foundation

/// The only network door. It builds the request, sends it through the transport
/// and translates the response into a type or an `APIError`.
struct APIClient: Sendable {
    let configuration: APIConfiguration
    let transport: Transport
    let userAgent: String

    init(configuration: APIConfiguration, transport: Transport, version: String = Brand.version) {
        self.configuration = configuration
        self.transport = transport
        self.userAgent = Brand.userAgent(version: version)
    }

    /// Decodifica `Envelope<T>.data`.
    func send<T: Decodable>(_ p: APIRequest, token: String?) async throws -> T {
        let (data, response) = try await run(p, token: token)
        do {
            return try JSONDecoder().decode(Envelope<T>.self, from: data).data
        } catch {
            throw APIError.unreadableSuccess(status: response.statusCode)
        }
    }

    /// A whole paginated v2 list: asks page after page until it has
    /// gathered `meta.total`. An empty page cuts the loop, in case the total
    /// changes while it is being downloaded.
    func sendAllPages<T: Decodable>(_ page: (Int) -> APIRequest, token: String?) async throws -> [T] {
        var items: [T] = []
        var number = 1
        while true {
            let (data, response) = try await run(page(number), token: token)
            let decoded: Page<T>
            do {
                decoded = try JSONDecoder().decode(Page<T>.self, from: data)
            } catch {
                throw APIError.unreadableSuccess(status: response.statusCode)
            }
            items += decoded.data
            if decoded.data.isEmpty || items.count >= decoded.meta.total { return items }
            number += 1
        }
    }

    /// For a 204: it does not try to read anything.
    func sendWithoutBody(_ p: APIRequest, token: String?) async throws {
        _ = try await run(p, token: token)
    }

    /// The body just as it arrived, undecoded. The session uses it, since it
    /// needs the `user` byte for byte to hand it to the web without
    /// rewriting a single key.
    func sendRaw(_ p: APIRequest, token: String?) async throws -> Data {
        try await run(p, token: token).0
    }

    func upload<T: Decodable>(parts: [MultipartPart], to path: String, token: String) async throws -> T {
        let boundary = "coco-\(UUID().uuidString)"
        return try await send(
            RequestBuilder.multipart(path: path, parts: parts, boundary: boundary), token: token)
    }

    private func run(_ p: APIRequest, token: String?) async throws -> (Data, HTTPURLResponse) {
        let request = RequestBuilder.urlRequest(
            p, base: configuration.apiV2, token: token, userAgent: userAgent)
        let data: Data
        let response: HTTPURLResponse
        do {
            (data, response) = try await transport.data(for: request)
        } catch {
            throw APIError.from(error)
        }
        guard (200...299).contains(response.statusCode) else {
            throw APIError.from(status: response.statusCode, body: data)
        }
        return (data, response)
    }
}
