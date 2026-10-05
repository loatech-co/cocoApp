import SwiftUI

/// La barra nativa con sus cuatro pestañas, la ficha de entrar encima cuando
/// no hay sesión y las hojas (Bienvenida, Ajustes) que pide el enrutador.
struct RootView: View {
    let d: Dependencies

    init(d: Dependencies) {
        self.d = d
    }

    var body: some View {
        @Bindable var enrutador = d.enrutador
        TabView(selection: pestana) {
            inicio
                .tabItem { Label("Inicio", systemImage: "house") }
                .tag(AppTab.inicio)
            RecordExpenseView(d: d)
                .tabItem { Label("Registrar", systemImage: "plus.circle") }
                .tag(AppTab.registrar)
            CapturesView(cola: d.cola, navegacion: d.enrutador)
                .tabItem { Label("Capturas", systemImage: "tray") }
                .badge(d.pendientes)
                .tag(AppTab.capturas)
            MoreView(d: d)
                .tabItem { Label("Más", systemImage: "ellipsis") }
                .tag(AppTab.mas)
        }
        .fullScreenCover(isPresented: sinSesion) {
            SignInView(sesion: d.sesion, alAjustes: { d.enrutador.ir(.ajustes) })
                .sheet(item: $enrutador.hoja, content: hoja)
        }
        .sheet(item: $enrutador.hoja, content: hoja)
        .onChange(of: enrutador.rutaWebPendiente, initial: true) { _, _ in consumirPendientes() }
        .onChange(of: enrutador.busquedaPendiente) { _, _ in consumirPendientes() }
        .task { await d.arrancar() }
    }

    private var inicio: some View {
        WebContainer(puente: d.puente, conectividad: d.conectividad, pendientes: d.pendientes) {
            d.enrutador.ir(.formularioRapido(conCamara: false))
        }
    }

    @ViewBuilder
    private func hoja(_ hoja: Sheet) -> some View {
        switch hoja {
        case .bienvenida:
            WelcomeView(alTerminar: { d.enrutador.hoja = nil })
        case .ajustes:
            SettingsView(d: d)
        }
    }

    /// Tocar otra vez Inicio vuelve a `/`.
    private var pestana: Binding<AppTab> {
        Binding(
            get: { d.enrutador.pestana },
            set: { nueva in
                if nueva == .inicio, d.enrutador.pestana == .inicio { d.puente.ir(a: "/") }
                d.enrutador.pestana = nueva
            }
        )
    }

    private var sinSesion: Binding<Bool> {
        Binding(
            get: { if case .sinSesion = d.estadoDeSesion { true } else { false } },
            set: { _ in }
        )
    }

    /// Lo que el enrutador dejó para la web, en cuanto la pestaña Inicio manda.
    private func consumirPendientes() {
        if let ruta = d.enrutador.rutaWebPendiente {
            d.enrutador.rutaWebPendiente = nil
            d.puente.ir(a: ruta)
        }
        if d.enrutador.busquedaPendiente {
            d.enrutador.busquedaPendiente = false
            d.puente.abrirBusqueda()
        }
    }
}

/// La pestaña Registrar: un formulario nuevo por cada petición del
/// enrutador (deep link, intent, puente), con la cámara abierta si se pidió.
private struct RecordExpenseView: View {
    let d: Dependencies

    @State private var modelo: FormModel?
    @State private var cerrados = 0

    var body: some View {
        Group {
            if let modelo {
                QuickFormView(modelo: modelo, abrirCamaraAlEntrar: d.enrutador.formulario.conCamara) {
                    // Guardar ya encoló; cerrar es volver a Inicio con un
                    // formulario limpio para la próxima.
                    cerrados += 1
                    d.enrutador.pestana = .inicio
                }
                .id(identidad)
            } else {
                ProgressView()
            }
        }
        .task(id: identidad) {
            modelo = await d.nuevoModeloDelFormulario()
        }
    }

    private var identidad: String { "\(d.enrutador.formulario.generacion)-\(cerrados)" }
}
