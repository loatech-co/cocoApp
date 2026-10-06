import Foundation

/// Los textos que ve el usuario, con su clave en `Localizable.xcstrings`.
/// Ninguna vista escribe un texto suelto: lo pide aquí, y el valor en español
/// vive en el catálogo (CONTRIBUTING.md, «iOS»). `LocalizationTests` comprueba
/// que cada clave existe y conserva el texto de siempre.
///
/// Los formatos llevan `%@` y reciben cadenas: `"\(n)"` da lo mismo que daba
/// la interpolación, sin que el locale meta separadores de miles.
enum L10n {
    enum Capture {
        static var amountLabel: String { text("capture.amount.label") }
        static var amountPlaceholder: String { text("capture.amount.placeholder") }
        static var amountUnreadable: String { text("capture.amount.unreadable") }
        static var conceptRecent: String { text("capture.concept.recent") }
        static var conceptResults: String { text("capture.concept.results") }
        static var conceptSearchPrompt: String { text("capture.concept.searchPrompt") }
        static var conceptSuggested: String { text("capture.concept.suggested") }
        static var conceptTitle: String { text("capture.concept.title") }
        static var conceptTreeMissing: String { text("capture.concept.treeMissing") }
        static var formAmount: String { text("capture.form.amount") }
        static var formChooseConcept: String { text("capture.form.chooseConcept") }
        static var formConcept: String { text("capture.form.concept") }
        static var formDate: String { text("capture.form.date") }
        static var formDetails: String { text("capture.form.details") }
        static var formMerchant: String { text("capture.form.merchant") }
        static var formNote: String { text("capture.form.note") }
        static var formReceipt: String { text("capture.form.receipt") }
        static var formRemoveConcept: String { text("capture.form.removeConcept") }
        static var formSave: String { text("capture.form.save") }
        static var formTitle: String { text("capture.form.title") }
        static var photoChange: String { text("capture.photo.change") }
        static var photoChoose: String { text("capture.photo.choose") }
        static var photoRemove: String { text("capture.photo.remove") }
        static var photoTake: String { text("capture.photo.take") }
        static var receiptNotInterpreted: String { text("capture.receipt.notInterpreted") }
        static var receiptOffline: String { text("capture.receipt.offline") }
        static var receiptPhotoUnreadable: String { text("capture.receipt.photoUnreadable") }
        static var receiptReading: String { text("capture.receipt.reading") }
        static var receiptSignInToInterpret: String { text("capture.receipt.signInToInterpret") }
        static var receiptTextUnreadable: String { text("capture.receipt.textUnreadable") }
    }

    enum Captures {
        static var automations: String { text("captures.automations") }
        static var diskError: String { text("captures.diskError") }
        static var emptyDescription: String { text("captures.empty.description") }
        static var emptyTitle: String { text("captures.empty.title") }
        static var new: String { text("captures.new") }
        static func rowAwaitingSession(_ date: String) -> String { format("captures.row.awaitingSession", date) }
        static var rowDiscard: String { text("captures.row.discard") }
        static func rowFailed(_ date: String, reason: String) -> String { format("captures.row.failed", date, reason) }
        static var rowFallbackTitle: String { text("captures.row.fallbackTitle") }
        static func rowNeedsReview(_ date: String) -> String { format("captures.row.needsReview", date) }
        static func rowPhotoToUpload(_ date: String) -> String { format("captures.row.photoToUpload", date) }
        static var rowReviewed: String { text("captures.row.reviewed") }
        static func rowToSend(_ date: String) -> String { format("captures.row.toSend", date) }
        static func rowUnconfirmed(_ date: String) -> String { format("captures.row.unconfirmed", date) }
        static var sectionAwaitingSession: String { text("captures.section.awaitingSession") }
        static var sectionFailed: String { text("captures.section.failed") }
        static func sectionPending(_ count: Int) -> String { format("captures.section.pending", String(count)) }
        static var sectionSent: String { text("captures.section.sent") }
        static var sectionToReview: String { text("captures.section.toReview") }
        static var title: String { text("captures.title") }
        static func unreadable(_ count: Int) -> String {
            count == 1 ? text("captures.unreadable.one") : format("captures.unreadable.many", String(count))
        }
        static var unreadableDetail: String { text("captures.unreadable.detail") }
    }

    enum Common {
        static var cancel: String { text("common.cancel") }
        static var done: String { text("common.done") }
        static var offline: String { text("common.offline") }
        static var retry: String { text("common.retry") }
        static var settings: String { text("common.settings") }
    }

