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
        TabView(selection: pestana) {
            inicio
                .tabItem { Label("Inicio", systemImage: "house") }
                .tag(AppTab.inicio)
            RecordExpenseView(d: d)
                .tabItem { Label("Registrar", systemImage: "plus.circle") }
                .tag(AppTab.register)
            CapturesView(queue: d.queue, navigation: d.router)
                .tabItem { Label("Capturas", systemImage: "tray") }
                .badge(d.pending)
                .tag(AppTab.captures)
            MoreView(d: d)
                .tabItem { Label("Más", systemImage: "ellipsis") }
                .tag(AppTab.mas)
        }
        .fullScreenCover(isPresented: signedOut) {
            SignInView(session: d.session, onSettings: { d.router.go(.settings) })
                .sheet(item: $router.hoja, content: hoja)
        }
        .sheet(item: $router.hoja, content: hoja)
        .onChange(of: router.rutaWebPendiente, initial: true) { _, _ in consumirPendientes() }
        .onChange(of: router.busquedaPendiente) { _, _ in consumirPendientes() }
        .task { await d.arrancar() }
    }

    private var inicio: some View {
        WebContainer(puente: d.puente, connectivity: d.connectivity, pending: d.pending) {
            d.router.go(.quickForm(withCamera: false))
        }
    }

    @ViewBuilder
    private func hoja(_ hoja: Sheet) -> some View {
        switch hoja {
        case .welcome:
            WelcomeView(onFinish: { d.router.hoja = nil })
        case .settings:
            SettingsView(d: d)
        }
    }

    /// Tocar otra vez Inicio vuelve a `/`.
    private var pestana: Binding<AppTab> {
        Binding(
            get: { d.router.pestana },
            set: { nueva in
                if nueva == .inicio, d.router.pestana == .inicio { d.puente.go(to: "/") }
                d.router.pestana = nueva
            }
        )
    }

    private var signedOut: Binding<Bool> {
        Binding(
            get: { if case .signedOut = d.estadoDeSesion { true } else { false } },
            set: { _ in }
        )
    }

    /// Lo que el enrutador dejó para la web, en cuanto la pestaña Inicio manda.
    private func consumirPendientes() {
        if let path = d.router.rutaWebPendiente {
            d.router.rutaWebPendiente = nil
            d.puente.go(to: path)
        }
        if d.router.busquedaPendiente {
            d.router.busquedaPendiente = false
            d.puente.abrirBusqueda()
        }
    }
}

/// La pestaña Registrar: un formulario nuevo por cada petición del
/// enrutador (deep link, intent, puente), con la cámara abierta si se pidió.
private struct RecordExpenseView: View {
    let d: Dependencies

    @State private var model: FormModel?
    @State private var cerrados = 0

    var body: some View {
        Group {
            if let model {
                QuickFormView(model: model, opensCameraOnAppear: d.router.formulario.withCamera) {
                    // Guardar ya encoló; cerrar es volver a Inicio con un
                    // formulario limpio para la próxima.
                    cerrados += 1
                    d.router.pestana = .inicio
                }
                .id(identidad)
            } else {
                ProgressView()
            }
        }
        .task(id: identidad) {
            model = await d.nuevoModeloDelFormulario()
        }
    }

    private var identidad: String { "\(d.router.formulario.generacion)-\(cerrados)" }
}
