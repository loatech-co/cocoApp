import SwiftUI
import WidgetKit

/// El widget de iOS 17: pantalla de inicio (`systemSmall`, `systemMedium`) y
/// pantalla bloqueada (`accessoryCircular`, `accessoryRectangular`, donde en
/// iOS 17 no hay controles). Solo abre la app por URL: sin App Group no puede
/// leer la cola, así que no enseña el contador de pendientes; ese número vive
/// dentro de la app y en la insignia del icono.
struct WidgetDeCaptura: Widget {
    static let kind = "co.loatech.coco.widget.captura"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: ProveedorFijo()) { _ in
            VistaDelWidget()
        }
        .configurationDisplayName("Registrar gasto")
        .description("Abre Coco en el formulario rápido.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryRectangular])
    }
}

/// No hay nada que refrescar: el widget es un botón. Una sola entrada, para
/// siempre.
struct EntradaFija: TimelineEntry {
    let date: Date
}

struct ProveedorFijo: TimelineProvider {
    func placeholder(in context: Context) -> EntradaFija {
        EntradaFija(date: .now)
    }

    func getSnapshot(in context: Context, completion: @escaping (EntradaFija) -> Void) {
        completion(EntradaFija(date: .now))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<EntradaFija>) -> Void) {
        completion(Timeline(entries: [EntradaFija(date: .now)], policy: .never))
    }
}

/// Una vista por familia. Las de una sola acción usan `widgetURL`; la mediana
/// lleva dos `Link`, porque un widget con dos zonas no puede usar `widgetURL`.
struct VistaDelWidget: View {
    @Environment(\.widgetFamily) private var familia

    private let manual = URLDeCaptura.manual
    private let foto = URLDeCaptura.foto

    var body: some View {
        switch familia {
        case .systemMedium:
            HStack(spacing: 12) {
                Link(destination: manual) {
                    Accion(titulo: "Registrar", simbolo: "plus.circle.fill")
                }
                Link(destination: foto) {
                    Accion(titulo: "Foto", simbolo: "camera.fill")
                }
            }
            .containerBackground(.fill.tertiary, for: .widget)
        case .accessoryCircular:
            Image(systemName: "plus.circle.fill")
                .font(.title)
                .widgetURL(manual)
                .containerBackground(.clear, for: .widget)
        case .accessoryRectangular:
            Label("Registrar gasto", systemImage: "plus.circle.fill")
                .font(.headline)
                .widgetURL(manual)
                .containerBackground(.clear, for: .widget)
        default:
            Accion(titulo: "Registrar gasto", simbolo: "plus.circle.fill")
                .widgetURL(manual)
                .containerBackground(.fill.tertiary, for: .widget)
        }
    }
}

/// Un icono grande y su rótulo, para la pantalla de inicio.
private struct Accion: View {
    let titulo: String
    let simbolo: String

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Image(systemName: simbolo)
                .font(.system(size: 32))
                .foregroundStyle(.tint)
            Spacer(minLength: 0)
            Text(titulo)
                .font(.headline)
                .foregroundStyle(.primary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}
