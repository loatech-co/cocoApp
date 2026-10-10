import SwiftUI

/// What was captured from the phone: pending (with a count), waiting for
/// a session, to review, failed and done in the last 30 days. It is read from the
/// local queue, so it has content without network. At the top, if there are any, the two
/// notices the queue cannot resolve by itself: files that could not be read
/// and a disk that does not allow writing.
struct CapturesView: View {
    private let queue: CaptureQueue
    private let navigation: any Navigation

    @State private var snapshot = QueueSnapshot()
    @State private var loaded = false

    init(queue: CaptureQueue, navigation: any Navigation) {
        self.queue = queue
        self.navigation = navigation
    }

    private var captures: [PendingCapture] { snapshot.captures }

    private var pending: [PendingCapture] {
        captures.filter {
            if case .toSend = $0.phase { return true }
            if case .photoToUpload = $0.phase { return true }
            return false
        }
    }
    private var awaitingSession: [PendingCapture] { captures.filter { $0.phase == .awaitingSession } }
    private var toReview: [PendingCapture] {
        captures.filter { if case .unconfirmed = $0.phase { return true } else { return false } }
    }
    private var failedCaptures: [PendingCapture] {
        captures.filter { if case .failed = $0.phase { return true } else { return false } }
    }
    private var doneCaptures: [PendingCapture] {
        let limit = Date.now.addingTimeInterval(-30 * 86_400)
        return captures.filter {
            if case .done(let r) = $0.phase { return r.finishedAt >= limit }
            return false
        }
    }

    var body: some View {
        NavigationStack {
            List {
                storageNotices
                if !loaded {
                    ProgressView()
                } else if captures.isEmpty {
                    ContentUnavailableView(
                        L10n.Captures.emptyTitle,
                        systemImage: "tray",
                        description: Text(L10n.Captures.emptyDescription)
                    )
                }
                section(L10n.Captures.sectionPending(pending.count), pending)
                section(L10n.Captures.sectionAwaitingSession, awaitingSession)
                section(L10n.Captures.sectionToReview, toReview)
                section(L10n.Captures.sectionFailed, failedCaptures)
                section(L10n.Captures.sectionSent, doneCaptures)
                Section {
                    Button {
                        navigation.go(.welcome)
                    } label: {
                        Label(L10n.Captures.automations, systemImage: "wand.and.stars")
                    }
                }
            }
            .navigationTitle(L10n.Captures.title)
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        navigation.go(.quickForm(withCamera: false))
                    } label: {
                        Label(L10n.Captures.new, systemImage: "plus")
                    }
                }
            }
            .task {
                await queue.purge()
                snapshot = await queue.snapshot()
                loaded = true
                for await next in queue.changes {
                    snapshot = next
                }
            }
        }
    }

    @ViewBuilder
    private var storageNotices: some View {
        if snapshot.unreadable > 0 {
            Section {
                Label {
                    VStack(alignment: .leading, spacing: 3) {
                        Text(L10n.Captures.unreadable(snapshot.unreadable))
                        Text(L10n.Captures.unreadableDetail).font(.footnote).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "doc.badge.ellipsis")
                }
            }
        }
        if snapshot.diskError {
            Section {
                Label(L10n.Captures.diskError, systemImage: "externaldrive.badge.exclamationmark")
                    .foregroundStyle(.red)
            }
        }
    }

    @ViewBuilder
    private func section(_ title: String, _ items: [PendingCapture]) -> some View {
        if !items.isEmpty {
            Section {
                ForEach(items) { capture in
                    CaptureRow(capture: capture)
                        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
                            if capture.isUnconfirmed {
                                // It only removes the notice from the phone: the expense
                                // is already in the API.
                                Button(L10n.Captures.rowReviewed) {
                                    Task { try? await queue.discard(id: capture.id) }
                                }
                            } else if !capture.isDone {
                                Button(L10n.Captures.rowDiscard, role: .destructive) {
                                    Task { try? await queue.discard(id: capture.id) }
                                }
                            }
                            if capture.canRetry {
                                Button(L10n.Common.retry) {
                                    Task {
                                        await queue.retryNow(id: capture.id)
                                        _ = await queue.process(budget: .seconds(25))
                                    }
                                }
                                .tint(.accentColor)
                            }
                        }
                }
            } header: {
                Text(title).textCase(nil)
            }
        }
    }
}

private struct CaptureRow: View {
    let capture: PendingCapture

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(title).lineLimit(1)
                Spacer()
                if let amount = capture.body.amount {
                    Text(PesoFormat.format(amount)).monospacedDigit()
                }
            }
            Text(state)
                .font(.footnote)
                .foregroundStyle(capture.isFailed ? .red : .secondary)
            if let error = capture.lastError, !capture.isDone {
                Text(error).font(.caption).foregroundStyle(.secondary).lineLimit(2)
            }
        }
        .padding(.vertical, 2)
    }

    private var title: String {
        if case .done(let r) = capture.phase, !r.summary.isEmpty { return r.summary }
        if let merchant = capture.body.merchant, !merchant.isEmpty { return merchant }
        if let text = capture.body.text?.split(separator: "\n").first { return String(text) }
        return L10n.Captures.rowFallbackTitle
    }

    private var state: String {
        let date = capture.body.date ?? BogotaDate.day(capture.createdAt)
        switch capture.phase {
        case .toSend: return L10n.Captures.rowToSend(date)
        case .photoToUpload: return L10n.Captures.rowPhotoToUpload(date)
        case .awaitingSession: return L10n.Captures.rowAwaitingSession(date)
        case .unconfirmed: return L10n.Captures.rowUnconfirmed(date)
        case .failed(let reason): return L10n.Captures.rowFailed(date, reason: reason)
        case .done(let r): return r.needsReview ? L10n.Captures.rowNeedsReview(date) : date
        }
    }
}

extension PendingCapture {
    fileprivate var isDone: Bool { if case .done = phase { return true } else { return false } }
    fileprivate var isFailed: Bool { if case .failed = phase { return true } else { return false } }
    fileprivate var isUnconfirmed: Bool { if case .unconfirmed = phase { return true } else { return false } }
    fileprivate var canRetry: Bool {
        switch phase {
        case .toSend, .awaitingSession, .failed: true
        case .photoToUpload, .done, .unconfirmed: false
        }
    }
}
