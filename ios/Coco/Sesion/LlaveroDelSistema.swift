import Foundation
import Security

enum ErrorDelLlavero: Error, Equatable {
    case sistema(OSStatus)
    case valorIlegible
}

/// El Keychain de iOS. `kSecClassGenericPassword`, servicio `co.loatech.coco`,
/// cuenta = la clave. `AfterFirstUnlockThisDeviceOnly`: un App Intent puede
/// leerlo con el teléfono bloqueado (tras el primer desbloqueo desde el
/// arranque) y el token nunca viaja en una copia de seguridad ni a otro
/// dispositivo.
struct LlaveroDelSistema: Llavero {
    let servicio: String

    init(servicio: String = "co.loatech.coco") {
        self.servicio = servicio
    }

    func leer(_ clave: ClaveDelLlavero) throws -> String? {
        var consulta = base(clave)
        consulta[kSecReturnData as String] = true
        consulta[kSecMatchLimit as String] = kSecMatchLimitOne
        var resultado: CFTypeRef?
        let estado = SecItemCopyMatching(consulta as CFDictionary, &resultado)
        switch estado {
        case errSecSuccess:
            guard let datos = resultado as? Data, let texto = String(data: datos, encoding: .utf8) else {
                throw ErrorDelLlavero.valorIlegible
            }
            return texto
        case errSecItemNotFound:
            return nil
        default:
            throw ErrorDelLlavero.sistema(estado)
        }
    }

    func escribir(_ valor: String, en clave: ClaveDelLlavero) throws {
        let datos = Data(valor.utf8)
        // Primero actualizar: es el caso corriente (cada renovación rota el
        // refresh). Solo si no existe se añade.
        let cambios: [String: Any] = [
            kSecValueData as String: datos,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly,
        ]
        let actualizado = SecItemUpdate(base(clave) as CFDictionary, cambios as CFDictionary)
        if actualizado == errSecSuccess { return }
        guard actualizado == errSecItemNotFound else { throw ErrorDelLlavero.sistema(actualizado) }
        var nuevo = base(clave)
        nuevo.merge(cambios) { _, reciente in reciente }
        let anadido = SecItemAdd(nuevo as CFDictionary, nil)
        guard anadido == errSecSuccess else { throw ErrorDelLlavero.sistema(anadido) }
    }

    func borrar(_ clave: ClaveDelLlavero) throws {
        let estado = SecItemDelete(base(clave) as CFDictionary)
        // Borrar lo que no está no es un error: es el estado que se quería.
        guard estado == errSecSuccess || estado == errSecItemNotFound else {
            throw ErrorDelLlavero.sistema(estado)
        }
    }

    private func base(_ clave: ClaveDelLlavero) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: servicio,
            kSecAttrAccount as String: clave.rawValue,
        ]
    }
}

/// El nombre que usa el plan de la fase; el del diseño es `LlaveroDelSistema`.
typealias LlaveroDeKeychain = LlaveroDelSistema
