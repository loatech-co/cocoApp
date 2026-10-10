import Foundation

/// A capture on disk, waiting for its turn. It is the datum the
/// `QueueStore` and `CaptureSender` protocols talk about (M4 adds the queue).
struct PendingCapture: Codable, Identifiable, Equatable, Sendable {
    /// The version of the on-disk format this app understands. A file with
    /// another one —or without it— is not guessed: it goes to quarantine (`DiskQueueStore`).
    static let formatVersion = 1

    /// The version this file was written with.
    var version: Int = Self.formatVersion
    /// It is also the `externalRef`: the idempotency key.
    let id: UUID
    /// It is also the `capturedAt`.
    let createdAt: Date
    let source: CaptureSource
    var body: CaptureBody
    /// "Photos/<id>.jpg", relative to the store's root.
    var photoPath: String?
    var phase: Phase
    var attempts: Int
    var nextAttempt: Date
    var lastError: String?
    /// What phase 1 answered while the photo is still to be uploaded: that way the
    /// capture ends with the API's summary and not with a made-up one.
    var textResult: SavedResult?

    enum Phase: Codable, Equatable, Sendable {
        case toSend
        case photoToUpload(transactionId: Int)
        case awaitingSession
        case done(SavedResult)
        /// The API answered 2xx but the response could not be read: the capture
        /// ARRIVED, and what is missing is checking it. It is not retried by itself, because
        /// repeating it could record the expense twice.
        case unconfirmed(at: Date)
        case failed(reason: String)
    }

    // The capture lives on disk with the synthesized keys (the property
    // names), `body` included: the format is the app's and not the
    // contract's, and it is translated to the API's when sending (`request`).
    // `StoredFormatTests` watches it.

    init(
        id: UUID = UUID(), createdAt: Date = .now, source: CaptureSource, body: CaptureBody,
        photoPath: String? = nil, phase: Phase = .toSend, attempts: Int = 0, nextAttempt: Date = .distantPast,
        lastError: String? = nil, textResult: SavedResult? = nil
    ) {
        self.id = id
        self.createdAt = createdAt
        self.source = source
        self.body = body
        self.photoPath = photoPath
        self.phase = phase
        self.attempts = attempts
        self.nextAttempt = nextAttempt
        self.lastError = lastError
        self.textResult = textResult
    }

    /// What counts as «pending»: everything the queue is still going to move
    /// by itself. What failed waits for a person and is not counted.
    var isPending: Bool {
        switch phase {
        case .toSend, .photoToUpload, .awaitingSession: true
        case .done, .unconfirmed, .failed: false
        }
    }

    /// What is sent to the API; the `capturedAt` carries a zone (ISO 8601).
    var request: CaptureRequest {
        CaptureRequest(
            source: source,
            externalRef: id.uuidString,
            capturedAt: createdAt.formatted(.iso8601),
            body: body
        )
    }
}
