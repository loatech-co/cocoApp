import Foundation

/// Lo que la persona (o Atajos) aporta a una captura: `CapturaRequest` menos
/// `source`, `external_ref` y `captured_at`, que los pone la cola.
struct CuerpoDeCaptura: Codable, Equatable, Sendable {
    var texto: String?
    var comercio: String?
    var monto: String?
    var fecha: String?
    var periodo: String?
    var nombre_de_archivo: String?
    var category_id: Int?
    var nota: String?

    init(
        texto: String? = nil, comercio: String? = nil, monto: String? = nil, fecha: String? = nil,
        periodo: String? = nil, nombre_de_archivo: String? = nil, category_id: Int? = nil, nota: String? = nil
    ) {
        self.texto = texto
        self.comercio = comercio
        self.monto = monto
        self.fecha = fecha
        self.periodo = periodo
        self.nombre_de_archivo = nombre_de_archivo
        self.category_id = category_id
        self.nota = nota
    }

    /// La API acepta texto, comercio, o un concepto elegido con su monto.
    var esEnviable: Bool {
        (texto?.isEmpty == false) || (comercio?.isEmpty == false) || (category_id != nil && monto != nil)
    }
}

/// Lo que viaja a `POST /transactions/capture`. El cuerpo se APLANA al
/// codificar: la API recibe un solo objeto, no un `cuerpo` anidado.
struct CapturaRequest: Encodable, Equatable, Sendable {
    let source: OrigenDeCaptura
    let external_ref: String
    let captured_at: String
    let cuerpo: CuerpoDeCaptura

    private enum Clave: String, CodingKey {
        case source, external_ref, captured_at
        case texto, comercio, monto, fecha, periodo, nombre_de_archivo, category_id, nota
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: Clave.self)
        try c.encode(source, forKey: .source)
        try c.encode(external_ref, forKey: .external_ref)
        try c.encode(captured_at, forKey: .captured_at)
        try c.encodeIfPresent(cuerpo.texto, forKey: .texto)
        try c.encodeIfPresent(cuerpo.comercio, forKey: .comercio)
        try c.encodeIfPresent(cuerpo.monto, forKey: .monto)
        try c.encodeIfPresent(cuerpo.fecha, forKey: .fecha)
        try c.encodeIfPresent(cuerpo.periodo, forKey: .periodo)
        try c.encodeIfPresent(cuerpo.nombre_de_archivo, forKey: .nombre_de_archivo)
        // El DTO lo pide como cadena numérica (`category_id?: string`).
        try c.encodeIfPresent(cuerpo.category_id.map(String.init), forKey: .category_id)
        try c.encodeIfPresent(cuerpo.nota, forKey: .nota)
    }
}
