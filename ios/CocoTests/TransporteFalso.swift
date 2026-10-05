import Foundation
@testable import Coco

/// Un transporte programable: responde lo que se le diga y recuerda lo que
/// recibió. Lo comparten las pruebas de red, sesión y cola.
final class TransporteFalso: Transporte, @unchecked Sendable {
    enum Respuesta {
        case http(Int, String)
        case falla(Error)
    }

    private let cerrojo = NSLock()
    private var cola: [Respuesta]
    private(set) var recibidas: [URLRequest] = []

    init(_ respuestas: [Respuesta] = []) {
        cola = respuestas
    }

    func responder(_ r: Respuesta) {
        cerrojo.lock(); defer { cerrojo.unlock() }
        cola.append(r)
    }

    private func siguiente(para peticion: URLRequest) -> Respuesta {
        cerrojo.withLock {
            recibidas.append(peticion)
            return cola.isEmpty ? Respuesta.http(500, "") : cola.removeFirst()
        }
    }

    func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse) {
        switch siguiente(para: peticion) {
        case .falla(let error):
            throw error
        case .http(let status, let cuerpo):
            let url = peticion.url ?? URL(fileURLWithPath: "/")
            let respuesta = HTTPURLResponse(url: url, statusCode: status, httpVersion: nil, headerFields: ["Content-Type": "application/json"])
            guard let respuesta else { throw ErrorDeAPI.respuestaIlegible }
            return (Data(cuerpo.utf8), respuesta)
        }
    }
}
