import AppIntents
import Foundation

enum ParameterError: Error, Equatable {
    case emptyText
}

/// What Shortcuts hands over, converted into a `CaptureBody`. Pure: neither network nor
/// queue, to test it with fixed dates and texts.
enum ActionParameters {
    static let queuedText = L10n.Shortcuts.dialogQueued

    /// Wallet: the merchant wins; if it is missing, the transaction's «name». The
    /// text is never left empty —«Wallet · <tarjeta> · <nombre>»— because the
    /// API returns 422 for a capture without text or merchant.
    static func walletBody(merchant: String?, amount: String?, card: String?, name: String?, now: Date)
        -> CaptureBody
    {
        let cleanMerchant = trimmedOrNil(merchant)
        let cleanName = trimmedOrNil(name)
        let parts = ["Wallet", trimmedOrNil(card), cleanName].compactMap { $0 }
        return CaptureBody(
            text: parts.joined(separator: " · "),
            merchant: cleanMerchant ?? cleanName,
            amount: AmountParser.normalize(amount),
            date: BogotaDate.day(now)
        )
    }

    /// SMS: the text goes in full —it is what the API knows how to read— and the sender in
    /// the note, so as not to contaminate the interpretation. Empty is not enqueued.
    static func smsBody(text: String, sender: String?, now: Date) throws -> CaptureBody {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { throw ParameterError.emptyText }
        return CaptureBody(
            text: cleaned,
            date: BogotaDate.day(now),
            note: trimmedOrNil(sender).map { "De: \($0)" }
        )
    }

    /// What the shortcut's dialog says: the API's summary as is, or that
    /// it was saved.
    static func dialogText(_ r: CaptureResult) -> String {
        switch r {
        case .sent(let g):
            return g.needsReview ? L10n.Shortcuts.dialogNeedsReview(g.summary) : g.summary
        case .queued(let pending):
            return pending > 1 ? L10n.Shortcuts.dialogQueuedMany(queuedText, pending: pending) : queuedText
        case .unconfirmed:
            return L10n.Shortcuts.dialogUnconfirmed
        case .failed(let reason):
            return L10n.Shortcuts.dialogFailed(reason)
        }
    }

    static func dialog(_ r: CaptureResult) -> IntentDialog {
        IntentDialog(stringLiteral: dialogText(r))
    }

    private static func trimmedOrNil(_ text: String?) -> String? {
        guard let t = text?.trimmingCharacters(in: .whitespacesAndNewlines), !t.isEmpty else { return nil }
        return t
    }
}
