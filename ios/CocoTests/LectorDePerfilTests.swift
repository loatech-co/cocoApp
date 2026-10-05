import XCTest
@testable import Coco

final class LectorDePerfilTests: XCTestCase {
    private func perfil(con plist: String) -> Data {
        var d = Data([0x30, 0x82, 0x0A, 0x00, 0x06, 0x09, 0xFF, 0x00])
        d.append(Data(plist.utf8))
        d.append(Data([0x00, 0x01, 0x02, 0xAB, 0xCD]))
        return d
    }

    func testSacaLaFechaDeUnPerfilSintetico() throws {
        let plist = """
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0"><dict>
          <key>Name</key><string>iOS Team Provisioning Profile: co.loatech.coco</string>
          <key>ExpirationDate</key><date>2026-10-12T15:30:00Z</date>
        </dict></plist>
        """
        let fecha = try XCTUnwrap(LectorDePerfil.fechaDeVencimiento(en: perfil(con: plist)))
        XCTAssertEqual(fecha, ISO8601DateFormatter().date(from: "2026-10-12T15:30:00Z"))
    }

    func testSinPlistNil() {
        XCTAssertNil(LectorDePerfil.fechaDeVencimiento(en: Data([0x30, 0x82, 0x00])))
        XCTAssertNil(LectorDePerfil.fechaDeVencimiento(en: Data()))
    }

    func testPlistSinExpirationDateNil() {
        let plist = #"<?xml version="1.0"?><plist version="1.0"><dict><key>Name</key><string>x</string></dict></plist>"#
        XCTAssertNil(LectorDePerfil.fechaDeVencimiento(en: perfil(con: plist)))
    }

    func testEnElSimuladorNoHayPerfilYNoFalla() {
        #if targetEnvironment(simulator)
        XCTAssertNil(LectorDePerfil.delBundle(.main))
        #endif
    }
}
