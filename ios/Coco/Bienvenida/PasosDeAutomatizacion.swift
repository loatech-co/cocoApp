import Foundation
import UIKit

/// Un paso de la guía. Son datos, no vista: la pantalla los recorre y las
/// pruebas los leen sin montar nada.
struct PasoDeAutomatizacion: Identifiable, Equatable {
    let id: Int
    let titulo: String
    let detalle: String
    /// Nombre de SF Symbols.
    let simbolo: String
}

/// Las dos automatizaciones de Atajos que alimentan a Coco, y los accesos.
enum PasosDeAutomatizacion {
    /// Wallet → «Registrar gasto de Wallet».
    static let transaccion: [PasoDeAutomatizacion] = [
        .init(
            id: 1, titulo: "Abre Atajos y crea una automatización",
            detalle: "Pestaña Automatización → Nueva automatización → Transacción.", simbolo: "plus.circle"),
        .init(
            id: 2, titulo: "Elige tus tarjetas de Wallet",
            detalle: "Marca las tarjetas con las que pagas y deja «Cualquier comercio».", simbolo: "creditcard"),
        .init(
            id: 3, titulo: "Que corra sola",
            detalle: "Activa «Ejecutar de inmediato» y desactiva «Notificar al ejecutar».", simbolo: "bolt"),
        .init(
            id: 4, titulo: "Añade la acción «Registrar gasto de Wallet»",
            detalle: "Conecta Comercio ← Comercio, Monto ← Monto, Tarjeta ← Tarjeta o pase, Nombre ← Nombre.",
            simbolo: "arrow.right.circle"),
    ]

    /// Mensajes del banco → «Registrar gasto de SMS».
    static let mensaje: [PasoDeAutomatizacion] = [
        .init(
            id: 1, titulo: "Crea otra automatización",
            detalle: "Pestaña Automatización → Nueva automatización → Mensaje.", simbolo: "plus.circle"),
        .init(
            id: 2, titulo: "Filtra por remitente",
            detalle: "«Remitente contiene» los números o nombres con los que te escribe el banco.", simbolo: "message"),
        .init(
            id: 3, titulo: "Que corra sola",
            detalle: "Activa «Ejecutar de inmediato» y desactiva «Notificar al ejecutar».", simbolo: "bolt"),
        .init(
            id: 4, titulo: "Añade la acción «Registrar gasto de SMS»",
            detalle: "Conecta Texto ← Contenido del mensaje y Remitente ← Remitente.", simbolo: "arrow.right.circle"),
    ]

    /// Botón de acción, Centro de control y widget.
    static let accesos: [PasoDeAutomatizacion] = [
        .init(
            id: 1, titulo: "Botón de acción (iOS 17)",
            detalle: "Ajustes → Botón de acción → Atajo → «Registrar gasto en Coco».", simbolo: "button.horizontal"),
        .init(
            id: 2, titulo: "Centro de control y pantalla bloqueada (iOS 18)",
            detalle: "Añade el control «Registrar gasto» de Coco.", simbolo: "switch.2"),
        .init(
            id: 3, titulo: "Widget", detalle: "Mantén pulsada la pantalla de inicio → añadir widget → Coco.",
            simbolo: "square.grid.2x2"),
    ]
}

/// Abre la app Atajos. `shortcuts` está en LSApplicationQueriesSchemes.
enum AbrirAtajos {
    static let url: URL = {
        guard let url = URL(string: "shortcuts://") else { preconditionFailure("shortcuts:// es una URL válida") }
        return url
    }()

    @MainActor
    static func abrir(con abridor: @MainActor (URL) -> Void = { UIApplication.shared.open($0) }) {
        abridor(url)
    }
}
