import SwiftUI

/// La barra nativa con sus cuatro pestañas, la ficha de entrar encima cuando
/// no hay sesión y las hojas (Bienvenida, Ajustes) que pide el enrutador.
struct RootView: View {
    let d: Dependencies

    init(d: Dependencies) {
        self.d = d
    }

    var body: some View {
        @Bindable var router = d.router
        TabView(selection: tab) {
            home
                .tabItem { Label("Inicio", systemImage: "house") }
                .tag(AppTab.home)
            RecordExpenseView(d: d)
                .tabItem { Label("Registrar", systemImage: "plus.circle") }
                .tag(AppTab.register)
            CapturesView(queue: d.queue, navigation: d.router)
                .tabItem { Label("Capturas", systemImage: "tray") }
                .badge(d.pending)
                .tag(AppTab.captures)
            MoreView(d: d)
                .tabItem { Label("Más", systemImage: "ellipsis") }
                .tag(AppTab.more)
        }
        .fullScreenCover(isPresented: signedOut) {
            SignInView(session: d.session, onSettings: { d.router.go(.settings) })
                .sheet(item: $router.sheet, content: sheetContent)
        }
        .sheet(item: $router.sheet, content: sheetContent)
        .onChange(of: router.pendingWebPath, initial: true) { _, _ in consumePending() }
        .onChange(of: router.searchPending) { _, _ in consumePending() }
        .task { await d.start() }
    }

    private var home: some View {
        WebContainer(bridge: d.bridge, connectivity: d.connectivity, pending: d.pending) {
            d.router.go(.quickForm(withCamera: false))
        }
    }

    @ViewBuilder
    private func sheetContent(_ sheet: Sheet) -> some View {
        switch sheet {
        case .welcome:
            WelcomeView(onFinish: { d.router.sheet = nil })
        case .settings:
            SettingsView(d: d)
        }
    }

    /// Tocar otra vez Inicio vuelve a `/`.
    private var tab: Binding<AppTab> {
        Binding(
            get: { d.router.tab },
            set: { newTab in
                if newTab == .home, d.router.tab == .home { d.bridge.go(to: "/") }
                d.router.tab = newTab
            }
        )
    }

    private var signedOut: Binding<Bool> {
        Binding(
            get: { if case .signedOut = d.sessionState { true } else { false } },
            set: { _ in }
        )
    }

    /// Lo que el enrutador dejó para la web, en cuanto la pestaña Inicio manda.
    private func consumePending() {
        if let path = d.router.pendingWebPath {
            d.router.pendingWebPath = nil
            d.bridge.go(to: path)
        }
        if d.router.searchPending {
            d.router.searchPending = false
            d.bridge.openSearch()
        }
    }
}

/// La pestaña Registrar: un formulario nuevo por cada petición del
/// enrutador (deep link, intent, puente), con la cámara abierta si se pidió.
private struct RecordExpenseView: View {
    let d: Dependencies

    @State private var model: FormModel?
    @State private var closedCount = 0

    var body: some View {
        Group {
            if let model {
                QuickFormView(model: model, opensCameraOnAppear: d.router.formRequest.withCamera) {
                    // Guardar ya encoló; cerrar es volver a Inicio con un
                    // formulario limpio para la próxima.
                    closedCount += 1
                    d.router.tab = .home
                }
                .id(identity)
            } else {
                ProgressView()
            }
        }
        .task(id: identity) {
            model = await d.newFormModel()
        }
    }

    private var identity: String { "\(d.router.formRequest.generation)-\(closedCount)" }
}
