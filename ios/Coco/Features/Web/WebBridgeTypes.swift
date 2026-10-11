import Foundation

enum LoadState: Equatable {
    case loading
    case ready
    case failure(URLError.Code)
    /// The web asked for a session again after two deliveries in a row: something
    /// on the web side does not accept it and polling does not fix it.
    case webSessionStuck
}

/// What the web reports through `cocoEvents`, with no reply. Each case is named
/// like the `type` of `BridgeEvent` in `frontend/src/shared/lib/native-contract.ts`.
enum WebEvent: String, CaseIterable, Equatable {
    case signOut
    case sessionClosed
    case noSession
    case openCapture

    init?(message: Any) {
        guard let dict = message as? [String: Any], let kind = dict["type"] as? String else { return nil }
        self.init(rawValue: kind)
    }
}

/// What the app calls in `window.__coco`, besides the notices (`WebNotice`).
/// Each case is named like a member of `WebBridge` in
/// `frontend/src/shared/lib/bridge.ts`.
enum WebFunction: String, CaseIterable {
    case navigate
    case openSearch
    case receiveSession
    case sessionClosed
}
