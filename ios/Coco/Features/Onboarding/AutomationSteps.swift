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
            id: 1, title: L10n.Onboarding.walletStep1Title,
            detail: L10n.Onboarding.walletStep1Detail, symbol: "plus.circle"),
        .init(
            id: 2, title: L10n.Onboarding.walletStep2Title,
            detail: L10n.Onboarding.walletStep2Detail, symbol: "creditcard"),
        .init(
            id: 3, title: L10n.Onboarding.runAloneTitle,
            detail: L10n.Onboarding.runAloneDetail, symbol: "bolt"),
        .init(
            id: 4, title: L10n.Onboarding.walletStep4Title,
            detail: L10n.Onboarding.walletStep4Detail,
            symbol: "arrow.right.circle"),
    ]

    /// Mensajes del banco → «Registrar gasto de SMS».
    static let message: [AutomationStep] = [
        .init(
            id: 1, title: L10n.Onboarding.messageStep1Title,
            detail: L10n.Onboarding.messageStep1Detail, symbol: "plus.circle"),
        .init(
            id: 2, title: L10n.Onboarding.messageStep2Title,
            detail: L10n.Onboarding.messageStep2Detail, symbol: "message"),
        .init(
            id: 3, title: L10n.Onboarding.runAloneTitle,
            detail: L10n.Onboarding.runAloneDetail, symbol: "bolt"),
        .init(
            id: 4, title: L10n.Onboarding.messageStep4Title,
            detail: L10n.Onboarding.messageStep4Detail, symbol: "arrow.right.circle"),
    ]

    /// Botón de acción, Centro de control y widget.
    static let accessPoints: [AutomationStep] = [
        .init(
            id: 1, title: L10n.Onboarding.accessActionButtonTitle,
            detail: L10n.Onboarding.accessActionButtonDetail, symbol: "button.horizontal"),
        .init(
            id: 2, title: L10n.Onboarding.accessControlCenterTitle,
            detail: L10n.Onboarding.accessControlCenterDetail, symbol: "switch.2"),
        .init(
            id: 3, title: L10n.Onboarding.accessWidgetTitle, detail: L10n.Onboarding.accessWidgetDetail,
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
