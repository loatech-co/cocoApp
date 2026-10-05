import CoreGraphics
import Foundation
import Vision

/// Lo que el formulario necesita de un lector de recibos: texto a partir de
/// una imagen. Es protocolo para que las pruebas lo doblen sin Vision ni
/// cámara; `ReceiptReader` es el real.
protocol ReceiptTextReader: Sendable {
    /// Las líneas reconocidas, de arriba abajo, separadas por salto de línea.
    func text(from image: CGImage) async throws -> String
}

/// OCR en el teléfono con Vision. El texto sale de aquí y viaja a
/// `/transactions/interpret`; la foto no sale del dispositivo hasta que la
/// cola la sube como soporte.
struct ReceiptReader: ReceiptTextReader, Sendable {
    /// Por orden de preferencia. Los recibos son colombianos; si el sistema
    /// no trae es-CO cae a es-ES, y en-US queda de red de seguridad.
    var preferredLanguages: [String] = ["es-CO", "es-ES", "en-US"]

    func text(from image: CGImage) async throws -> String {
        let languages = Self.availableLanguages(preferredLanguages, supported: Self.supported())
        // `perform` es síncrono y pesado: fuera del hilo principal. Se leen los
        // resultados después, sin completion handler, para que un error de
        // `perform` no pueda cruzarse con una continuación ya resumida.
        return try await Task.detached(priority: .userInitiated) {
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = true
            request.recognitionLanguages = languages
            try VNImageRequestHandler(cgImage: image, options: [:]).perform([request])
            let observations = request.results ?? []
            return Self.orderedText(
                observations.compactMap { observation in
                    observation.topCandidates(1).first.map { (text: $0.string, y: observation.boundingBox.midY) }
                })
        }.value
    }

    /// Los preferidos que el sistema soporta, en el orden pedido. Sin ninguno,
    /// en-US: Vision siempre lo trae y un recibo con cifras se lee igual.
    static func availableLanguages(_ preferred: [String], supported: [String]) -> [String] {
        let available = preferred.filter { supported.contains($0) }
        return available.isEmpty ? ["en-US"] : available
    }

    /// Vision devuelve las cajas con origen abajo a la izquierda: la línea
    /// más alta tiene la `y` mayor.
    static func orderedText(_ lines: [(text: String, y: CGFloat)]) -> String {
        lines.sorted { $0.y > $1.y }.map(\.text).joined(separator: "\n")
    }

    private static func supported() -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        return (try? request.supportedRecognitionLanguages()) ?? []
    }
}
