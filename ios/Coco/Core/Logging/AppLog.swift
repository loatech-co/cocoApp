import os

/// Registro unificado de la app. Se lee con
/// `log stream --predicate 'subsystem == "co.loatech.coco"'`.
enum AppLog {
    static let subsystem = "co.loatech.coco"
    static let app = Logger(subsystem: subsystem, category: "app")
    static let navigation = Logger(subsystem: subsystem, category: "navegacion")
    static let session = Logger(subsystem: subsystem, category: "sesion")
}
