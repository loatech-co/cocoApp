import CoreGraphics
import Foundation
import Vision

/// What the form needs from a receipt reader: text from
/// an image. It is a protocol so that tests can double it without Vision or the
/// camera; `ReceiptReader` is the real one.
protocol ReceiptTextReader: Sendable {
    /// The recognized lines, top to bottom, separated by line breaks.
    func text(from image: CGImage) async throws -> String
}

/// On-phone OCR with Vision. The text leaves from here and travels to
/// `/transactions/interpret`; the photo does not leave the device until the
/// queue uploads it as a receipt.
struct ReceiptReader: ReceiptTextReader, Sendable {
    /// In order of preference. The receipts are Colombian; if the system
    /// does not ship es-CO it falls back to es-ES, and en-US stays as a safety net.
    var preferredLanguages: [String] = ["es-CO", "es-ES", "en-US"]

    func text(from image: CGImage) async throws -> String {
        let languages = Self.availableLanguages(preferredLanguages, supported: Self.supported())
        // `perform` is synchronous and heavy: off the main thread. The
        // results are read afterwards, without a completion handler, so that an error from
        // `perform` cannot cross with a continuation already resumed.
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

    /// The preferred ones the system supports, in the order asked. With none,
    /// en-US: Vision always ships it and a receipt with figures reads the same.
    static func availableLanguages(_ preferred: [String], supported: [String]) -> [String] {
        let available = preferred.filter { supported.contains($0) }
        return available.isEmpty ? ["en-US"] : available
    }

    /// Vision returns the boxes with the origin at the bottom left: the highest
    /// line has the largest `y`.
    static func orderedText(_ lines: [(text: String, y: CGFloat)]) -> String {
        lines.sorted { $0.y > $1.y }.map(\.text).joined(separator: "\n")
    }

    private static func supported() -> [String] {
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = .accurate
        return (try? request.supportedRecognitionLanguages()) ?? []
    }
}
