import XCTest
import os

@testable import Coco

/// The composition is built without the app's network or disk and leaves registered
/// what the intents and the background tasks need.
@MainActor
final class DependenciesTests: XCTestCase {
    private var root: URL = URL(fileURLWithPath: "/")

    // `async`: that way they run on the main actor, like the class.
    override func setUp() async throws {
        root = try TemporaryDirectory.directory()
    }

    override func tearDown() async throws {
        try? FileManager.default.removeItem(at: root)
    }

    private func build(
        transport: FakeTransport = FakeTransport(), keychain: InMemoryKeychain = InMemoryKeychain(),
        notifier: NotifierDouble = NotifierDouble()
    ) throws -> (Dependencies, Registry) {
        let registry = Registry()
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let defaults = try XCTUnwrap(UserDefaults(suiteName: "pruebas-\(UUID().uuidString)"))
        let d = Dependencies(
            configuration: APIConfiguration(base: base),
            transport: transport,
            keychain: keychain,
            queueStore: DiskQueueStore(root: root),
            treeStore: DiskTreeStore(file: root.appending(path: "tree.json")),
            notifier: notifier,
            defaults: defaults,
            registerIntents: { capturer, navigation in registry.intents = (capturer, navigation) },
            registerTasks: { session, queue, tree, notifier in
                registry.tasks = .init(session: session, queue: queue, tree: tree, notifier: notifier)
            }
        )
        return (d, registry)
    }

    final class Registry {
        var intents: (any Capturer, any Navigation)?
        var tasks: RegisteredTasks?
    }

    func testRegistersIntentsAndTasksWithTheSamePiecesTheAppUses() throws {
        let (d, registry) = try build()
        XCTAssertTrue(d.registeredIntents)
        XCTAssertTrue(d.registeredTasks)

        let intents = try XCTUnwrap(registry.intents)
        XCTAssertTrue((intents.0 as AnyObject) is QueuedCapturer || intents.0 is QueuedCapturer)
        XCTAssertTrue(intents.1 === d.router, "the intents navigate through the same router as the interface")

        let tasks = try XCTUnwrap(registry.tasks)
        XCTAssertTrue(tasks.session === d.session)
        XCTAssertTrue(tasks.queue === d.queue)
        XCTAssertTrue(tasks.tree === d.tree)
    }

    func testTheBridgeAndTheWebPointToTheSameAPI() throws {
        let (d, _) = try build()
        XCTAssertEqual(d.configuration.base.absoluteString, "https://api.coco.invalid")
        XCTAssertEqual(d.api.configuration, d.configuration)
        XCTAssertTrue(
            WebBridge.isOriginAllowed(
                originProtocol: "https", host: "api.coco.invalid", port: 0, base: d.configuration.base,
                isMainFrame: true))
    }

    func testStartWithoutRefreshStaysSignedOutAndDoesNotHitTheNetwork() async throws {
        let transport = FakeTransport()
        let (d, _) = try build(transport: transport)
        XCTAssertEqual(d.sessionState, .loading)
        await d.start()
        XCTAssertTrue(d.started)
        // The state arrives through the actor's change stream.
        for _ in 0..<50 where d.sessionState == .loading {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.sessionState, .signedOut)
        XCTAssertFalse(d.hasSession)
        XCTAssertNil(d.profile)
        XCTAssertEqual(
            transport.received.filter { $0.url?.path.hasPrefix("/api/v2") == true }, [],
            "without a refresh token there is nothing to renew")
        await d.start()
        XCTAssertTrue(d.started, "starting twice does nothing the second time")
    }

    func testThePendingBadgeFollowsTheQueue() async throws {
        let notifier = NotifierDouble()
        let (d, _) = try build(notifier: notifier)
        XCTAssertEqual(d.pending, 0)
        try await d.queue.enqueue(
            CaptureBody(merchant: "D1", amount: "1000", date: "2026-10-05"), source: .iosManual, photo: nil)
        for _ in 0..<50 where d.pending == 0 {
            try await Task.sleep(for: .milliseconds(20))
        }
        XCTAssertEqual(d.pending, 1)
        XCTAssertEqual(notifier.badges.last, 1, "the real notifier also receives the count")
    }

