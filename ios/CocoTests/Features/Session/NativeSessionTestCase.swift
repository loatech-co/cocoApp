import XCTest

@testable import Coco

/// The bench the `NativeSession` tests share: the API's answers, a clock moved
/// by hand, a log of what happened in order and the doubles of the transport
/// and the Keychain. Each test class covers one face of the session.
class NativeSessionTestCase: XCTestCase {
    // The `user` just as the API sends it, with keys in an order that is not
    // alphabetical: if the session rewrote it, it would show.
    static let userJSON =
        #"{"id":7,"email":"ana@coco.co","displayName":null,"role":"owner","status":"active","createdAt":"2026-01-01T00:00:00Z"}"#
    static func sessionJSON(access: String, refresh: String?, expiresIn: Int = 3600) -> String {
        let refreshPart = refresh.map { #","refreshToken":"\#($0)""# } ?? ""
        return
            #"{"data":{"accessToken":"\#(access)","expiresIn":\#(expiresIn),"user":\#(userJSON)\#(refreshPart)},"meta":{}}"#
    }
    static let profile = PublicProfile(
        id: 7, email: "ana@coco.co", displayName: nil, role: "owner", status: "active",
        createdAt: "2026-01-01T00:00:00Z")

    /// A clock the tests move by hand.
    /// `@unchecked Sendable`: a test double. What changes while the test
    /// runs goes under `lock`; what is configured is written before using it.
    final class TestClock: @unchecked Sendable {
        private let lock = NSLock()
        private var _now = Date(timeIntervalSince1970: 1_800_000_000)
        var now: Date {
            get { lock.withLock { _now } }
            set { lock.withLock { _now = newValue } }
        }
        func advance(_ s: TimeInterval) { now = now.addingTimeInterval(s) }
    }

    /// Notes, in order, of what happened: «red» when the transport answers,
    /// «llavero:<value>» when the refresh token is written.
    /// `@unchecked Sendable`: a test double. What changes while the test
    /// runs goes under `lock`; what is configured is written before using it.
    final class EventLog: @unchecked Sendable {
        private let lock = NSLock()
        private var _lines: [String] = []
        var lines: [String] { lock.withLock { _lines } }
        func record(_ l: String) { lock.withLock { _lines.append(l) } }
    }

    final class RecordingTransport: Transport {
        let inner: FakeTransport
        let log: EventLog
        init(_ inner: FakeTransport, log: EventLog) {
            self.inner = inner
            self.log = log
        }
        func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            // A breather so that the concurrent calls arrive while
            // this one is still in flight.
            try await Task.sleep(for: .milliseconds(30))
            log.record("red")
            return try await inner.data(for: request)
        }
    }

    /// A transport that never answers: a request only ends when its task is
    /// cancelled. It reports each arrival through `arrivals`, so a test waits
    /// for the request instead of sleeping and hoping.
    /// `@unchecked Sendable`: a test double; `received` goes under `lock`.
    final class BlockingTransport: Transport, @unchecked Sendable {
        private let lock = NSLock()
        private var _received: [URLRequest] = []
        private let continuation: AsyncStream<URLRequest>.Continuation
        let arrivals: AsyncStream<URLRequest>

        init() {
            (arrivals, continuation) = AsyncStream.makeStream(of: URLRequest.self)
        }

        var received: [URLRequest] { lock.withLock { _received } }

        func data(for request: URLRequest) async throws -> (Data, HTTPURLResponse) {
            lock.withLock { _received.append(request) }
            continuation.yield(request)
            try await Task.sleep(for: .seconds(60))
            throw APIError.unreadableResponse
        }
    }

    final class RecordingKeychain: KeychainStore {
        let inner: InMemoryKeychain
        let log: EventLog
        init(_ inner: InMemoryKeychain, log: EventLog) {
            self.inner = inner
            self.log = log
        }
        func read(_ key: KeychainKey) throws -> String? { try inner.read(key) }
        func write(_ value: String, for key: KeychainKey) throws {
            log.record("llavero:\(value)")
            try inner.write(value, for: key)
        }
        func delete(_ key: KeychainKey) throws { try inner.delete(key) }
    }

    struct Harness {
        let transport: FakeTransport
        let keychain: InMemoryKeychain
        let clock: TestClock
        let log: EventLog
        let session: NativeSession
    }

    /// A session held by a transport that never answers, with `r0` in the Keychain.
    struct BlockedHarness {
        let transport: BlockingTransport
        let keychain: InMemoryKeychain
        let session: NativeSession
    }

    func harness(refresh: String? = "r0", replies: [FakeTransport.Reply] = []) -> Harness {
        let transport = FakeTransport(replies)
        let log = EventLog()
        let keychain = InMemoryKeychain(values: refresh.map { [.refreshToken: $0] } ?? [:])
        let clock = TestClock()
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = APIClient(
            configuration: APIConfiguration(base: base),
            transport: RecordingTransport(transport, log: log), version: "0.1.0")
        let session = NativeSession(
            api: api, keychain: RecordingKeychain(keychain, log: log), clock: { clock.now })
        return Harness(transport: transport, keychain: keychain, clock: clock, log: log, session: session)
    }

    func blockedHarness() throws -> BlockedHarness {
        let keychain = InMemoryKeychain(values: [.refreshToken: "r0"])
        let base = try XCTUnwrap(URL(string: "https://api.coco.invalid"))
        let transport = BlockingTransport()
        let api = APIClient(configuration: APIConfiguration(base: base), transport: transport, version: "0.1.0")
        let session = NativeSession(api: api, keychain: keychain, clock: Date.init)
        return BlockedHarness(transport: transport, keychain: keychain, session: session)
    }

    func body(_ r: URLRequest) -> String {
        String(bytes: r.httpBody ?? Data(), encoding: .utf8) ?? ""
    }

    func paths(_ t: FakeTransport) -> [String] {
        t.received.compactMap { $0.url?.path() }
    }
}
