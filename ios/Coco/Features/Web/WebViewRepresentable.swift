import SwiftUI
import WebKit

/// Solo presenta el webview del puente. No lo crea ni lo configura: por eso
/// cambiar de pestaña no pierde el documento.
struct WebViewRepresentable: UIViewRepresentable {
    let bridge: WebBridge

    func makeUIView(context: Context) -> WKWebView {
        bridge.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
