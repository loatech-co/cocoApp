import Foundation

/// Lee la fecha de vencimiento del perfil de aprovisionamiento embebido. Con
/// un equipo personal gratuito el certificado dura 7 días; saberlo es lo que
/// permite avisar un día antes.
enum ProvisioningProfileReader {
    /// El .mobileprovision es un CMS con un plist XML dentro: se recorta de
    /// `<?xml` a `</plist>` sin tocar la firma.
    static func fechaDeVencimiento(en datos: Data) -> Date? {
        guard let inicio = datos.range(of: Data("<?xml".utf8)),
            let fin = datos.range(of: Data("</plist>".utf8), in: inicio.lowerBound..<datos.endIndex)
        else { return nil }
        let plist = datos[inicio.lowerBound..<fin.upperBound]
        guard let objeto = try? PropertyListSerialization.propertyList(from: plist, format: nil),
            let dict = objeto as? [String: Any]
        else { return nil }
        return dict["ExpirationDate"] as? Date
    }

    /// En el simulador no hay perfil: nil, sin error.
    static func delBundle(_ bundle: Bundle = .main) -> Date? {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
            let datos = try? Data(contentsOf: url)
        else { return nil }
        return fechaDeVencimiento(en: datos)
    }
}
