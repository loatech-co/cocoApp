import XCTest

@testable import Coco

final class ProvisioningProfileReaderTests: XCTestCase {
    private func profile(with plist: String) -> Data {
        var d = Data([0x30, 0x82, 0x0A, 0x00, 0x06, 0x09, 0xFF, 0x00])
        d.append(Data(plist.utf8))
        d.append(Data([0x00, 0x01, 0x02, 0xAB, 0xCD]))
        return d
    }

    func testReadsTheDateFromASyntheticProfile() throws {
        let plist = """
            <?xml version="1.0" encoding="UTF-8"?>
            <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
            <plist version="1.0"><dict>
              <key>Name</key><string>iOS Team Provisioning Profile: co.loatech.coco</string>
              <key>ExpirationDate</key><date>2026-10-12T15:30:00Z</date>
            </dict></plist>
            """
        let date = try XCTUnwrap(ProvisioningProfileReader.expirationDate(in: profile(with: plist)))
        XCTAssertEqual(date, ISO8601DateFormatter().date(from: "2026-10-12T15:30:00Z"))
    }

    func testWithoutPlistIsNil() {
        XCTAssertNil(ProvisioningProfileReader.expirationDate(in: Data([0x30, 0x82, 0x00])))
        XCTAssertNil(ProvisioningProfileReader.expirationDate(in: Data()))
    }

    func testPlistWithoutExpirationDateIsNil() {
        let plist = #"<?xml version="1.0"?><plist version="1.0"><dict><key>Name</key><string>x</string></dict></plist>"#
        XCTAssertNil(ProvisioningProfileReader.expirationDate(in: profile(with: plist)))
    }

    func testInTheSimulatorThereIsNoProfileAndItDoesNotFail() {
        #if targetEnvironment(simulator)
            XCTAssertNil(ProvisioningProfileReader.fromBundle(.main))
        #endif
    }
}
