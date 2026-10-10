import Foundation

/// What the person (or Shortcuts) contributes to a capture, without `source`,
/// `externalRef` or `capturedAt`, which the queue sets.
///
/// It is an app type, not a contract one: it is saved on disk with its
/// synthesized keys and is NEVER sent as is. What travels is built by
/// `CaptureRequest` and `InterpretRequest`, which write the `/api/v2` keys
/// by hand; that way a contract change does not force migrating the queue.
struct CaptureBody: Codable, Equatable, Sendable {
    var text: String?
    var merchant: String?
    var amount: String?
    var date: String?
    var period: String?
    var fileName: String?
    var categoryId: Int?
    var note: String?

    init(
        text: String? = nil, merchant: String? = nil, amount: String? = nil, date: String? = nil,
        period: String? = nil, fileName: String? = nil, categoryId: Int? = nil, note: String? = nil
    ) {
        self.text = text
        self.merchant = merchant
        self.amount = amount
        self.date = date
        self.period = period
        self.fileName = fileName
        self.categoryId = categoryId
        self.note = note
    }

    /// The API accepts text, merchant, or a chosen concept with its amount.
    var isSendable: Bool {
        (text?.isEmpty == false) || (merchant?.isEmpty == false) || (categoryId != nil && amount != nil)
    }
}

/// What travels to `POST /transactions/capture` (`CaptureInput` of the v2). The
/// body is FLATTENED when encoding: the API receives a single object.
struct CaptureRequest: Encodable, Equatable, Sendable {
    let source: CaptureSource
    let externalRef: String
    let capturedAt: String
    let body: CaptureBody

    private enum WireKey: String, CodingKey {
        case source, externalRef, capturedAt
        case text, merchant, amount, date, period, fileName, categoryId, note
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: WireKey.self)
        try c.encode(source, forKey: .source)
        try c.encode(externalRef, forKey: .externalRef)
        try c.encode(capturedAt, forKey: .capturedAt)
        try c.encodeIfPresent(body.text, forKey: .text)
        try c.encodeIfPresent(body.merchant, forKey: .merchant)
        try c.encodeIfPresent(body.amount, forKey: .amount)
        try c.encodeIfPresent(body.date, forKey: .date)
        try c.encodeIfPresent(body.period, forKey: .period)
        try c.encodeIfPresent(body.fileName, forKey: .fileName)
        // The v2 asks for it as a string of digits (`categoryId: string`).
        try c.encodeIfPresent(body.categoryId.map(String.init), forKey: .categoryId)
        try c.encodeIfPresent(body.note, forKey: .note)
    }
}

/// What travels to `POST /transactions/interpret` (`InterpretInput` of the v2).
/// Only what the API knows how to read: the chosen concept and the note belong to the
/// capture, not to the interpretation.
struct InterpretRequest: Encodable, Equatable, Sendable {
    let body: CaptureBody

    private enum WireKey: String, CodingKey {
        case text, merchant, amount, date, period, fileName
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: WireKey.self)
        try c.encodeIfPresent(body.text, forKey: .text)
        try c.encodeIfPresent(body.merchant, forKey: .merchant)
        try c.encodeIfPresent(body.amount, forKey: .amount)
        try c.encodeIfPresent(body.date, forKey: .date)
        try c.encodeIfPresent(body.period, forKey: .period)
        try c.encodeIfPresent(body.fileName, forKey: .fileName)
    }
}
