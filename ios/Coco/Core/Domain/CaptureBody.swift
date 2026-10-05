import Foundation

/// Lo que la persona (o Atajos) aporta a una captura: `CapturaRequest` de @coco/types menos
/// `source`, `external_ref` y `captured_at`, que los pone la cola.
struct CaptureBody: Codable, Equatable, Sendable {
    var text: String?
    var merchant: String?
    var amount: String?
    var date: String?
    var period: String?
    var fileName: String?
    var categoryId: Int?
    var note: String?

    /// Se escribe en disco dentro de cada captura de la cola: las claves no
    /// pueden cambiar sin una migración.
    enum CodingKeys: String, CodingKey {
        case text = "texto"
        case merchant = "comercio"
        case amount = "monto"
        case date = "fecha"
        case period = "periodo"
        case note = "nota"
        case fileName = "nombre_de_archivo"
        case categoryId = "category_id"
    }

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

/// Lo que viaja a `POST /transactions/capture`. El cuerpo se APLANA al
/// codificar: la API recibe un solo objeto, no un `cuerpo` anidado.
struct CaptureRequest: Encodable, Equatable, Sendable {
    let source: CaptureSource
    let externalRef: String
    let capturedAt: String
    let body: CaptureBody

    private enum FlatKey: String, CodingKey {
        case source
        case externalRef = "external_ref"
        case capturedAt = "captured_at"
        case text = "texto"
        case merchant = "comercio"
        case amount = "monto"
        case date = "fecha"
        case period = "periodo"
        case note = "nota"
        case fileName = "nombre_de_archivo"
        case categoryId = "category_id"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: FlatKey.self)
        try c.encode(source, forKey: .source)
        try c.encode(externalRef, forKey: .externalRef)
        try c.encode(capturedAt, forKey: .capturedAt)
        try c.encodeIfPresent(body.text, forKey: .text)
        try c.encodeIfPresent(body.merchant, forKey: .merchant)
        try c.encodeIfPresent(body.amount, forKey: .amount)
        try c.encodeIfPresent(body.date, forKey: .date)
        try c.encodeIfPresent(body.period, forKey: .period)
        try c.encodeIfPresent(body.fileName, forKey: .fileName)
        // El DTO lo pide como cadena numérica (`category_id?: string`).
        try c.encodeIfPresent(body.categoryId.map(String.init), forKey: .categoryId)
        try c.encodeIfPresent(body.note, forKey: .note)
    }
}
