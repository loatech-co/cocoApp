import Foundation
import Observation
import UIKit

/// El estado del formulario rápido: una sola pantalla con monto, concepto,
/// nota y foto. Es `@MainActor` porque lo lee la interfaz; lo que hace
/// trabajo —OCR, red, cola— se espera con `await` y vuelve aquí.
@Observable @MainActor
final class FormModel {
    /// Se puede reemplazar cuando el árbol termina de descargarse.
    var index: TreeIndex?
    private let api: APIClient
    private let session: Session
    private let capturer: Capturer
    private let connectivity: Connectivity
    private let reader: any ReceiptTextReader
    private let recents: RecentsStore
    private let clock: @Sendable () -> Date

    var amount: String = ""
    var concept: IndexEntry?
    var note: String = ""
    var date: Date
    /// La persona tocó la fecha: la interpretación ya no la cambia.
    private(set) var isDateEdited = false
    var merchant: String?

    var photo: UIImage?
    var photoJPEG: Data?
    var readText: String?
    var proposal: Interpretation?
    /// El concepto lo puso la interpretación, no la persona.
    private(set) var isConceptSuggested = false
    /// Con certeza media: lo que la API propone, arriba del buscador.
    private(set) var candidates: [IndexEntry] = []
    /// Pide a la vista abrir el buscador (la vista lo vuelve a false).
    var showsSearch = false

    var query: String = ""
    var results: [IndexEntry] = []

    var isReading = false
    var error: String?
    var noNetwork = false

    init(
        index: TreeIndex?,
        api: APIClient,
        session: Session,
        capturer: Capturer,
        connectivity: Connectivity,
        reader: any ReceiptTextReader = ReceiptReader(),
        recents: RecentsStore = .init(),
        clock: @Sendable @escaping () -> Date = { Date() }
    ) {
        self.index = index
        self.api = api
        self.session = session
        self.capturer = capturer
        self.connectivity = connectivity
        self.reader = reader
        self.recents = recents
        self.clock = clock
        self.date = clock()
        self.results = recentConcepts()
    }

    // MARK: Lectura

    var normalizedAmount: String? { AmountParser.normalize(amount) }

    /// Monto válido y algo que clasifique: un concepto elegido o el texto del
    /// recibo, que la API sabe interpretar.
    var canConfirm: Bool {
        normalizedAmount != nil && (concept != nil || !(readText ?? "").isEmpty)
    }

    var visibleRecentConcepts: [IndexEntry] { recentConcepts() }

    // MARK: Concepto

    func search(_ query: String) {
        self.query = query
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        results = trimmed.isEmpty ? recentConcepts() : (index?.search(trimmed) ?? [])
    }

    func choose(_ entry: IndexEntry) {
        concept = entry
        isConceptSuggested = false
        candidates = []
        query = ""
        results = recentConcepts()
    }

    func clearConcept() {
        concept = nil
        isConceptSuggested = false
    }

    func changeDate(_ newDate: Date) {
        date = newDate
        isDateEdited = true
    }

    // MARK: Foto

    /// Encoger → Vision → `/interpret` → rellenar lo vacío. El OCR corre
    /// siempre (es local y el texto viaja con la captura); la interpretación
    /// solo con red, y sin red se avisa y la persona escribe.
    func readPhoto(_ image: UIImage) async {
        photo = image
        photoJPEG = PhotoShrinker.jpeg(image)
        error = nil
        noNetwork = false
        isReading = true
        defer { isReading = false }

        guard let cg = image.cgImage ?? photoJPEG.flatMap({ UIImage(data: $0)?.cgImage }) else {
            error = L10n.Capture.receiptPhotoUnreadable
            return
        }
        let text: String
        do {
            text = try await reader.text(from: cg)
        } catch {
            self.error = L10n.Capture.receiptTextUnreadable
            return
        }
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        readText = cleaned.isEmpty ? nil : cleaned

        guard connectivity.isOnline else {
            noNetwork = true
            return
        }
        guard let readText else { return }
        do {
            let token = try await session.validAccessToken()
            let body = CaptureBody(text: readText, period: BogotaDate.month(clock()))
            let interpretation: Interpretation = try await api.send(
                RequestBuilder.interpret(body), token: token)
            apply(interpretation)
        } catch SessionError.signedOut {
            error = L10n.Capture.receiptSignInToInterpret
        } catch {
            if case SessionError.offline = error {
                noNetwork = true
            } else if APIError.from(error).isNetworkError {
                noNetwork = true
            } else {
                self.error = L10n.Capture.receiptNotInterpreted
            }
        }
    }

