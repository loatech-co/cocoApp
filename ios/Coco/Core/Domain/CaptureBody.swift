import Foundation

/// Lo que la persona (o Atajos) aporta a una captura: `CapturaRequest` de @coco/types menos
/// `source`, `external_ref` y `captured_at`, que los pone la cola.
struct CaptureBody: Codable, Equatable, Sendable {
    var texto: String?
    var comercio: String?
    var monto: String?
    var fecha: String?
    var periodo: String?
    var fileName: String?
    var categoryId: Int?
    var nota: String?

    /// Se escribe en disco dentro de cada captura de la cola: las claves no
    /// pueden cambiar sin una migración.
    enum CodingKeys: String, CodingKey {
        case texto, comercio, monto, fecha, periodo, nota
        case fileName = "nombre_de_archivo"
        case categoryId = "category_id"
    }

    init(
        texto: String? = nil, comercio: String? = nil, monto: String? = nil, fecha: String? = nil,
        periodo: String? = nil, fileName: String? = nil, categoryId: Int? = nil, nota: String? = nil
    ) {
        self.texto = texto
        self.comercio = comercio
        self.monto = monto
        self.fecha = fecha
        self.periodo = periodo
        self.fileName = fileName
        self.categoryId = categoryId
        self.nota = nota
    }

    /// La API acepta texto, comercio, o un concepto elegido con su monto.
    var esEnviable: Bool {
        (texto?.isEmpty == false) || (comercio?.isEmpty == false) || (categoryId != nil && monto != nil)
    }
}

/// Lo que viaja a `POST /transactions/capture`. El cuerpo se APLANA al
/// codificar: la API recibe un solo objeto, no un `cuerpo` anidado.
struct CaptureRequest: Encodable, Equatable, Sendable {
    let source: CaptureSource
    let externalRef: String
    let capturedAt: String
    let cuerpo: CaptureBody

    private enum FlatKey: String, CodingKey {
        case source
        case externalRef = "external_ref"
        case capturedAt = "captured_at"
        case texto, comercio, monto, fecha, periodo, nota
        case fileName = "nombre_de_archivo"
        case categoryId = "category_id"
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: FlatKey.self)
        try c.encode(source, forKey: .source)
        try c.encode(externalRef, forKey: .externalRef)
        try c.encode(capturedAt, forKey: .capturedAt)
        try c.encodeIfPresent(cuerpo.texto, forKey: .texto)
        try c.encodeIfPresent(cuerpo.comercio, forKey: .comercio)
        try c.encodeIfPresent(cuerpo.monto, forKey: .monto)
        try c.encodeIfPresent(cuerpo.fecha, forKey: .fecha)
        try c.encodeIfPresent(cuerpo.periodo, forKey: .periodo)
        try c.encodeIfPresent(cuerpo.fileName, forKey: .fileName)
        // El DTO lo pide como cadena numérica (`category_id?: string`).
        try c.encodeIfPresent(cuerpo.categoryId.map(String.init), forKey: .categoryId)
        try c.encodeIfPresent(cuerpo.nota, forKey: .nota)
    }
}
