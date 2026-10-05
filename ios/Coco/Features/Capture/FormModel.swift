import Foundation
import Observation
import UIKit

/// El estado del formulario rápido: una sola pantalla con monto, concepto,
/// nota y foto. Es `@MainActor` porque lo lee la interfaz; lo que hace
/// trabajo —OCR, red, cola— se espera con `await` y vuelve aquí.
@Observable @MainActor
final class FormModel {
    /// Se puede reemplazar cuando el árbol termina de descargarse.
    var indice: TreeIndex?
    private let api: APIClient
    private let sesion: Session
    private let capturador: Capturer
    private let conectividad: Connectivity
    private let lector: any ReceiptTextReader
    private let recientes: RecentsStore
    private let reloj: @Sendable () -> Date

    var monto: String = ""
    var concepto: IndexEntry?
    var nota: String = ""
    var fecha: Date
    /// La persona tocó la fecha: la interpretación ya no la cambia.
    private(set) var fechaEditada = false
    var comercio: String?

    var foto: UIImage?
    var fotoJPEG: Data?
    var textoLeido: String?
    var propuesta: Interpretation?
    /// El concepto lo puso la interpretación, no la persona.
    private(set) var conceptoSugerido = false
    /// Con certeza media: lo que la API propone, arriba del buscador.
    private(set) var candidatos: [IndexEntry] = []
    /// Pide a la vista abrir el buscador (la vista lo vuelve a false).
    var abrirBuscador = false

    var consulta: String = ""
    var resultados: [IndexEntry] = []

    var leyendo = false
    var error: String?
    var sinRed = false

    init(
        indice: TreeIndex?,
        api: APIClient,
        sesion: Session,
        capturador: Capturer,
        conectividad: Connectivity,
        lector: any ReceiptTextReader = ReceiptReader(),
        recientes: RecentsStore = .init(),
        reloj: @Sendable @escaping () -> Date = { Date() }
    ) {
        self.indice = indice
        self.api = api
        self.sesion = sesion
        self.capturador = capturador
        self.conectividad = conectividad
        self.lector = lector
        self.recientes = recientes
        self.reloj = reloj
        self.fecha = reloj()
        self.resultados = conceptosRecientes()
    }

    // MARK: Lectura

    var montoNormalizado: String? { AmountParser.normalizar(monto) }

    /// Monto válido y algo que clasifique: un concepto elegido o el texto del
    /// recibo, que la API sabe interpretar.
    var puedeConfirmar: Bool {
        montoNormalizado != nil && (concepto != nil || !(textoLeido ?? "").isEmpty)
    }

    var conceptosRecientesVisibles: [IndexEntry] { conceptosRecientes() }

    // MARK: Concepto

    func buscar(_ consulta: String) {
        self.consulta = consulta
        let limpia = consulta.trimmingCharacters(in: .whitespacesAndNewlines)
        resultados = limpia.isEmpty ? conceptosRecientes() : (indice?.buscar(limpia) ?? [])
    }

    func elegir(_ entrada: IndexEntry) {
        concepto = entrada
        conceptoSugerido = false
        candidatos = []
        consulta = ""
        resultados = conceptosRecientes()
    }

    func quitarConcepto() {
        concepto = nil
        conceptoSugerido = false
    }

    func cambiarFecha(_ nueva: Date) {
        fecha = nueva
        fechaEditada = true
    }

    // MARK: Foto

    /// Encoger → Vision → `/interpret` → rellenar lo vacío. El OCR corre
    /// siempre (es local y el texto viaja con la captura); la interpretación
    /// solo con red, y sin red se avisa y la persona escribe.
    func leerFoto(_ imagen: UIImage) async {
        foto = imagen
        fotoJPEG = PhotoShrinker.jpeg(imagen)
        error = nil
        sinRed = false
        leyendo = true
        defer { leyendo = false }

        guard let cg = imagen.cgImage ?? fotoJPEG.flatMap({ UIImage(data: $0)?.cgImage }) else {
            error = "No se pudo leer la foto. Escribe los datos; la foto se adjuntará igual."
            return
        }
        let texto: String
        do {
            texto = try await lector.texto(de: cg)
        } catch {
            self.error = "No se pudo leer el texto del recibo. Escribe los datos; la foto se adjuntará igual."
            return
        }
        let limpio = texto.trimmingCharacters(in: .whitespacesAndNewlines)
        textoLeido = limpio.isEmpty ? nil : limpio

        guard conectividad.hayRed else {
            sinRed = true
            return
        }
        guard let textoLeido else { return }
        do {
            let token = try await sesion.accessTokenVigente()
            let cuerpo = CaptureBody(texto: textoLeido, periodo: BogotaDate.mes(reloj()))
            let interpretacion: Interpretation = try await api.enviar(
                RequestBuilder.interpretar(cuerpo), token: token)
            aplicar(interpretacion)
        } catch SessionError.sinSesion {
            error = "Inicia sesión para que Coco interprete el recibo."
        } catch {
            if case SessionError.sinConexion = error {
                sinRed = true
            } else if APIError.desde(error).esDeRed {
                sinRed = true
            } else {
                self.error = "No se pudo interpretar el recibo. Revisa los datos antes de guardar."
            }
        }
    }

