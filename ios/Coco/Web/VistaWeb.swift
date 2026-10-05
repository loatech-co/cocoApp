import SwiftUI
import WebKit

/// Solo presenta el webview del puente. No lo crea ni lo configura: por eso
/// cambiar de pestaña no pierde el documento.
struct VistaWeb: UIViewRepresentable {
    let puente: PuenteWeb

    func makeUIView(context: Context) -> WKWebView {
        puente.webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {}
}
