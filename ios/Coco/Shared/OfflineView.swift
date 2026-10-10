import SwiftUI

/// What is shown when there is no network and the web did not get to load. The important thing
/// is to say that capturing still works.
struct OfflineView: View {
    let pending: Int
    let retry: () -> Void
    let capture: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wifi.slash")
                .font(.system(size: 40))
                .foregroundStyle(.secondary)
            Text(L10n.Common.offline)
                .font(.title2.weight(.semibold))
            Text(text)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button(L10n.Common.retry, action: retry)
                    .buttonStyle(.bordered)
                Button(L10n.Offline.capture, action: capture)
                    .buttonStyle(.borderedProminent)
            }
        }
        .padding(24)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemBackground))
    }

    private var text: String {
        var t = L10n.Offline.message
        if pending == 1 { t += L10n.Offline.pendingOne } else if pending > 1 { t += L10n.Offline.pendingMany(pending) }
        return t
    }
}

#Preview {
    OfflineView(pending: 3, retry: {}, capture: {})
}
