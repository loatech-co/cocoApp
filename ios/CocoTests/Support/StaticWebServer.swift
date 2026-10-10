import Foundation
import Network

/// A minimal HTTP server on `127.0.0.1` to load the built web in a
/// real `WKWebView`.
///
/// It serves the files of `root` and, like the real server, `index.html` for
/// any route that is not a file. What goes to `/api/` does not exist here:
/// it answers 404 and is noted down, so that a test sees what the web asked for.
/// One request per connection (`Connection: close`): nothing more is needed.
final class StaticWebServer: @unchecked Sendable {
    private let root: URL
    private let listener: NWListener
    private let queue = DispatchQueue(label: "co.loatech.coco.tests.web-server")
    private let lock = NSLock()
    private var apiPaths: [String] = []

    init(root: URL) throws {
        self.root = root
        let parameters = NWParameters.tcp
        parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: .any)
        listener = try NWListener(using: parameters)
    }

    /// What the web asked the API for, in order.
    var apiRequests: [String] { lock.withLock { apiPaths } }

    /// Starts and returns the base (`http://127.0.0.1:<port>`).
    func start() async throws -> URL {
        listener.newConnectionHandler = { [weak self] connection in self?.serve(connection) }
        let port: UInt16 = try await withCheckedThrowingContinuation { continuation in
            let resumed = OnceFlag()
            listener.stateUpdateHandler = { [listener] state in
                switch state {
                case .ready:
                    if resumed.set() { continuation.resume(returning: listener.port?.rawValue ?? 0) }
                case .failed(let error):
                    if resumed.set() { continuation.resume(throwing: error) }
                default:
                    break
                }
            }
            listener.start(queue: queue)
        }
        guard let base = URL(string: "http://127.0.0.1:\(port)") else { throw URLError(.badURL) }
        return base
    }

    func stop() { listener.cancel() }

    private func serve(_ connection: NWConnection) {
        connection.start(queue: queue)
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65_536) { [weak self] data, _, _, _ in
            guard let self, let data, let request = String(data: data, encoding: .utf8) else {
                connection.cancel()
                return
            }
            let target = request.split(separator: " ", maxSplits: 2).dropFirst().first.map(String.init) ?? "/"
            let path = String(target.split(separator: "?", maxSplits: 1).first ?? "/")
            let response = self.response(for: path)
            connection.send(content: response, completion: .contentProcessed { _ in connection.cancel() })
        }
    }

    private func response(for path: String) -> Data {
        if path.hasPrefix("/api/") {
            lock.withLock { apiPaths.append(path) }
            return Self.http(status: "404 Not Found", type: "application/problem+json", body: Data("{}".utf8))
        }
        let relative = path.removingPercentEncoding?.drop { $0 == "/" } ?? ""
        var file = root.appending(path: String(relative))
        var isFolder: ObjCBool = false
        if relative.isEmpty || !FileManager.default.fileExists(atPath: file.path, isDirectory: &isFolder)
            || isFolder.boolValue
        {
            file = root.appending(path: "index.html")
        }
        let body = (try? Data(contentsOf: file)) ?? Data()
        return Self.http(status: "200 OK", type: Self.contentType(of: file), body: body)
    }

    private static func http(status: String, type: String, body: Data) -> Data {
        let head =
            "HTTP/1.1 \(status)\r\nContent-Type: \(type)\r\nContent-Length: \(body.count)\r\n"
            + "Cache-Control: no-store\r\nConnection: close\r\n\r\n"
        return Data(head.utf8) + body
    }

    private static let contentTypes = [
        "html": "text/html; charset=utf-8", "js": "text/javascript", "mjs": "text/javascript", "css": "text/css",
        "json": "application/json", "webmanifest": "application/json", "svg": "image/svg+xml", "png": "image/png",
        "webp": "image/webp", "ico": "image/x-icon", "woff2": "font/woff2", "wasm": "application/wasm",
    ]

    private static func contentType(of file: URL) -> String {
        contentTypes[file.pathExtension] ?? "application/octet-stream"
    }
}

/// It fires only once: the continuation of `start()` cannot be resumed twice.
private final class OnceFlag: @unchecked Sendable {
    private let lock = NSLock()
    private var isSet = false

    func set() -> Bool {
        lock.withLock {
            defer { isSet = true }
            return !isSet
        }
    }
}
