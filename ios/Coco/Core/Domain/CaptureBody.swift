import Foundation

/// Lo que la persona (o Atajos) aporta a una captura, sin `source`,
/// `externalRef` ni `capturedAt`, que los pone la cola.
///
/// Es un tipo de la app, no del contrato: se guarda en disco con sus claves
/// sintetizadas y NUNCA se manda tal cual. Lo que viaja lo arman
/// `CaptureRequest` e `InterpretRequest`, que escriben a mano las claves de la
/// `/api/v2`; así un cambio de contrato no obliga a migrar la cola.
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

    /// La API acepta texto, comercio, o un concepto elegido con su monto.
    var isSendable: Bool {
        (text?.isEmpty == false) || (merchant?.isEmpty == false) || (categoryId != nil && amount != nil)
    }
}

/// Lo que viaja a `POST /transactions/capture` (`CaptureInput` de la v2). El
/// cuerpo se APLANA al codificar: la API recibe un solo objeto.
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
        // La v2 lo pide como cadena de dígitos (`categoryId: string`).
        try c.encodeIfPresent(body.categoryId.map(String.init), forKey: .categoryId)
        try c.encodeIfPresent(body.note, forKey: .note)
    }
}

/// Lo que viaja a `POST /transactions/interpret` (`InterpretInput` de la v2).
/// Solo lo que la API sabe leer: el concepto elegido y la nota son de la
/// captura, no de la interpretación.
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
