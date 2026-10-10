import SwiftUI

/// The native bar with its four tabs, the sign-in sheet on top when
/// there is no session, and the sheets (Welcome, Settings) the router asks for.
struct RootView: View {
    let d: Dependencies

    init(d: Dependencies) {
        self.d = d
    }

    var body: some View {
        @Bindable var router = d.router
        TabView(selection: tab) {
            home
                .tabItem { Label(L10n.Tabs.home, systemImage: "house") }
                .tag(AppTab.home)
            RecordExpenseView(d: d)
                .tabItem { Label(L10n.Tabs.register, systemImage: "plus.circle") }
                .tag(AppTab.register)
            CapturesView(queue: d.queue, navigation: d.router)
                .tabItem { Label(L10n.Tabs.captures, systemImage: "tray") }
                .badge(d.pending)
                .tag(AppTab.captures)
            MoreView(d: d)
                .tabItem { Label(L10n.Tabs.more, systemImage: "ellipsis") }
                .tag(AppTab.more)
        }
        .fullScreenCover(isPresented: signedOut) {
            SignInView(session: d.session, onSettings: { d.router.go(.settings) })
                .sheet(item: $router.sheet, content: sheetContent)
        }
        .sheet(item: $router.sheet, content: sheetContent)
        .onChange(of: router.pendingWebPath, initial: true) { _, _ in consumePending() }
        .onChange(of: router.searchPending) { _, _ in consumePending() }
        // Going back to the web tab is going back to the foreground for it.
        .onChange(of: router.tab) { old, new in
            if new == .home, old != .home { Task { await d.bridge.notify(.foreground) } }
        }
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

    /// What the router left for the web, as soon as the Home tab takes over.
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

/// The Record tab: a new form for each request from the
/// router (deep link, intent, bridge), with the camera open if it was asked for.
private struct RecordExpenseView: View {
    let d: Dependencies

    @State private var model: FormModel?
    @State private var closedCount = 0

    var body: some View {
        Group {
            if let model {
                QuickFormView(model: model, opensCameraOnAppear: d.router.formRequest.withCamera) {
                    // Saving already enqueued; closing is going back to Home with a
                    // clean form for the next one.
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
