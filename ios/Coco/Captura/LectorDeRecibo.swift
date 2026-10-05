import CoreGraphics
import Foundation
import Vision

/// Lo que el formulario necesita de un lector de recibos: texto a partir de
/// una imagen. Es protocolo para que las pruebas lo doblen sin Vision ni
/// cámara; `LectorDeRecibo` es el real.
protocol LectorDeTextoDeRecibo: Sendable {
    /// Las líneas reconocidas, de arriba abajo, separadas por salto de línea.
    func texto(de imagen: CGImage) async throws -> String
}

/// OCR en el teléfono con Vision. El texto sale de aquí y viaja a
/// `/transactions/interpret`; la foto no sale del dispositivo hasta que la
/// cola la sube como soporte.
struct LectorDeRecibo: LectorDeTextoDeRecibo, Sendable {
    /// Por orden de preferencia. Los recibos son colombianos; si el sistema
    /// no trae es-CO cae a es-ES, y en-US queda de red de seguridad.
    var idiomasPreferidos: [String] = ["es-CO", "es-ES", "en-US"]

    func texto(de imagen: CGImage) async throws -> String {
        let idiomas = Self.idiomasDisponibles(idiomasPreferidos, soportados: Self.soportados())
        // `perform` es síncrono y pesado: fuera del hilo principal. Se leen los
        // resultados después, sin completion handler, para que un error de
        // `perform` no pueda cruzarse con una continuación ya resumida.
        return try await Task.detached(priority: .userInitiated) {
            let peticion = VNRecognizeTextRequest()
            peticion.recognitionLevel = .accurate
            peticion.usesLanguageCorrection = true
            peticion.recognitionLanguages = idiomas
            try VNImageRequestHandler(cgImage: imagen, options: [:]).perform([peticion])
            let observaciones = peticion.results ?? []
            return Self.ordenar(observaciones.compactMap { o in
                o.topCandidates(1).first.map { (texto: $0.string, y: o.boundingBox.midY) }
            })
        }.value
    }

    /// Los preferidos que el sistema soporta, en el orden pedido. Sin ninguno,
    /// en-US: Vision siempre lo trae y un recibo con cifras se lee igual.
    static func idiomasDisponibles(_ preferidos: [String], soportados: [String]) -> [String] {
        let disponibles = preferidos.filter { soportados.contains($0) }
        return disponibles.isEmpty ? ["en-US"] : disponibles
    }

    /// Vision devuelve las cajas con origen abajo a la izquierda: la línea
    /// más alta tiene la `y` mayor.
    static func ordenar(_ lineas: [(texto: String, y: CGFloat)]) -> String {
        lineas.sorted { $0.y > $1.y }.map(\.texto).joined(separator: "\n")
    }

    private static func soportados() -> [String] {
        let peticion = VNRecognizeTextRequest()
        peticion.recognitionLevel = .accurate
        return (try? peticion.supportedRecognitionLanguages()) ?? []
    }
}
