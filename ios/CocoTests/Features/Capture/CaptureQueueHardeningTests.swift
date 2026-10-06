import XCTest

@testable import Coco

/// Lo que la revisión externa pidió de la cola: que la cancelación y el
/// presupuesto lleguen a la petición en vuelo, que un 2xx ilegible no se
/// repita, que el disco no se trague errores y que un archivo ilegible no se
/// pierda.
final class CaptureQueueHardeningTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")
    private var sender = SenderDouble()
    private var notifier = NotifierDouble()

    override func setUpWithError() throws {
        root = try TemporaryDirectory.directory()
        sender = SenderDouble()
        notifier = NotifierDouble()
    }

    override func tearDownWithError() throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func queue(store: QueueStore? = nil) -> CaptureQueue {
        CaptureQueue(
            store: store ?? DiskQueueStore(root: root), sender: sender, session: SessionDouble(),
            notifier: notifier, retryPolicy: Retry(jitter: 0), spacing: .zero, shrinkPhoto: { $0 })
    }

    private let body = CaptureBody(merchant: "D1", amount: "45000", date: "2026-10-05")

    // MARK: Cancelación y presupuesto

    /// Una petición que tarda más que el presupuesto se corta al vencerlo, y la
    /// captura queda en la cola como estaba: ni intento ni error.
    func testTheBudgetCutsARequestInFlightAndLeavesTheCaptureQueued() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .wallet, photo: nil)
        let started = ContinuousClock.now
        let summary = await q.process(budget: .milliseconds(200))
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(summary.sent, 0)
        XCTAssertEqual(summary.pending, 1)
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .toSend)
        XCTAssertEqual(after?.attempts, 0)
        XCTAssertNil(after?.lastError)

        // La siguiente corrida la manda.
        let next = await q.process(budget: .seconds(5))
        XCTAssertEqual(next.sent, 1)
    }

    /// Cancelar a quien llama (iOS recoge la tarea de fondo o el intent) corta
    /// el envío igual que el presupuesto.
    func testCancellingTheCallerCancelsTheRun() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .sms, photo: nil)
        let caller = Task { await q.process(budget: .seconds(30)) }
        try await Task.sleep(for: .milliseconds(100))
        let started = ContinuousClock.now
        caller.cancel()
        let summary = await caller.value
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(summary.sent, 0)
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .toSend)
        XCTAssertEqual(after?.attempts, 0)
    }

    /// Con la foto a medias: la fase 1 ya quedó en disco y la cancelación no
    /// la deshace.
    func testCancellingDuringThePhotoKeepsPhase1() async throws {
        sender.replyToPhoto(.hang)
        let q = queue()
        let c = try await q.enqueue(body, source: .iosPhoto, photo: Data(repeating: 1, count: 64))
        await q.process(budget: .milliseconds(300))
        let after = await q.capture(id: c.id)
        XCTAssertEqual(after?.phase, .photoToUpload(transactionId: sender.transactionId))
        XCTAssertNotNil(after?.photoPath)
    }

    /// Un intent que llega con otra corrida en marcha no hereda su espera: sale
    /// dentro de SU presupuesto con la captura a salvo en la cola.
    func testACallerThatJoinsARunWaitsOnlyItsOwnBudget() async throws {
        sender.replyToCapture(.hang)
        let q = queue()
        try await q.enqueue(body, source: .wallet, photo: nil)
        let foreground = Task { await q.process(budget: .seconds(30)) }
        try await Task.sleep(for: .milliseconds(100))

        let capturer = QueuedCapturer(queue: q, notifier: notifier)
        let started = ContinuousClock.now
        let result = await capturer.capture(body, source: .wallet, photo: nil, budget: .milliseconds(300))
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(5))
        XCTAssertEqual(result, .queued(pending: 2))
        foreground.cancel()
        _ = await foreground.value
    }

    // MARK: 2xx ilegible

    /// El servidor la creó: queda «hecha, revisar», no se reintenta sola, no
    /// cuenta como pendiente ni como fallida.
    func testAnUnreadable2xxIsUnconfirmedAndNeverResent() async throws {
        sender.replyToCapture(.failure(APIError.unreadableSuccess(status: 201)))
        let q = queue()
        let c = try await q.enqueue(body, source: .wallet, photo: nil)
        let summary = await q.process()
        XCTAssertEqual(summary.unconfirmed, 1)
        XCTAssertEqual(summary.failed, 0)
        XCTAssertEqual(summary.pending, 0)
        guard case .unconfirmed = await q.capture(id: c.id)?.phase else {
            return XCTFail("debía quedar sin confirmar")
        }
        XCTAssertTrue(notifier.failures.isEmpty)

        await q.retryNow(id: c.id)
        await q.process()
        XCTAssertEqual(sender.requests.count, 1, "una sin confirmar no se vuelve a mandar")

        await q.purge(doneOlderThan: .zero)
        let kept = await q.capture(id: c.id)
        XCTAssertNotNil(kept, "la purga no se lleva lo que falta revisar")
    }

    func testTheCapturerReportsUnconfirmed() async {
        sender.replyToCapture(.failure(APIError.unreadableSuccess(status: 200)))
        let capturer = QueuedCapturer(queue: queue(), notifier: notifier)
        let result = await capturer.capture(body, source: .wallet, photo: nil, budget: .seconds(5))
        XCTAssertEqual(result, .unconfirmed)
        XCTAssertFalse(ActionParameters.dialogText(result).isEmpty)
    }

    /// Un 2xx ilegible al subir la foto: la foto llegó y la captura termina.
    func testAnUnreadable2xxOnThePhotoFinishesTheCapture() async throws {
        sender.replyToPhoto(.failure(APIError.unreadableSuccess(status: 201)))
        let q = queue()
        let c = try await q.enqueue(body, source: .iosPhoto, photo: Data(repeating: 1, count: 64))
        let summary = await q.process()
        XCTAssertEqual(summary.sent, 1)
        guard case .done = await q.capture(id: c.id)?.phase else { return XCTFail("debía quedar hecha") }
    }

    // MARK: Errores del disco

    /// Si el disco no deja escribir, se ve: la cola lo publica en vez de
    /// tragárselo, y una escritura buena lo despeja.
    func testAFailedWriteIsVisibleInTheSnapshot() async throws {
        let failing = FailingStore(real: DiskQueueStore(root: root))
        sender.replyToCapture(.failure(APIError.server(status: 503)))
        let q = queue(store: failing)
        try await q.enqueue(body, source: .wallet, photo: nil)
        failing.failsSave = true
        await q.process()
        let broken = await q.snapshot()
        XCTAssertTrue(broken.diskError)

        failing.failsSave = false
        try await q.enqueue(body, source: .sms, photo: nil)
        let c = await q.all().first
        if let c { await q.retryNow(id: c.id) }
        let healed = await q.snapshot()
        XCTAssertFalse(healed.diskError)
    }

    /// Una lectura que falla no deja la insignia en 0: vale lo último leído.
    func testAFailedReadKeepsTheLastCount() async throws {
        let flaky = FlakyReadStore(real: DiskQueueStore(root: root))
        let q = queue(store: flaky)
        try await q.enqueue(body, source: .wallet, photo: nil)
        let before = await q.pending()
        XCTAssertEqual(before, 1)
        flaky.failsRead = true
        let during = await q.pending()
        XCTAssertEqual(during, 1)
        let snapshot = await q.snapshot()
        XCTAssertTrue(snapshot.diskError)
    }

    // MARK: Formato y cuarentena

    func testEveryCaptureIsWrittenWithTheFormatVersion() async throws {
        let c = try await queue().enqueue(body, source: .wallet, photo: nil)
        let data = try Data(contentsOf: root.appending(path: "\(c.id.uuidString).json"))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        XCTAssertEqual(json["version"] as? Int, PendingCapture.formatVersion)
    }

    /// Un archivo corrupto y otro de una versión desconocida no tumban la
    /// cola, no se borran y se cuentan para la pantalla de capturas.
    func testUnreadableFilesGoToQuarantineIntactAndAreCounted() async throws {
        let q = queue()
        let good = try await q.enqueue(body, source: .wallet, photo: nil)
        let goodFile = root.appending(path: "\(good.id.uuidString).json")
        let futureText = try String(contentsOf: goodFile, encoding: .utf8)
            .replacingOccurrences(of: #""version":1"#, with: #""version":99"#)
            .replacingOccurrences(of: good.id.uuidString, with: UUID().uuidString)
        let future = root.appending(path: "future.json")
        try Data(futureText.utf8).write(to: future)
        let corrupt = root.appending(path: "corrupt.json")
        try Data("{ no es json".utf8).write(to: corrupt)

        let snapshot = await q.snapshot()
        XCTAssertEqual(snapshot.captures.map(\.id), [good.id])
        XCTAssertEqual(snapshot.unreadable, 2)

        let quarantine = root.appending(path: DiskQueueStore.quarantineFolderName)
        XCTAssertEqual(
            try Data(contentsOf: quarantine.appending(path: "corrupt.json")), Data("{ no es json".utf8))
        XCTAssertEqual(
            try String(contentsOf: quarantine.appending(path: "future.json"), encoding: .utf8), futureText)
        XCTAssertFalse(FileManager.default.fileExists(atPath: corrupt.path(percentEncoded: false)))
    }

    func testTheQueueLivesInApplicationSupportAndNotInTmp() {
        let path = DiskQueueStore.defaultRoot.path(percentEncoded: false)
        XCTAssertTrue(path.contains("/Library/Application Support/"), path)
        XCTAssertFalse(path.hasPrefix(FileManager.default.temporaryDirectory.path(percentEncoded: false)))
        XCTAssertTrue(DiskTreeStore.atDefaultLocation.file.path(percentEncoded: false).contains("Application Support"))
    }

    func testANewFolderIsExcludedFromBackup() async throws {
        let fresh = root.appending(path: "fresh", directoryHint: .isDirectory)
        try await queue(store: DiskQueueStore(root: fresh)).enqueue(body, source: .wallet, photo: nil)
        let values = try fresh.resourceValues(forKeys: [.isExcludedFromBackupKey])
        XCTAssertEqual(values.isExcludedFromBackup, true)
    }
}

/// Un almacén cuya lectura falla cuando se le pide: el disco aún bloqueado.
/// `@unchecked Sendable`: doble de pruebas; `failsRead` lo escribe la prueba
/// entre llamadas, nunca a la vez que la cola lee.
private final class FlakyReadStore: QueueStore, @unchecked Sendable {
    let real: DiskQueueStore
    var failsRead = false
    init(real: DiskQueueStore) { self.real = real }

    struct LockedDiskError: Error {}

    func save(_ capture: PendingCapture) throws { try real.save(capture) }
    func all() throws -> [PendingCapture] {
        if failsRead { throw LockedDiskError() }
        return try real.all()
    }
    func delete(id: UUID) throws { try real.delete(id: id) }
    func savePhoto(_ jpeg: Data, id: UUID) throws -> String { try real.savePhoto(jpeg, id: id) }
    func photo(at path: String) throws -> Data { try real.photo(at: path) }
    func deletePhoto(at path: String) throws { try real.deletePhoto(at: path) }
    func photoBytes() throws -> Int { try real.photoBytes() }
    func quarantined() throws -> Int { try real.quarantined() }
}