    enum More {
        static var account: String { text("more.account") }
        static var admin: String { text("more.admin") }
        static var costCenters: String { text("more.costCenters") }
        static var signOutButton: String { text("more.signOut.button") }
        static var signOutConfirm: String { text("more.signOut.confirm") }
        static var signOutConfirmMessage: String { text("more.signOut.confirmMessage") }
        static var signOutConfirmTitle: String { text("more.signOut.confirmTitle") }
        static var title: String { text("more.title") }
        static var welcome: String { text("more.welcome") }
    }

    enum Notifications {
        static var actionOpen: String { text("notifications.action.open") }
        static var captureDuplicate: String { text("notifications.capture.duplicate") }
        static var captureFailed: String { text("notifications.capture.failed") }
        static var captureMerged: String { text("notifications.capture.merged") }
        static func captureNeedsReview(_ summary: String) -> String {
            format("notifications.capture.needsReview", summary)
        }
        static var captureSaved: String { text("notifications.capture.saved") }
        static func queueSentMany(_ count: Int) -> String { format("notifications.queue.sentMany", String(count)) }
        static var queueSentOne: String { text("notifications.queue.sentOne") }
        static var queueTitle: String { text("notifications.queue.title") }
    }

    enum Offline {
        static var capture: String { text("offline.capture") }
        static var message: String { text("offline.message") }
        static func pendingMany(_ pending: Int) -> String { format("offline.pendingMany", String(pending)) }
        static var pendingOne: String { text("offline.pendingOne") }
    }

    enum Onboarding {
        static var accessActionButtonDetail: String { text("onboarding.access.actionButton.detail") }
        static var accessActionButtonTitle: String { text("onboarding.access.actionButton.title") }
        static var accessControlCenterDetail: String { text("onboarding.access.controlCenter.detail") }
        static var accessControlCenterTitle: String { text("onboarding.access.controlCenter.title") }
        static var accessWidgetDetail: String { text("onboarding.access.widget.detail") }
        static var accessWidgetTitle: String { text("onboarding.access.widget.title") }
        static var messageStep1Detail: String { text("onboarding.message.step1.detail") }
        static var messageStep1Title: String { text("onboarding.message.step1.title") }
        static var messageStep2Detail: String { text("onboarding.message.step2.detail") }
        static var messageStep2Title: String { text("onboarding.message.step2.title") }
        static var messageStep4Detail: String { text("onboarding.message.step4.detail") }
        static var messageStep4Title: String { text("onboarding.message.step4.title") }
        static var runAloneDetail: String { text("onboarding.runAlone.detail") }
        static var runAloneTitle: String { text("onboarding.runAlone.title") }
        static var walletStep1Detail: String { text("onboarding.wallet.step1.detail") }
        static var walletStep1Title: String { text("onboarding.wallet.step1.title") }
        static var walletStep2Detail: String { text("onboarding.wallet.step2.detail") }
        static var walletStep2Title: String { text("onboarding.wallet.step2.title") }
        static var walletStep4Detail: String { text("onboarding.wallet.step4.detail") }
        static var walletStep4Title: String { text("onboarding.wallet.step4.title") }
        static var welcomeAccessSection: String { text("onboarding.welcome.accessSection") }
        static var welcomeIntro: String { text("onboarding.welcome.intro") }
        static var welcomeMessageSection: String { text("onboarding.welcome.messageSection") }
        static var welcomeOpenShortcuts: String { text("onboarding.welcome.openShortcuts") }
        static var welcomeTitle: String { text("onboarding.welcome.title") }
        static var welcomeWalletSection: String { text("onboarding.welcome.walletSection") }
    }

    enum Problem {
        static var accountNotEnabled: String { text("problem.accountNotEnabled") }
        static var accountPendingApproval: String { text("problem.accountPendingApproval") }
        static var accountSuspended: String { text("problem.accountSuspended") }
        static var sessionExpired: String { text("problem.sessionExpired") }
        static var sessionRevoked: String { text("problem.sessionRevoked") }
    }

    enum Queue {
        static var errorDuplicateWithPhoto: String { text("queue.error.duplicateWithPhoto") }
        static var errorGeneric: String { text("queue.error.generic") }
        static var errorNoNetwork: String { text("queue.error.noNetwork") }
        static var errorNoPhotoSpace: String { text("queue.error.noPhotoSpace") }
        static var errorNotSaved: String { text("queue.error.notSaved") }
        static func errorServer(_ status: Int) -> String { format("queue.error.server", String(status)) }
        static var errorSessionExpired: String { text("queue.error.sessionExpired") }
        static var errorTimedOut: String { text("queue.error.timedOut") }
        static var errorUnreadableResponse: String { text("queue.error.unreadableResponse") }
    }

