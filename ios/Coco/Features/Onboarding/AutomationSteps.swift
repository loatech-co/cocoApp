import Foundation
import UIKit

/// A step of the guide. They are data, not a view: the screen walks through them and the
/// tests read them without mounting anything.
struct AutomationStep: Identifiable, Equatable {
    let id: Int
    let title: String
    let detail: String
    /// SF Symbols name.
    let symbol: String
}

/// The two Shortcuts automations that feed Coco, and the shortcuts.
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

    /// Bank messages → «Registrar gasto de SMS».
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

    /// Action button, Control Center and widget.
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

/// Opens the Shortcuts app. `shortcuts` is in LSApplicationQueriesSchemes.
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