    /// The web is told about each capture that reaches the API (`captured`), and
    /// the system notification still goes out.
    func testASavedCaptureNotifiesTheWeb() async {
        let real = NotifierDouble()
        let counter = PendingCounter(notifier: real)
        let saved = OSAllocatedUnfairLock(initialState: 0)
        counter.onSaved = { saved.withLock { $0 += 1 } }
        let result = SavedResult(
            transactionId: 1, summary: "s", duplicate: false, merged: false, needsReview: false, finishedAt: .now)
        await counter.captureSaved(result, source: .wallet)
        XCTAssertEqual(saved.withLock { $0 }, 1)
        XCTAssertEqual(real.isRegistered, [result])
    }

    func testIsAdminOnlyWithTheRole() throws {
        let profile = PublicProfile(
            id: 1, email: "a@coco.test", displayName: nil, role: "admin", status: "active",
            createdAt: "2026-01-01T00:00:00Z")
        XCTAssertEqual(profile.role, "admin")
        let (d, _) = try build()
        XCTAssertFalse(d.isAdmin)
    }
}

final class SignInViewTests: XCTestCase {
    func testErrorMessagesSayWhatToDo() {
        XCTAssertEqual(SignInView.message(from: APIError.unauthenticated), "Correo o contraseña incorrectos.")
        XCTAssertEqual(
            SignInView.message(from: URLError(.notConnectedToInternet)),
            "Sin conexión. Revisa la red e inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.message(from: APIError.timedOut), "La API no respondió a tiempo. Inténtalo otra vez.")
        XCTAssertEqual(
            SignInView.message(
                from: APIError.rejected(APIProblem(status: 400, code: .other("x"), detail: "El correo no es válido."))),
            "El correo no es válido.")
        XCTAssertEqual(
            SignInView.message(from: APIError.server(status: 429)), "Demasiados intentos. Espera un minuto.")
        XCTAssertTrue(SignInView.message(from: APIError.unreadableResponse).contains("Ajustes"))
    }
}

final class SettingsViewTests: XCTestCase {
    func testValidatesTheAPIURL() throws {
        XCTAssertEqual(SettingsView.validate("http://localhost:3000/").url, URL(string: "http://localhost:3000"))
        XCTAssertEqual(
            SettingsView.validate("  https://app.coco.invalid ").url, URL(string: "https://app.coco.invalid"))
        XCTAssertNil(SettingsView.validate("").reason, "empty is not an error, it just cannot be saved")
        XCTAssertNil(SettingsView.validate("").url)
        XCTAssertNotNil(SettingsView.validate("localhost").reason)
        XCTAssertNotNil(SettingsView.validate("ftp://x.y").reason)
        XCTAssertNotNil(SettingsView.validate("https://x.y/api/v2").reason, "the app appends /api/v2")
    }

    func testExpiryText() throws {
        let now = try XCTUnwrap(Calendar.current.date(from: DateComponents(year: 2026, month: 10, day: 5, hour: 12)))
        XCTAssertEqual(SettingsView.expiryText(nil), "No disponible (simulador o sin perfil)")
        XCTAssertTrue(
            SettingsView.expiryText(now.addingTimeInterval(5 * 86_400), now: now).contains(
                "quedan 5 días")
        )
        XCTAssertTrue(
            SettingsView.expiryText(now.addingTimeInterval(86_400), now: now).hasPrefix("Mañana"))
        XCTAssertTrue(
            SettingsView.expiryText(now.addingTimeInterval(-86_400), now: now).hasPrefix("Caducó"))
    }
}

/// The pieces the app hands over when registering the background tasks.
struct RegisteredTasks {
    let session: Session
    let queue: CaptureQueue
    let tree: TreeSynchronizer
    let notifier: Notifier
}
