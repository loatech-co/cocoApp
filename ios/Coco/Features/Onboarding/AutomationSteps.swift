import Foundation
import UIKit

/// Un paso de la guía. Son datos, no vista: la pantalla los recorre y las
/// pruebas los leen sin montar nada.
struct AutomationStep: Identifiable, Equatable {
    let id: Int
    let title: String
    let detail: String
    /// Nombre de SF Symbols.
    let symbol: String
}

/// Las dos automatizaciones de Atajos que alimentan a Coco, y los accesos.
enum AutomationSteps {
    /// Wallet → «Registrar gasto de Wallet».
    static let transaction: [AutomationStep] = [
        .init(
            id: 1, title: "Abre Atajos y crea una automatización",
            detail: "Pestaña Automatización → Nueva automatización → Transacción.", symbol: "plus.circle"),
        .init(
            id: 2, title: "Elige tus tarjetas de Wallet",
            detail: "Marca las tarjetas con las que pagas y deja «Cualquier comercio».", symbol: "creditcard"),
        .init(
            id: 3, title: "Que corra sola",
            detail: "Activa «Ejecutar de inmediato» y desactiva «Notificar al ejecutar».", symbol: "bolt"),
        .init(
            id: 4, title: "Añade la acción «Registrar gasto de Wallet»",
            detail: "Conecta Comercio ← Comercio, Monto ← Monto, Tarjeta ← Tarjeta o pase, Nombre ← Nombre.",
            symbol: "arrow.right.circle"),
    ]

    /// Mensajes del banco → «Registrar gasto de SMS».
    static let message: [AutomationStep] = [
        .init(
            id: 1, title: "Crea otra automatización",
            detail: "Pestaña Automatización → Nueva automatización → Mensaje.", symbol: "plus.circle"),
        .init(
            id: 2, title: "Filtra por remitente",
            detail: "«Remitente contiene» los números o nombres con los que te escribe el banco.", symbol: "message"),
        .init(
            id: 3, title: "Que corra sola",
            detail: "Activa «Ejecutar de inmediato» y desactiva «Notificar al ejecutar».", symbol: "bolt"),
        .init(
            id: 4, title: "Añade la acción «Registrar gasto de SMS»",
            detail: "Conecta Texto ← Contenido del mensaje y Remitente ← Remitente.", symbol: "arrow.right.circle"),
    ]

    /// Botón de acción, Centro de control y widget.
    static let accessPoints: [AutomationStep] = [
        .init(
            id: 1, title: "Botón de acción (iOS 17)",
            detail: "Ajustes → Botón de acción → Atajo → «Registrar gasto en Coco».", symbol: "button.horizontal"),
        .init(
            id: 2, title: "Centro de control y pantalla bloqueada (iOS 18)",
            detail: "Añade el control «Registrar gasto» de Coco.", symbol: "switch.2"),
        .init(
            id: 3, title: "Widget", detail: "Mantén pulsada la pantalla de inicio → añadir widget → Coco.",
            symbol: "square.grid.2x2"),
    ]
}

/// Abre la app Atajos. `shortcuts` está en LSApplicationQueriesSchemes.
enum ShortcutsLauncher {
    static let url: URL = {
        guard let url = URL(string: "shortcuts://") else { preconditionFailure("shortcuts:// es una URL válida") }
        return url
    }()

    @MainActor
    static func open(with opener: @MainActor (URL) -> Void = { UIApplication.shared.open($0) }) {
        opener(url)
    }
}
