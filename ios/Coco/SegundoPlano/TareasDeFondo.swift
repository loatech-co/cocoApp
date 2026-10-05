import BackgroundTasks
import Foundation

/// Lo que iOS concede en segundo plano: una renovación corta (sesión tibia y
/// árbol fresco) y un procesado de la cola con red. Son una ayuda, no una
/// garantía: la cola también se dispara en primer plano, al volver la red,
/// tras cada encolado y tras cada login. Si iOS nunca las concede, nada se
/// pierde; solo tarda más en enviarse.
enum TareasDeFondo {
    /// BGAppRefreshTask.
    static let renovar = "co.loatech.coco.renovar"
    /// BGProcessingTask, con red.
    static let cola = "co.loatech.coco.cola"

    /// Lo que declara `BGTaskSchedulerPermittedIdentifiers` en el Info.plist:
    /// si una tarea se programa con un identificador que no está ahí, iOS
    /// la rechaza en silencio.
    static func identificadoresPermitidos(en bundle: Bundle = .main) -> [String] {
        bundle.object(forInfoDictionaryKey: "BGTaskSchedulerPermittedIdentifiers") as? [String] ?? []
    }

    /// `submit` sin un handler registrado no lanza un error: lanza una
    /// excepción de Objective-C que tumba la app. Por eso se recuerda si
    /// `registrar` ya pasó y `programar` no hace nada antes.
    private static let registro = Registro()
    private final class Registro: @unchecked Sendable {
        private let cerrojo = NSLock()
        private var hecho = false
        var valor: Bool {
            get { cerrojo.withLock { hecho } }
            set { cerrojo.withLock { hecho = newValue } }
        }
    }
    static var registradas: Bool { registro.valor }

    /// Antes de que termine `didFinishLaunching`; después iOS ya no deja.
    @MainActor
    static func registrar(sesion: Sesion, cola: ColaDeCapturas, arbol: SincronizadorDelArbol, notificador: Notificador, scheduler: BGTaskScheduler = .shared) {
        registro.valor = true
        scheduler.register(forTaskWithIdentifier: renovar, using: nil) { tarea in
            correr(tarea, scheduler: scheduler) {
                await ejecutarRenovacion(sesion: sesion, arbol: arbol)
            }
        }
        scheduler.register(forTaskWithIdentifier: Self.cola, using: nil) { tarea in
            correr(tarea, scheduler: scheduler) {
                _ = await ejecutarCola(cola: cola, notificador: notificador, presupuesto: .seconds(25))
            }
        }
    }

    /// Al pasar a segundo plano y al terminar cada tarea. Si el sistema
    /// rechaza la solicitud —simulador, identificador sin registrar— se
    /// ignora: la corrección nunca depende de esto.
    static func programar(scheduler: BGTaskScheduler = .shared) {
        guard registradas else { return }
        for solicitud in solicitudes() {
            try? scheduler.submit(solicitud)
        }
    }

    /// Puro: las dos solicitudes, para comprobar sus identificadores sin
    /// tocar el `BGTaskScheduler` real.
    static func solicitudes(ahora: Date = .now) -> [BGTaskRequest] {
        let renovacion = BGAppRefreshTaskRequest(identifier: renovar)
        renovacion.earliestBeginDate = ahora.addingTimeInterval(15 * 60)
        let procesado = BGProcessingTaskRequest(identifier: cola)
        procesado.requiresNetworkConnectivity = true
        procesado.requiresExternalPower = false
        procesado.earliestBeginDate = ahora.addingTimeInterval(60)
        return [renovacion, procesado]
    }

    /// `accessTokenVigente()` renueva si el token está por vencer (y es la
    /// única vía de renovación, para no competir con los intents); el árbol
    /// solo se baja si pasó su edad máxima.
    static func ejecutarRenovacion(sesion: Sesion, arbol: SincronizadorDelArbol) async {
        _ = try? await sesion.accessTokenVigente()
        await arbol.refrescarSiHaceFalta()
    }

    /// Procesa dentro del presupuesto y devuelve cuántas se enviaron. El
    /// aviso «Se enviaron N capturas pendientes» lo emite la propia cola al
    /// terminar su pasada; repetirlo aquí sería avisar dos veces.
    static func ejecutarCola(cola: ColaDeCapturas, notificador: Notificador, presupuesto: Duration) async -> Int {
        let resumen = await cola.procesar(presupuesto: presupuesto)
        await notificador.ponerInsignia(resumen.pendientes)
        return resumen.enviadas
    }

    private static func correr(_ tarea: BGTask, scheduler: BGTaskScheduler, _ trabajo: @escaping @Sendable () async -> Void) {
        let ejecucion = Task {
            await trabajo()
            tarea.setTaskCompleted(success: !Task.isCancelled)
            programar(scheduler: scheduler)
        }
        // Al expirar se cancela el trabajo; el propio `Task` cierra la tarea
        // una sola vez al salir.
        tarea.expirationHandler = { ejecucion.cancel() }
    }
}