    func quitarFoto() {
        foto = nil
        fotoJPEG = nil
        textoLeido = nil
        propuesta = nil
        sinRed = false
        if conceptoSugerido { quitarConcepto() }
    }

    /// Rellena lo vacío con lo interpretado; puro en `FormPrefill`.
    func aplicar(_ interpretacion: Interpretation) {
        propuesta = interpretacion
        let antes = FormFields(
            monto: monto,
            fecha: fechaEditada ? BogotaDate.dia(fecha) : nil,
            comercio: comercio,
            conceptoId: concepto?.id
        )
        let r = FormPrefill.aplicar(interpretacion, a: antes)
        monto = r.campos.monto
        comercio = r.campos.comercio
        if !fechaEditada, let dia = r.campos.fecha, let instante = Self.instante(deDia: dia) {
            fecha = instante
        }
        if r.conceptoSugerido, let id = r.campos.conceptoId, let entrada = indice?.entrada(id: id) {
            concepto = entrada
            conceptoSugerido = true
        }
        candidatos = r.candidatos.compactMap { indice?.entrada(id: $0.id) }
        if concepto == nil, !candidatos.isEmpty { abrirBuscador = true }
    }

    // MARK: Confirmar

    /// Puro: lo que viaja a la API, con el monto normalizado y la fecha en
    /// Bogotá, que es donde se gasta la plata.
    func cuerpo() -> CaptureBody {
        CaptureBody(
            texto: textoLeido,
            comercio: Self.limpiar(comercio),
            monto: montoNormalizado,
            fecha: BogotaDate.dia(fecha),
            periodo: BogotaDate.mes(fecha),
            nombre_de_archivo: fotoJPEG == nil ? nil : "recibo-\(BogotaDate.dia(fecha)).jpg",
            category_id: concepto?.id,
            nota: Self.limpiar(nota)
        )
    }

    /// Toma la foto del estado, limpia el formulario y encola. La captura ya
    /// está a salvo en disco en cuanto `capturar` arranca; lo que devuelve es
    /// solo qué pasó dentro del presupuesto, y la vista no tiene que esperarlo.
    func confirmar() async -> CaptureResult {
        let cuerpo = cuerpo()
        let foto = fotoJPEG
        let origen: CaptureSource = foto == nil ? .iosManual : .iosFoto
        if let id = concepto?.id { recientes.anotar(id) }
        limpiar()
        let resultado = await capturador.capturar(cuerpo, origen: origen, foto: foto, presupuesto: .seconds(25))
        if case .fallida(let motivo) = resultado { error = motivo }
        return resultado
    }

    func limpiar() {
        monto = ""
        concepto = nil
        nota = ""
        fecha = reloj()
        fechaEditada = false
        comercio = nil
        foto = nil
        fotoJPEG = nil
        textoLeido = nil
        propuesta = nil
        conceptoSugerido = false
        candidatos = []
        abrirBuscador = false
        consulta = ""
        resultados = conceptosRecientes()
        error = nil
        sinRed = false
        leyendo = false
    }

    // MARK: Ayudas

    private func conceptosRecientes() -> [IndexEntry] {
        guard let indice else { return [] }
        return recientes.leer().compactMap { indice.entrada(id: $0) }
    }

    private static func limpiar(_ s: String?) -> String? {
        let limpio = (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return limpio.isEmpty ? nil : limpio
    }

    /// «2026-10-04» → el mediodía de ese día en Bogotá, para que ninguna zona
    /// horaria lo mueva de día al volver a formatearlo.
    static func instante(deDia dia: String) -> Date? {
        let partes = dia.split(separator: "-").compactMap { Int($0) }
        guard partes.count == 3 else { return nil }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = BogotaDate.zona
        return cal.date(from: DateComponents(year: partes[0], month: partes[1], day: partes[2], hour: 12))
    }
}
