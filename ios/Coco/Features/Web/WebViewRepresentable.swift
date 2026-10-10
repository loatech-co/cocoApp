import SwiftUI
import WebKit

/// It only presents the bridge's webview. It neither creates nor configures it: that is why
/// switching tabs does not lose the document.
struct WebViewRepresentable: UIViewRepresentable {
    let bridge: WebBridge

    func makeUIView(context: Context) -> WKWebView {
        bridge.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
