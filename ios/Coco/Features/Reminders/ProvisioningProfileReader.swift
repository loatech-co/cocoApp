import Foundation

/// Lee la fecha de vencimiento del perfil de aprovisionamiento embebido. Con
/// un equipo personal gratuito el certificado dura 7 días; saberlo es lo que
/// permite avisar un día antes.
enum ProvisioningProfileReader {
    /// El .mobileprovision es un CMS con un plist XML dentro: se recorta de
    /// `<?xml` a `</plist>` sin tocar la firma.
    static func expirationDate(in data: Data) -> Date? {
        guard let start = data.range(of: Data("<?xml".utf8)),
            let end = data.range(of: Data("</plist>".utf8), in: start.lowerBound..<data.endIndex)
        else { return nil }
        let plist = data[start.lowerBound..<end.upperBound]
        guard let object = try? PropertyListSerialization.propertyList(from: plist, format: nil),
            let dict = object as? [String: Any]
        else { return nil }
        return dict["ExpirationDate"] as? Date
    }

    /// En el simulador no hay perfil: nil, sin error.
    static func fromBundle(_ bundle: Bundle = .main) -> Date? {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
            let data = try? Data(contentsOf: url)
        else { return nil }
        return expirationDate(in: data)
    }
}
