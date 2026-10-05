import XCTest
@testable import Coco

final class SesionNativaTests: XCTestCase {
    // El `user` tal cual lo manda la API, con claves en un orden que no es el
    // alfabético: si la sesión lo reescribiera, se notaría.
    private static let userJSON = #"{"id":7,"email":"ana@coco.co","display_name":null,"role":"owner","status":"active","created_at":"2026-01-01T00:00:00Z"}"#
    private static func sesionJSON(access: String, refresh: String?, expiresIn: Int = 3600) -> String {
        let refreshParte = refresh.map { #","refresh_token":"\#($0)""# } ?? ""
        return #"{"data":{"access_token":"\#(access)","expires_in":\#(expiresIn),"user":\#(userJSON)\#(refreshParte)},"meta":{}}"#
    }
    private static let perfil = PerfilPublico(id: 7, email: "ana@coco.co", display_name: nil, role: "owner", status: "active", created_at: "2026-01-01T00:00:00Z")

    /// Un reloj que las pruebas mueven a mano.
    private final class Reloj: @unchecked Sendable {
        private let cerrojo = NSLock()
        private var _ahora = Date(timeIntervalSince1970: 1_800_000_000)
        var ahora: Date {
            get { cerrojo.withLock { _ahora } }
            set { cerrojo.withLock { _ahora = newValue } }
        }
        func avanzar(_ s: TimeInterval) { ahora = ahora.addingTimeInterval(s) }
    }

    /// Apuntes en orden de lo que pasó: «red» cuando el transporte responde,
    /// «llavero:<valor>» cuando se escribe el refresh.
    private final class Bitacora: @unchecked Sendable {
        private let cerrojo = NSLock()
        private var _lineas: [String] = []
        var lineas: [String] { cerrojo.withLock { _lineas } }
        func anotar(_ l: String) { cerrojo.withLock { _lineas.append(l) } }
    }

    private final class TransporteAnotado: Transporte, @unchecked Sendable {
        let interno: TransporteFalso
        let bitacora: Bitacora
        init(_ interno: TransporteFalso, bitacora: Bitacora) { self.interno = interno; self.bitacora = bitacora }
        func datos(para peticion: URLRequest) async throws -> (Data, HTTPURLResponse) {
            // Un respiro para que las llamadas concurrentes lleguen mientras
            // esta sigue en vuelo.
            try await Task.sleep(for: .milliseconds(30))
            bitacora.anotar("red")
            return try await interno.datos(para: peticion)
        }
    }

    private final class LlaveroAnotado: Llavero, @unchecked Sendable {
        let interno: LlaveroEnMemoria
        let bitacora: Bitacora
        init(_ interno: LlaveroEnMemoria, bitacora: Bitacora) { self.interno = interno; self.bitacora = bitacora }
        func leer(_ clave: ClaveDelLlavero) throws -> String? { try interno.leer(clave) }
        func escribir(_ valor: String, en clave: ClaveDelLlavero) throws {
            bitacora.anotar("llavero:\(valor)")
            try interno.escribir(valor, en: clave)
        }
        func borrar(_ clave: ClaveDelLlavero) throws { try interno.borrar(clave) }
    }

    private struct Arnes {
        let transporte: TransporteFalso
        let llavero: LlaveroEnMemoria
        let reloj: Reloj
        let bitacora: Bitacora
        let sesion: SesionNativa
    }

    private func arnes(refresh: String? = "r0", respuestas: [TransporteFalso.Respuesta] = []) -> Arnes {
        let transporte = TransporteFalso(respuestas)
        let bitacora = Bitacora()
        let llavero = LlaveroEnMemoria(valores: refresh.map { [.refreshToken: $0] } ?? [:])
        let reloj = Reloj()
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = ClienteAPI(configuracion: ConfiguracionDeLaAPI(base: base), transporte: TransporteAnotado(transporte, bitacora: bitacora), version: "0.1.0")
        let sesion = SesionNativa(api: api, llavero: LlaveroAnotado(llavero, bitacora: bitacora), reloj: { reloj.ahora })
        return Arnes(transporte: transporte, llavero: llavero, reloj: reloj, bitacora: bitacora, sesion: sesion)
    }

    private func cuerpo(_ r: URLRequest) -> String {
        String(decoding: r.httpBody ?? Data(), as: UTF8.self)
    }

    private func rutas(_ t: TransporteFalso) -> [String] {
        t.recibidas.compactMap { $0.url?.path() }
    }

    // MARK: Single-flight y orden

    func testDiezLlamadasConcurrentesConElTokenVencidoHacenUnSoloRefresh() async throws {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let tokens = try await withThrowingTaskGroup(of: String.self) { grupo in
            for _ in 0..<10 { grupo.addTask { try await a.sesion.accessTokenVigente() } }
            var vistos: [String] = []
            for try await t in grupo { vistos.append(t) }
            return vistos
        }
        XCTAssertEqual(tokens, Array(repeating: "a1", count: 10))
        XCTAssertEqual(rutas(a.transporte), ["/api/v1/auth/refresh"])
    }

    func testElRefreshNuevoSeEscribeEnElLlaveroAntesDePublicarElAccess() async throws {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let access = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(access, "a1")
        // Al devolver, el llavero ya tiene el nuevo, y lo tuvo justo después
        // de que la red respondiera: no hay instante en que se use un access
        // cuyo refresh no esté guardado.
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r1")
        XCTAssertEqual(a.bitacora.lineas, ["red", "llavero:r1"])
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .activa(Self.perfil))
    }

