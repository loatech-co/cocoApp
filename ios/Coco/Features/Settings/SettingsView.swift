import SwiftUI

/// The API URL, the version, when the signature expires and a test of the
/// notifications. It lives as a sheet: it is reached from More and from the sign-in sheet.
struct SettingsView: View {
    let d: Dependencies

    @Environment(\.dismiss) private var dismiss
    @State private var urlText: String
    @State private var testNotificationResult: String?
    @State private var saved = false

    init(d: Dependencies) {
        self.d = d
        _urlText = State(initialValue: d.configuration.base.absoluteString)
    }

    private var validation: Validation { Self.validate(urlText) }
    private var hasChanged: Bool { validation.url != nil && validation.url != d.configuration.base }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(L10n.Settings.apiUrlPlaceholder, text: $urlText)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if let reason = validation.reason {
                        Text(reason).font(.footnote).foregroundStyle(.red)
                    }
                    Button(L10n.Settings.apiUrlSave, action: save)
                        .disabled(!hasChanged)
                    Button(L10n.Settings.apiUrlReset, action: reset)
                } header: {
                    Text(L10n.Settings.apiUrlTitle).textCase(nil)
                } footer: {
                    Text(
                        saved
                            ? L10n.Settings.apiUrlSaved
                            : L10n.Settings.apiUrlFooter
                    )
                }

                Section {
                    LabeledContent(L10n.Settings.installVersion, value: "\(Brand.version) (\(Self.build))")
                    LabeledContent(
                        L10n.Settings.installExpiry, value: Self.expiryText(ProvisioningProfileReader.fromBundle()))
                    LabeledContent(L10n.Settings.installPending, value: "\(d.pending)")
                    LabeledContent(L10n.Settings.installApi, value: d.configuration.base.absoluteString)
                } header: {
                    Text(L10n.Settings.installTitle).textCase(nil)
                }

                Section {
                    Button(L10n.Settings.notificationsTest) { Task { await sendTestNotification() } }
                    if let testNotificationResult {
                        Text(testNotificationResult).font(.footnote).foregroundStyle(.secondary)
                    }
                } header: {
                    Text(L10n.Settings.notificationsTitle).textCase(nil)
                }
            }
            .navigationTitle(L10n.Settings.title)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button(L10n.Common.done) { dismiss() }
                }
            }
        }
    }

    // MARK: Actions

    private func save() {
        guard let url = validation.url else { return }
        APIConfiguration.save(base: url, defaults: d.defaults)
        saved = true
        AppLog.app.info("URL de la API cambiada a \(url.absoluteString, privacy: .public)")
        Task { await d.signOut() }
    }

    private func reset() {
        APIConfiguration.reset(defaults: d.defaults)
        urlText = APIConfiguration.current(defaults: d.defaults).base.absoluteString
        saved = urlText != d.configuration.base.absoluteString
        if saved { Task { await d.signOut() } }
    }

    private func sendTestNotification() async {
        guard await d.notifier.requestPermission() else {
            testNotificationResult = L10n.Settings.notificationsDenied
            return
        }
        let sample = SavedResult(
            transactionId: 0, summary: L10n.Settings.notificationsTestBody, duplicate: false, merged: false,
            needsReview: false, finishedAt: .now)
        await d.notifier.captureSaved(sample, source: .iosManual)
        testNotificationResult = L10n.Settings.notificationsSent
    }

    // MARK: Pure

    struct Validation: Equatable {
        let url: URL?
        let reason: String?
    }

    /// `http(s)://host[:port]`, without path or query: the base to which the
    /// app adds `/api/v2`.
    nonisolated static func validate(_ text: String) -> Validation {
        let cleaned = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleaned.isEmpty else { return Validation(url: nil, reason: nil) }
        guard let url = URL(string: cleaned), let scheme = url.scheme?.lowercased(), let host = url.host(),
            !host.isEmpty
        else {
            return Validation(url: nil, reason: L10n.Settings.apiUrlErrorIncomplete)
        }
        guard scheme == "http" || scheme == "https" else {
            return Validation(url: nil, reason: L10n.Settings.apiUrlErrorScheme)
        }
        let path = url.path()
        guard path.isEmpty || path == "/", url.query() == nil, url.fragment() == nil else {
            return Validation(url: nil, reason: L10n.Settings.apiUrlErrorPath)
        }
        return Validation(url: APIConfiguration(base: url).base, reason: nil)
    }

    nonisolated static func expiryText(_ expiresAt: Date?, now: Date = .now) -> String {
        guard let expiresAt else { return L10n.Settings.expiryUnavailable }
        let days = ExpiryReminder.daysLeft(expiresAt: expiresAt, now: now)
        let date = expiresAt.formatted(date: .abbreviated, time: .omitted)
        switch days {
        case ..<0: return L10n.Settings.expiryExpired(date)
        case 0: return L10n.Settings.expiryToday(date)
        case 1: return L10n.Settings.expiryTomorrow(date)
        default: return L10n.Settings.expiryInDays(date, days: days)
        }
    }

    private static var build: String {
        (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String) ?? "0"
    }
}
