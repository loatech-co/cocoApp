import Foundation
import Observation
import UIKit

/// El estado del formulario rápido: una sola pantalla con monto, concepto,
/// nota y foto. Es `@MainActor` porque lo lee la interfaz; lo que hace
/// trabajo —OCR, red, cola— se espera con `await` y vuelve aquí.
@Observable @MainActor
final class FormModel {
    /// Se puede reemplazar cuando el árbol termina de descargarse.
    var indice: TreeIndex?
    private let api: APIClient
    private let session: Session
    private let capturador: Capturer
    private let conectividad: Connectivity
    private let lector: any ReceiptTextReader
    private let recientes: RecentsStore
    private let reloj: @Sendable () -> Date

    var amount: String = ""
    var concepto: IndexEntry?
    var note: String = ""
    var date: Date
    /// La persona tocó la fecha: la interpretación ya no la cambia.
    private(set) var fechaEditada = false
    var merchant: String?

    var photo: UIImage?
    var fotoJPEG: Data?
    var textoLeido: String?
    var propuesta: Interpretation?
    /// El concepto lo puso la interpretación, no la persona.
    private(set) var conceptoSugerido = false
    /// Con certeza media: lo que la API propone, arriba del buscador.
    private(set) var candidates: [IndexEntry] = []
    /// Pide a la vista abrir el buscador (la vista lo vuelve a false).
    var abrirBuscador = false

    var query: String = ""
    var resultados: [IndexEntry] = []

    var leyendo = false
    var error: String?
    var noNetwork = false

    init(
        indice: TreeIndex?,
        api: APIClient,
        session: Session,
        capturador: Capturer,
        conectividad: Connectivity,
        lector: any ReceiptTextReader = ReceiptReader(),
        recientes: RecentsStore = .init(),
        reloj: @Sendable @escaping () -> Date = { Date() }
    ) {
        self.indice = indice
        self.api = api
        self.session = session
        self.capturador = capturador
        self.conectividad = conectividad
        self.lector = lector
        self.recientes = recientes
        self.reloj = reloj
        self.date = reloj()
        self.resultados = conceptosRecientes()
    }

    // MARK: Lectura

    var montoNormalizado: String? { AmountParser.normalize(amount) }

    /// Monto válido y algo que clasifique: un concepto elegido o el texto del
    /// recibo, que la API sabe interpretar.
    var puedeConfirmar: Bool {
        montoNormalizado != nil && (concepto != nil || !(textoLeido ?? "").isEmpty)
    }

    var conceptosRecientesVisibles: [IndexEntry] { conceptosRecientes() }

    // MARK: Concepto

    func search(_ query: String) {
        self.query = query
        let limpia = query.trimmingCharacters(in: .whitespacesAndNewlines)
        resultados = limpia.isEmpty ? conceptosRecientes() : (indice?.search(limpia) ?? [])
    }

    func elegir(_ entrada: IndexEntry) {
        concepto = entrada
        conceptoSugerido = false
        candidates = []
        query = ""
        resultados = conceptosRecientes()
    }

    func quitarConcepto() {
        concepto = nil
        conceptoSugerido = false
    }

    func cambiarFecha(_ nueva: Date) {
        date = nueva
        fechaEditada = true
    }

    // MARK: Foto

    /// Encoger → Vision → `/interpret` → rellenar lo vacío. El OCR corre
    /// siempre (es local y el texto viaja con la captura); la interpretación
    /// solo con red, y sin red se avisa y la persona escribe.
    func leerFoto(_ imagen: UIImage) async {
        photo = imagen
        fotoJPEG = PhotoShrinker.jpeg(imagen)
        error = nil
        noNetwork = false
        leyendo = true
        defer { leyendo = false }

        guard let cg = imagen.cgImage ?? fotoJPEG.flatMap({ UIImage(data: $0)?.cgImage }) else {
            error = "No se pudo leer la foto. Escribe los datos; la foto se adjuntará igual."
            return
        }
        let text: String
        do {
            text = try await lector.text(de: cg)
        } catch {
            self.error = "No se pudo leer el texto del recibo. Escribe los datos; la foto se adjuntará igual."
            return
        }
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        textoLeido = cleaned.isEmpty ? nil : cleaned

        guard conectividad.isOnline else {
            noNetwork = true
            return
        }
        guard let textoLeido else { return }
        do {
            let token = try await session.validAccessToken()
            let body = CaptureBody(text: textoLeido, period: BogotaDate.month(reloj()))
            let interpretacion: Interpretation = try await api.send(
                RequestBuilder.interpret(body), token: token)
            aplicar(interpretacion)
        } catch SessionError.signedOut {
            error = "Inicia sesión para que Coco interprete el recibo."
        } catch {
            if case SessionError.offline = error {
                noNetwork = true
            } else if APIError.from(error).isNetworkError {
                noNetwork = true
            } else {
                self.error = "No se pudo interpretar el recibo. Revisa los datos antes de guardar."
            }
        }
    }

