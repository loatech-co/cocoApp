import Foundation
import Observation
import UIKit

/// The state of the quick form: a single screen with amount, concept,
/// note and photo. It is `@MainActor` because the interface reads it; whatever does
/// work —OCR, network, queue— is awaited with `await` and comes back here.
@Observable @MainActor
final class FormModel {
    /// It can be replaced when the tree finishes downloading.
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
    /// The person touched the date: the interpretation no longer changes it.
    private(set) var isDateEdited = false
    var merchant: String?

    var photo: UIImage?
    var photoJPEG: Data?
    var readText: String?
    var proposal: Interpretation?
    /// The concept was set by the interpretation, not by the person.
    private(set) var isConceptSuggested = false
    /// With medium confidence: what the API proposes, above the search.
    private(set) var candidates: [IndexEntry] = []
    /// Asks the view to open the search (the view sets it back to false).
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

    // MARK: Reading

    var normalizedAmount: String? { AmountParser.normalize(amount) }

    /// A valid amount and something that classifies: a chosen concept or the
    /// receipt text, which the API knows how to interpret.
    var canConfirm: Bool {
        normalizedAmount != nil && (concept != nil || !(readText ?? "").isEmpty)
    }

    // MARK: Concept

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

    // MARK: Photo

    /// Shrink → Vision → `/interpret` → fill in what is empty. OCR always
    /// runs (it is local and the text travels with the capture); the interpretation
    /// only with network, and without network the person is told and types it.
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

    /// Fills in what is empty with what was interpreted; pure in `FormPrefill`.
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

    // MARK: Confirming

    /// Pure: what travels to the API, with the amount normalized and the date in
    /// Bogotá, which is where the money is spent.
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

    /// Takes the photo from the state, clears the form and enqueues. The capture is already
    /// safe on disk as soon as `capture` starts; what it returns is
    /// only what happened within the budget, and the view does not have to wait for it.
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

    // MARK: Helpers

    private func recentConcepts() -> [IndexEntry] {
        guard let index else { return [] }
        return recents.read().compactMap { index.entry(id: $0) }
    }

    private static func reset(_ s: String?) -> String? {
        let cleaned = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return cleaned.isEmpty ? nil : cleaned
    }

    /// «2026-10-04» → noon of that day in Bogotá, so that no time
    /// zone moves it to another day when it is formatted again.
    static func instant(fromDay day: String) -> Date? {
        let parts = day.split(separator: "-").compactMap { Int($0) }
        guard parts.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = BogotaDate.timeZone
        return cal.date(from: DateComponents(year: parts[0], month: parts[1], day: parts[2], hour: 12))
    }
}
