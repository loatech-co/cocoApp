import os

/// Unified logging of the app. It is read with
/// `log stream --predicate 'subsystem == "co.loatech.coco"'`.
enum AppLog {
    static let subsystem = "co.loatech.coco"
    static let app = Logger(subsystem: subsystem, category: "app")
    static let navigation = Logger(subsystem: subsystem, category: "navigation")
    static let session = Logger(subsystem: subsystem, category: "session")
    /// The captures queue. Never the content of a capture —amounts,
    /// merchants, notes—: only which step failed and the error type.
    static let queue = Logger(subsystem: subsystem, category: "queue")
}
