import Foundation

// MARK: What the API answered

/// Where a sent capture ends up: done, retried later, failed for good or
/// waiting for the person. Shared by the send loop only; split out for size.
extension CaptureQueue {
    func finish(_ capture: inout PendingCapture, with result: SavedResult) async -> SendOutcome {
        if let path = capture.photoPath {
            do { try store.deletePhoto(at: path) } catch { report(.deleteSentPhoto, error, visible: false) }
            capture.photoPath = nil
        }
        capture.phase = .done(result)
        capture.textResult = nil
        capture.lastError = nil
        persist(capture, step: .saveDone)
        await notifier.captureSaved(result, source: capture.source)
        await publish()
        return .done(result)
    }

    func handleFailure(_ capture: inout PendingCapture, error: Error) async -> SendOutcome {
        let api = APIError.from(error)
        let output: SendOutcome
        switch api {
        case .cancelled:
            // Neither an attempt nor an error: the capture stays on disk as it was and the
            // next run picks it up.
            return .cancelled
        case .unauthenticated, .sessionRevoked:
            // Without growing the wait: it is not the network's fault, it is the session's.
            // Revoked, refreshing does not help: it is closed here and the capture waits
            // for the person to sign in again.
            let revoked = api == .sessionRevoked
            if revoked { await session.discard() }
            capture.phase = .awaitingSession
            capture.lastError = revoked ? L10n.Problem.sessionRevoked : L10n.Queue.errorSessionExpired
            output = .retry
        case .duplicate(let problem):
            // It was already recorded (a resend): it counts as done, unless
            // a photo is left without knowing which transaction it goes to. The API does not allow
            // looking it up by `externalRef`, so the photo is kept and the
            // capture stays «Por revisar», visible in Captures.
            if let result = Self.alreadyRegistered(capture, problem, at: clock()) {
                return await finish(&capture, with: result)
            }
            AppLog.queue.warning("Duplicate with a photo and no known transaction: capture left unconfirmed")
            capture.phase = .unconfirmed(at: clock())
            capture.lastError = L10n.Queue.errorDuplicateWithPhoto
            output = .unconfirmed
        case .rejected(let problem):
            let message = problem.userMessage()
            capture.phase = .failed(reason: message)
            capture.lastError = message
            await notifier.captureFailed(reason: message)
            output = .failed
        case .unreadableSuccess(let status):
            // The server created it: retrying it would depend on idempotency
            // not to duplicate the expense. It stays «hecha, revisar».
            AppLog.queue.warning("Unreadable \(status, privacy: .public) response: capture left unconfirmed")
            capture.phase = .unconfirmed(at: clock())
            capture.lastError = nil
            output = .unconfirmed
        case .unreadableResponse:
            let reason = L10n.Queue.errorUnreadableResponse
            capture.phase = .failed(reason: reason)
            capture.lastError = reason
            await notifier.captureFailed(reason: reason)
            output = .failed
        case .noNetwork, .timedOut, .server:
            capture.attempts += 1
            capture.nextAttempt = clock().addingTimeInterval(
                Self.seconds(retryPolicy.delay(attempt: capture.attempts - 1)))
            capture.lastError = Self.describe(api)
            output = api.isNetworkError ? .noNetwork : .retry
        }
        persist(capture, step: .saveFailure)
        await publish()
        return output
    }
}
