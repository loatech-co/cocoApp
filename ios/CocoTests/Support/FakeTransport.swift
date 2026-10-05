import Foundation

@testable import Coco

/// Un transporte programable: responde lo que se le diga y recuerda lo que
/// recibió. Lo comparten las pruebas de red, sesión y cola.
final class FakeTransport: Transport, @unchecked Sendable {
    enum Reply {
        case http(Int, String)
        case falla(Error)
    }

    private let cerrojo = NSLock()
    private var cola: [Reply]
    private(set) var recibidas: [URLRequest] = []

    init(_ respuestas: [Reply] = []) {
        cola = respuestas
    }

    func responder(_ r: Reply) {
        cerrojo.lock()
        defer { cerrojo.unlock() }
        cola.append(r)
    }

    private func siguiente(para peticion: URLRequest) -> Reply {
        cerrojo.withLock {
            recibidas.append(peticion)
            return cola.isEmpty ? Reply.http(500, "") : cola.removeFirst()
        }
    }

    func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse) {
        switch siguiente(para: peticion) {
        case .falla(let error):
            throw error
        case .http(let status, let cuerpo):
            let url = peticion.url ?? URL(fileURLWithPath: "/")
            let respuesta = HTTPURLResponse(
                url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            guard let respuesta else { throw APIError.respuestaIlegible }
            return (Data(cuerpo.utf8), respuesta)
        }
    }
}