    func quitarFoto() {
        photo = nil
        fotoJPEG = nil
        textoLeido = nil
        propuesta = nil
        noNetwork = false
        if conceptoSugerido { quitarConcepto() }
    }

    /// Rellena lo vacío con lo interpretado; puro en `FormPrefill`.
    func aplicar(_ interpretacion: Interpretation) {
        propuesta = interpretacion
        let antes = FormFields(
            amount: amount,
            date: fechaEditada ? BogotaDate.day(date) : nil,
            merchant: merchant,
            conceptoId: concepto?.id
        )
        let r = FormPrefill.aplicar(interpretacion, to: antes)
        amount = r.campos.amount
        merchant = r.campos.merchant
        if !fechaEditada, let day = r.campos.date, let instant = Self.instant(deDia: day) {
            date = instant
        }
        if r.conceptoSugerido, let id = r.campos.conceptoId, let entrada = indice?.entrada(id: id) {
            concepto = entrada
            conceptoSugerido = true
        }
        candidates = r.candidates.compactMap { indice?.entrada(id: $0.id) }
        if concepto == nil, !candidates.isEmpty { abrirBuscador = true }
    }

    // MARK: Confirmar

    /// Puro: lo que viaja a la API, con el monto normalizado y la fecha en
    /// Bogotá, que es donde se gasta la plata.
    func body() -> CaptureBody {
        CaptureBody(
            text: textoLeido,
            merchant: Self.limpiar(merchant),
            amount: montoNormalizado,
            date: BogotaDate.day(date),
            period: BogotaDate.month(date),
            fileName: fotoJPEG == nil ? nil : "recibo-\(BogotaDate.day(date)).jpg",
            categoryId: concepto?.id,
            note: Self.limpiar(note)
        )
    }

    /// Toma la foto del estado, limpia el formulario y encola. La captura ya
    /// está a salvo en disco en cuanto `capturar` arranca; lo que devuelve es
    /// solo qué pasó dentro del presupuesto, y la vista no tiene que esperarlo.
    func confirmar() async -> CaptureResult {
        let body = body()
        let photo = fotoJPEG
        let source: CaptureSource = photo == nil ? .iosManual : .iosPhoto
        if let id = concepto?.id { recientes.anotar(id) }
        limpiar()
        let result = await capturador.capture(body, source: source, photo: photo, budget: .seconds(25))
        if case .failed(let reason) = result { error = reason }
        return result
    }

    func limpiar() {
        amount = ""
        concepto = nil
        note = ""
        date = reloj()
        fechaEditada = false
        merchant = nil
        photo = nil
        fotoJPEG = nil
        textoLeido = nil
        propuesta = nil
        conceptoSugerido = false
        candidates = []
        abrirBuscador = false
        query = ""
        resultados = conceptosRecientes()
        error = nil
        noNetwork = false
        leyendo = false
    }

    // MARK: Ayudas

    private func conceptosRecientes() -> [IndexEntry] {
        guard let indice else { return [] }
        return recientes.read().compactMap { indice.entrada(id: $0) }
    }

    private static func limpiar(_ s: String?) -> String? {
        let cleaned = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// «2026-10-04» → el mediodía de ese día en Bogotá, para que ninguna zona
    /// horaria lo mueva de día al volver a formatearlo.
    static func instant(deDia day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = BogotaDate.timeZone
        return cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}
