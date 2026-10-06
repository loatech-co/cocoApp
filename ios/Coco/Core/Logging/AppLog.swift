import os

/// Registro unificado de la app. Se lee con
/// `log stream --predicate 'subsystem == "co.loatech.coco"'`.
enum AppLog {
    static let subsystem = "co.loatech.coco"
    static let app = Logger(subsystem: subsystem, category: "app")
    static let navigation = Logger(subsystem: subsystem, category: "navigation")
    static let session = Logger(subsystem: subsystem, category: "session")
    /// La cola de capturas. Nunca el contenido de una captura —importes,
    /// comercios, notas—: solo qué paso falló y el tipo de error.
    static let queue = Logger(subsystem: subsystem, category: "queue")
}
