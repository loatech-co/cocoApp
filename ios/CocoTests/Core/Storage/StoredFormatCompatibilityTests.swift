import XCTest

@testable import Coco

/// Las claves con las que se escriben en disco la cola y el árbol, y con las
/// que viajan a la API. Si un renombre del código las cambia, una captura que
/// ya estaba en la cola de alguien deja de leerse al actualizar la app. Las
/// cadenas de aquí son el contrato: no se tocan para que una prueba pase.
final class StoredFormatCompatibilityTests: XCTestCase {
    private func json<T: Encodable>(_ valor: T) throws -> String {
        let codificador = JSONEncoder()
        codificador.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return try XCTUnwrap(String(data: codificador.encode(valor), encoding: .utf8))
    }

    private func idaYVuelta<T: Codable & Equatable>(_ valor: T, _ esperado: String, line: UInt = #line) throws {
        XCTAssertEqual(try json(valor), esperado, line: line)
        XCTAssertEqual(try JSONDecoder().decode(T.self, from: Data(esperado.utf8)), valor, line: line)
    }

    private static let resultado = SavedResult(
        transactionId: 9, resumen: "r", repetido: false, fusionado: true, porRevisar: true,
        terminadaEn: Date(timeIntervalSinceReferenceDate: 100))

    private static let cuerpo = CaptureBody(
        texto: "t", comercio: "c", monto: "1", fecha: "2026-01-02", periodo: "2026-01", fileName: "f.jpg",
        categoryId: 3, nota: "n")

    private func pendiente(_ fase: PendingCapture.Phase) -> PendingCapture {
        PendingCapture(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001") ?? UUID(),
            creadaEn: Date(timeIntervalSinceReferenceDate: 0), origen: .iosFoto, cuerpo: Self.cuerpo,
            fotoRelativa: "Fotos/x.jpg", fase: fase, intentos: 2, proximoIntento: Date(timeIntervalSinceReferenceDate: 50),
            ultimoError: "e", resultadoDeTexto: Self.resultado)
    }

