import Foundation

@testable import Coco

/// Un transporte programable: responde lo que se le diga y recuerda lo que
/// recibió. Lo comparten las pruebas de red, sesión y cola.
final class FakeTransport: Transport, @unchecked Sendable {
    enum Reply {
        case http(Int, String)
        case falla(Error)
    }

    private let lock = NSLock()
    private var queue: [Reply]
    private(set) var recibidas: [URLRequest] = []

    init(_ respuestas: [Reply] = []) {
        queue = respuestas
    }

    func responder(_ r: Reply) {
        lock.lock()
        defer { lock.unlock() }
        queue.append(r)
    }

    private func siguiente(for request: URLRequest) -> Reply {
        lock.withLock {
            recibidas.append(request)
            return queue.isEmpty ? Reply.http(500, "") : queue.removeFirst()
        }
    }

    func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
        switch siguiente(for: request) {
        case .falla(let error):
            throw error
        case .http(let status, let body):
            let url = request.url ?? URL(fileURLWithPath: "/")
            let response = HTTPURLResponse(
                url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            guard let response else { throw APIError.unreadableResponse }
            return (Data(body.utf8), response)
        }
    }
}