    enum Reminders {
        static var expiryBody: String { text("reminders.expiry.body") }
        static var expiryExpired: String { text("reminders.expiry.expired") }
        static func expiryInDays(_ days: Int) -> String { format("reminders.expiry.inDays", String(days)) }
        static func expiryTitle(_ when: String) -> String { format("reminders.expiry.title", when) }
        static var expiryToday: String { text("reminders.expiry.today") }
        static var expiryTomorrow: String { text("reminders.expiry.tomorrow") }
    }

    enum Session {
        static var errorBadCredentials: String { text("session.error.badCredentials") }
        static var errorNoNetwork: String { text("session.error.noNetwork") }
        static var errorRejected: String { text("session.error.rejected") }
        static func errorServer(_ status: Int) -> String { format("session.error.server", String(status)) }
        static var errorTimedOut: String { text("session.error.timedOut") }
        static var errorTooManyAttempts: String { text("session.error.tooManyAttempts") }
        static var errorUnreadableResponse: String { text("session.error.unreadableResponse") }
        static var signInEmail: String { text("session.signIn.email") }
        static var signInFooter: String { text("session.signIn.footer") }
        static var signInPassword: String { text("session.signIn.password") }
        static var signInSubmit: String { text("session.signIn.submit") }
        static var signInTitle: String { text("session.signIn.title") }
    }

    enum Settings {
        static var apiUrlErrorIncomplete: String { text("settings.apiUrl.error.incomplete") }
        static var apiUrlErrorPath: String { text("settings.apiUrl.error.path") }
        static var apiUrlErrorScheme: String { text("settings.apiUrl.error.scheme") }
        static var apiUrlFooter: String { text("settings.apiUrl.footer") }
        static var apiUrlPlaceholder: String { text("settings.apiUrl.placeholder") }
        static var apiUrlReset: String { text("settings.apiUrl.reset") }
        static var apiUrlSave: String { text("settings.apiUrl.save") }
        static var apiUrlSaved: String { text("settings.apiUrl.saved") }
        static var apiUrlTitle: String { text("settings.apiUrl.title") }
        static func expiryExpired(_ date: String) -> String { format("settings.expiry.expired", date) }
        static func expiryInDays(_ date: String, days: Int) -> String {
            format("settings.expiry.inDays", date, String(days))
        }
        static func expiryToday(_ date: String) -> String { format("settings.expiry.today", date) }
        static func expiryTomorrow(_ date: String) -> String { format("settings.expiry.tomorrow", date) }
        static var expiryUnavailable: String { text("settings.expiry.unavailable") }
        static var installApi: String { text("settings.install.api") }
        static var installExpiry: String { text("settings.install.expiry") }
        static var installPending: String { text("settings.install.pending") }
        static var installTitle: String { text("settings.install.title") }
        static var installVersion: String { text("settings.install.version") }
        static var notificationsDenied: String { text("settings.notifications.denied") }
        static var notificationsSent: String { text("settings.notifications.sent") }
        static var notificationsTest: String { text("settings.notifications.test") }
        static var notificationsTestBody: String { text("settings.notifications.testBody") }
        static var notificationsTitle: String { text("settings.notifications.title") }
        static var title: String { text("settings.title") }
    }

    enum Shortcuts {
        static func dialogFailed(_ reason: String) -> String { format("shortcuts.dialog.failed", reason) }
        static func dialogNeedsReview(_ summary: String) -> String { format("shortcuts.dialog.needsReview", summary) }
        static var dialogQueued: String { text("shortcuts.dialog.queued") }
        static var dialogUnconfirmed: String { text("shortcuts.dialog.unconfirmed") }
        static func dialogQueuedMany(_ queued: String, pending: Int) -> String {
            format("shortcuts.dialog.queuedMany", queued, String(pending))
        }
    }

    enum Tabs {
        static var captures: String { text("tabs.captures") }
        static var home: String { text("tabs.home") }
        static var more: String { text("tabs.more") }
        static var register: String { text("tabs.register") }
    }

    enum Web {
        static var errorSessionNotOpened: String { text("web.error.sessionNotOpened") }
    }

    /// El valor del catálogo; si falta la clave, `Bundle` devuelve la clave
    /// misma y la prueba lo caza.
    static func text(_ key: String) -> String {
        Bundle.main.localizedString(forKey: key, value: nil, table: nil)
    }

    static func format(_ key: String, _ arguments: String...) -> String {
        String(format: text(key), arguments: arguments)
    }
}