    func testElRefreshVaEnElCuerpoConCabeceraNativa() async throws {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        _ = try await a.sesion.accessTokenVigente()
        let r = try XCTUnwrap(a.transporte.recibidas.first)
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(cuerpo(r), #"{"refresh_token":"r0"}"#)
        XCTAssertNil(r.value(forHTTPHeaderField: "Authorization"))
    }

    // MARK: Qué borra el llavero y qué no

    func testUn401EnElRefreshBorraElLlaveroYDejaSinSesion() async {
        let a = arnes(respuestas: [.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"La sesión expiró."}}"#)])
        do {
            _ = try await a.sesion.accessTokenVigente()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? ErrorDeSesion, .sinSesion)
        }
        XCTAssertNil(a.llavero.valores[.refreshToken])
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinSesion)
    }

    func testUnTimedOutReintentaUnaVezConElMismoRefreshYSiFallaConservaElLlavero() async {
        let a = arnes(respuestas: [.falla(URLError(.timedOut)), .falla(URLError(.networkConnectionLost))])
        do {
            _ = try await a.sesion.accessTokenVigente()
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? ErrorDeSesion, .sinConexion)
        }
        XCTAssertEqual(rutas(a.transporte), ["/api/v1/auth/refresh", "/api/v1/auth/refresh"])
        XCTAssertEqual(a.transporte.recibidas.map(cuerpo), [#"{"refresh_token":"r0"}"#, #"{"refresh_token":"r0"}"#])
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r0", "un fallo de red nunca borra el Keychain")
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinConexion(ultima: nil))
    }

    func testSiElReintentoResponde200LaSesionSigue() async throws {
        let a = arnes(respuestas: [.falla(URLError(.notConnectedToInternet)), .http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let access = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transporte.recibidas.count, 2)
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r1")
    }

    func testSinConexionConservaElUltimoPerfil() async throws {
        let a = arnes(respuestas: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 300)),
            .falla(URLError(.timedOut)), .falla(URLError(.timedOut)),
        ])
        _ = try await a.sesion.accessTokenVigente()
        a.reloj.avanzar(250) // quedan 50 s: hay que renovar
        _ = try? await a.sesion.accessTokenVigente()
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinConexion(ultima: Self.perfil))
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r1")
    }

    func testRestaurarSinRefreshNoLlamaALaRed() async {
        let a = arnes(refresh: nil)
        await a.sesion.restaurar()
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinSesion)
        XCTAssertTrue(a.transporte.recibidas.isEmpty)
    }

    func testRestaurarConRefreshRenueva() async {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        await a.sesion.restaurar()
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .activa(Self.perfil))
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r1")
    }

    // MARK: Login

    func testEntrarMandaCabeceraNativaYGuardaElRefresh() async throws {
        let a = arnes(refresh: nil, respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let perfil = try await a.sesion.entrar(correo: "ana@coco.co", contrasena: "secreta")
        XCTAssertEqual(perfil, Self.perfil)
        let r = try XCTUnwrap(a.transporte.recibidas.first)
        XCTAssertEqual(r.url?.path(), "/api/v1/auth/login")
        XCTAssertEqual(r.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(cuerpo(r), #"{"email":"ana@coco.co","password":"secreta"}"#)
        XCTAssertEqual(a.llavero.valores[.refreshToken], "r1")
        XCTAssertEqual(a.llavero.escrituras.map(\.1), ["r1"])
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .activa(Self.perfil))
        // Y el access ya sirve sin tocar la red otra vez.
        let access = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(access, "a1")
        XCTAssertEqual(a.transporte.recibidas.count, 1)
    }

    func testEntrarConCredencialesMalasNoTocaElLlavero() async {
        let a = arnes(refresh: nil, respuestas: [.http(401, #"{"error":{"code":"NO_AUTENTICADO","message":"Credenciales inválidas."}}"#)])
        do {
            _ = try await a.sesion.entrar(correo: "ana@coco.co", contrasena: "mal")
            XCTFail("tenía que fallar")
        } catch {
            XCTAssertEqual(error as? ErrorDeAPI, .noAutenticado)
        }
        XCTAssertTrue(a.llavero.escrituras.isEmpty)
    }

    func testLasPeticionesQueNoSonDeAuthNoLlevanLaCabeceraNativa() async throws {
        let a = arnes(respuestas: [.http(200, #"{"data":[],"meta":{}}"#)])
        let base = URL(string: "https://api.coco.invalid") ?? URL(fileURLWithPath: "/")
        let api = ClienteAPI(configuracion: ConfiguracionDeLaAPI(base: base), transporte: a.transporte, version: "0.1.0")
        let _: [NodoDelArbol] = try await api.enviar(ConstructorDePeticiones.categorias(), token: "a1")
        let r = try XCTUnwrap(a.transporte.recibidas.first)
        XCTAssertNil(r.value(forHTTPHeaderField: "X-Coco-Cliente"))
        XCTAssertEqual(r.value(forHTTPHeaderField: "Authorization"), "Bearer a1")
    }

    // MARK: Para la web

    func testSesionParaLaWebNoLlevaRefreshYElUserEsByteAByteElQueLlego() async throws {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 3600))])
        _ = try await a.sesion.accessTokenVigente()
        a.reloj.avanzar(1000)
        let s = try await a.sesion.sesionParaLaWeb()
        XCTAssertEqual(s.accessToken, "a1")
        XCTAssertEqual(s.expiresIn, 2600)
        XCTAssertGreaterThanOrEqual(s.expiresIn, 120)
        XCTAssertEqual(s.userJSON, Data(Self.userJSON.utf8))
        let dic = try s.comoDiccionario()
        XCTAssertNil(dic["refresh_token"])
        XCTAssertEqual(Set(dic.keys), ["access_token", "expires_in", "user"])
        XCTAssertEqual((dic["user"] as? [String: Any])?["created_at"] as? String, "2026-01-01T00:00:00Z")
        XCTAssertEqual(a.transporte.recibidas.count, 1)
    }

    // MARK: Margen

    func testConCienSegundosRestantesRenuevaYConCientoTreintaNo() async throws {
        let a = arnes(respuestas: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1", expiresIn: 3600)),
            .http(200, Self.sesionJSON(access: "a2", refresh: "r2", expiresIn: 3600)),
        ])
        _ = try await a.sesion.accessTokenVigente()
        a.reloj.avanzar(3470) // quedan 130
        let sigue = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(sigue, "a1")
        XCTAssertEqual(a.transporte.recibidas.count, 1)
        a.reloj.avanzar(30) // quedan 100
        let nuevo = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(nuevo, "a2")
        XCTAssertEqual(a.transporte.recibidas.count, 2)
        XCTAssertEqual(cuerpo(a.transporte.recibidas[1]), #"{"refresh_token":"r1"}"#)
    }

    func testRenovarAhoraRenuevaAunqueElTokenParezcaVigente() async throws {
        let a = arnes(respuestas: [
            .http(200, Self.sesionJSON(access: "a1", refresh: "r1")),
            .http(200, Self.sesionJSON(access: "a2", refresh: "r2")),
        ])
        _ = try await a.sesion.accessTokenVigente()
        try await a.sesion.renovarAhora()
        let access = try await a.sesion.accessTokenVigente()
        XCTAssertEqual(access, "a2")
        XCTAssertEqual(a.transporte.recibidas.count, 2)
    }

    // MARK: Salir

    func testSalirLlamaALogoutConElRefreshYBorraElLlaveroAunqueLaRedFalle() async {
        let a = arnes(respuestas: [.falla(URLError(.notConnectedToInternet))])
        await a.sesion.salir()
        let r = a.transporte.recibidas.first
        XCTAssertEqual(r?.url?.path(), "/api/v1/auth/logout")
        XCTAssertEqual(r?.value(forHTTPHeaderField: "X-Coco-Cliente"), "nativo")
        XCTAssertEqual(r.map(cuerpo), #"{"refresh_token":"r0"}"#)
        XCTAssertNil(a.llavero.valores[.refreshToken])
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinSesion)
    }

    func testDescartarNoLlamaANadaYBorraElLlavero() async {
        let a = arnes()
        await a.sesion.descartar()
        XCTAssertTrue(a.transporte.recibidas.isEmpty)
        XCTAssertNil(a.llavero.valores[.refreshToken])
        let estado = await a.sesion.estado
        XCTAssertEqual(estado, .sinSesion)
    }

    func testLosCambiosDeEstadoSePublican() async throws {
        let a = arnes(respuestas: [.http(200, Self.sesionJSON(access: "a1", refresh: "r1"))])
        let recogida = Task { () -> [EstadoDeSesion] in
            var vistos: [EstadoDeSesion] = []
            for await e in a.sesion.cambios {
                vistos.append(e)
                if vistos.count == 2 { break }
            }
            return vistos
        }
        await a.sesion.restaurar()
        await a.sesion.descartar()
        let vistos = await recogida.value
        XCTAssertEqual(vistos, [.activa(Self.perfil), .sinSesion])
    }

    // MARK: El recorte del JSON

    func testRecorteDeJSONRespetaCadenasConLlaves() {
        let json = #"{"meta":{"user":{"no":"este"}},"data":{"nota":"} {","user":{"a":"{\"x\":1}","b":[1,{"c":2}]},"otro":{}}}"#
        let crudo = RecorteDeJSON.objeto(clave: "user", dentroDe: "data", en: Data(json.utf8))
        XCTAssertEqual(crudo.map { String(decoding: $0, as: UTF8.self) }, #"{"a":"{\"x\":1}","b":[1,{"c":2}]}"#)
    }
}