    func removePhoto() {
        photo = nil
        photoJPEG = nil
        readText = nil
        proposal = nil
        noNetwork = false
        if isConceptSuggested { clearConcept() }
    }

    /// Rellena lo vacío con lo interpretado; puro en `FormPrefill`.
    func apply(_ interpretation: Interpretation) {
        proposal = interpretation
        let before = FormFields(
            amount: amount,
            date: isDateEdited ? BogotaDate.day(date) : nil,
            merchant: merchant,
            conceptId: concept?.id
        )
        let r = FormPrefill.apply(interpretation, to: before)
        amount = r.fields.amount
        merchant = r.fields.merchant
        if !isDateEdited, let day = r.fields.date, let instant = Self.instant(fromDay: day) {
            date = instant
        }
        if r.isConceptSuggested, let id = r.fields.conceptId, let entry = index?.entry(id: id) {
            concept = entry
            isConceptSuggested = true
        }
        candidates = r.candidates.compactMap { index?.entry(id: $0.id) }
        if concept == nil, !candidates.isEmpty { showsSearch = true }
    }

    // MARK: Confirmar

    /// Puro: lo que viaja a la API, con el monto normalizado y la fecha en
    /// Bogotá, que es donde se gasta la plata.
    func captureBody() -> CaptureBody {
        CaptureBody(
            text: readText,
            merchant: Self.reset(merchant),
            amount: normalizedAmount,
            date: BogotaDate.day(date),
            period: BogotaDate.month(date),
            fileName: photoJPEG == nil ? nil : "recibo-\(BogotaDate.day(date)).jpg",
            categoryId: concept?.id,
            note: Self.reset(note)
        )
    }

    /// Toma la foto del estado, limpia el formulario y encola. La captura ya
    /// está a salvo en disco en cuanto `capturar` arranca; lo que devuelve es
    /// solo qué pasó dentro del presupuesto, y la vista no tiene que esperarlo.
    func confirm() async -> CaptureResult {
        let body = captureBody()
        let photo = photoJPEG
        let source: CaptureSource = photo == nil ? .iosManual : .iosPhoto
        if let id = concept?.id { recents.record(id) }
        reset()
        let result = await capturer.capture(body, source: source, photo: photo, budget: .seconds(25))
        if case .failed(let reason) = result { error = reason }
        return result
    }

    func reset() {
        amount = ""
        concept = nil
        note = ""
        date = clock()
        isDateEdited = false
        merchant = nil
        photo = nil
        photoJPEG = nil
        readText = nil
        proposal = nil
        isConceptSuggested = false
        candidates = []
        showsSearch = false
        query = ""
        results = recentConcepts()
        error = nil
        noNetwork = false
        isReading = false
    }

    // MARK: Ayudas

    private func recentConcepts() -> [IndexEntry] {
        guard let index else { return [] }
        return recents.read().compactMap { index.entry(id: $0) }
    }

    private static func reset(_ s: String?) -> String? {
        let cleaned = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// «2026-10-04» → el mediodía de ese día en Bogotá, para que ninguna zona
    /// horaria lo mueva de día al volver a formatearlo.
    static func instant(fromDay day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = BogotaDate.timeZone
        return cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}
