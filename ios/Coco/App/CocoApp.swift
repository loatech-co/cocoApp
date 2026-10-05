import SwiftUI

/// La app del teléfono.
///
/// Es un capturador delgado con la web dentro: lo que se puede hacer con una
/// mano en diez segundos —anotar un gasto, fotografiar un recibo, recibir lo
/// que Wallet o un SMS traen— es nativo; todo lo demás es la misma web, en un
/// `WKWebView`, con la misma sesión. Cada pantalla existe una sola vez.
@main
struct CocoApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
    }
}
