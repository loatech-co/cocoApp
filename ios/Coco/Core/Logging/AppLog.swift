import os

/// Registro unificado de la app. Se lee con
/// `log stream --predicate 'subsystem == "co.loatech.coco"'`.
enum AppLog {
    static let subsistema = "co.loatech.coco"
    static let app = Logger(subsystem: subsistema, category: "app")
    static let navegacion = Logger(subsystem: subsistema, category: "navegacion")
    static let sesion = Logger(subsystem: subsistema, category: "sesion")
}