    func testLaCapturaPendienteConservaSusClavesEnCadaFase() throws {
        let base =
            #"{"creadaEn":0,"cuerpo":{"category_id":3,"comercio":"c","fecha":"2026-01-02","monto":"1","nombre_de_archivo":"f.jpg","nota":"n","periodo":"2026-01","texto":"t"},"fase":FASE,"fotoRelativa":"Fotos/x.jpg","id":"00000000-0000-0000-0000-000000000001","intentos":2,"origen":"ios_photo","proximoIntento":50,"resultadoDeTexto":{"fusionado":true,"porRevisar":true,"repetido":false,"resumen":"r","terminadaEn":100,"transactionId":9},"ultimoError":"e"}"#
        let resultado =
            #"{"fusionado":true,"porRevisar":true,"repetido":false,"resumen":"r","terminadaEn":100,"transactionId":9}"#
        let fases: [(PendingCapture.Phase, String)] = [
            (.porEnviar, #"{"porEnviar":{}}"#),
            (.porSubirFoto(transactionId: 4), #"{"porSubirFoto":{"transactionId":4}}"#),
            (.esperandoSesion, #"{"esperandoSesion":{}}"#),
            (.hecha(Self.resultado), #"{"hecha":{"_0":RES}}"#.replacingOccurrences(of: "RES", with: resultado)),
            (.fallida(motivo: "m"), #"{"fallida":{"motivo":"m"}}"#),
        ]
        for (fase, clave) in fases {
            try idaYVuelta(pendiente(fase), base.replacingOccurrences(of: "FASE", with: clave))
        }
    }

    func testElArbolGuardadoConservaSusClaves() throws {
        let arbol = SavedTree(
            raices: [
                TreeNode(
                    id: 1, name: "A", parentId: nil, keywords: ["k"], isArchived: true, estatico: true,
                    children: [TreeNode(id: 2, name: "B", parentId: 1)])
            ],
            descargadoEn: Date(timeIntervalSinceReferenceDate: 7))
        try idaYVuelta(
            arbol,
            #"{"descargadoEn":7,"raices":[{"children":[{"estatico":false,"id":2,"is_archived":false,"name":"B","palabras_clave":[],"parent_id":1}],"estatico":true,"id":1,"is_archived":true,"name":"A","palabras_clave":["k"]}]}"#
        )
    }

    func testLosValoresQueSalenDeLaAppNoCambian() throws {
        XCTAssertEqual(CaptureSource.wallet.rawValue, "wallet")
        XCTAssertEqual(CaptureSource.sms.rawValue, "sms")
        XCTAssertEqual(CaptureSource.iosManual.rawValue, "ios_manual")
        XCTAssertEqual(CaptureSource.iosFoto.rawValue, "ios_photo")
        XCTAssertEqual(TreeLevel.centro.rawValue, "centro")
        XCTAssertEqual(TreeLevel.categoria.rawValue, "categoria")
        XCTAssertEqual(TreeLevel.concepto.rawValue, "concepto")
        XCTAssertEqual(KeychainKey.refreshToken.rawValue, "refresh_token")
    }

    func testElPerfilConservaSusClaves() throws {
        let perfil = PublicProfile(
            id: 7, email: "x@coco.invalid", displayName: "X", role: "owner", status: "active", createdAt: "2026")
        try idaYVuelta(
            perfil,
            #"{"created_at":"2026","display_name":"X","email":"x@coco.invalid","id":7,"role":"owner","status":"active"}"#
        )
    }

    func testLasRespuestasDeLaAPIConservanSusClaves() throws {
        let clasificacion = ProposedClassification(
            certeza: "alta", fuente: "f", conceptId: 1, categoryId: 2, nombre: "n",
            candidatos: [.init(id: 3, nombre: "c", ruta: "r")], motivo: "m")
        let claseJSON =
            #"{"candidatos":[{"id":3,"nombre":"c","ruta":"r"}],"categoria_id":2,"certeza":"alta","concepto_id":1,"fuente":"f","motivo":"m","nombre":"n"}"#
        try idaYVuelta(clasificacion, claseJSON)
        try idaYVuelta(
            Interpretation(
                amount: "1", date: "d", merchant: "m", description: "x", clasificacion: clasificacion, needsReview: true),
            #"{"amount":"1","clasificacion":CL,"date":"d","description":"x","merchant":"m","por_revisar":true}"#
                .replacingOccurrences(of: "CL", with: claseJSON))
        let transaccion = TransactionSummary(
            id: 1, date: "d", amount: "2", categoryId: 3, description: "x", merchant: "m", source: "sms",
            needsReview: false)
        let transJSON =
            #"{"amount":"2","category_id":3,"date":"d","description":"x","id":1,"merchant":"m","por_revisar":false,"source":"sms"}"#
        try idaYVuelta(transaccion, transJSON)
        try idaYVuelta(
            CaptureResponse(transaction: transaccion, clasificacion: clasificacion, resumen: "r", repetido: true, fusionado: false),
            #"{"clasificacion":CL,"fusionado":false,"repetido":true,"resumen":"r","transaction":TR}"#
                .replacingOccurrences(of: "CL", with: claseJSON).replacingOccurrences(of: "TR", with: transJSON))
        try idaYVuelta(
            Attachment(id: 1, orden: 2, fileName: "a", mimeType: "image/jpeg", tamano: 3, disponible: true),
            #"{"disponible":true,"id":1,"mime_type":"image/jpeg","nombre_archivo":"a","orden":2,"tamano":3}"#)
        let sesion = try JSONDecoder().decode(
            SessionResponse.self,
            from: Data(
                #"{"access_token":"a","expires_in":5,"refresh_token":"r","user":{"created_at":"c","display_name":null,"email":"e","id":1,"role":"owner","status":"active"}}"#
                    .utf8))
        XCTAssertEqual(sesion.accessToken, "a")
        XCTAssertEqual(sesion.expiresIn, 5)
        XCTAssertEqual(sesion.refreshToken, "r")
        XCTAssertEqual(sesion.user.createdAt, "c")
    }
}
