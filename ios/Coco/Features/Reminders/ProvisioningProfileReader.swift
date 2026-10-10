import Foundation

/// Reads the expiry date of the embedded provisioning profile. With
/// a free personal team the certificate lasts 7 days; knowing it is what
/// makes it possible to warn a day in advance.
enum ProvisioningProfileReader {
    /// The .mobileprovision is a CMS with an XML plist inside: it is cut from
    /// `<?xml` to `</plist>` without touching the signature.
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

    /// In the simulator there is no profile: nil, without an error.
    static func fromBundle(_ bundle: Bundle = .main) -> Date? {
        guard let url = bundle.url(forResource: "embedded", withExtension: "mobileprovision"),
            let data = try? Data(contentsOf: url)
        else { return nil }
        return expirationDate(in: data)
    }
}
