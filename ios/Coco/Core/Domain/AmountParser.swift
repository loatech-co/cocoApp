import Foundation

/// Convierte lo que Atajos entrega como texto de moneda («$45.000», «COP
/// 1.200.000», «45,5») al formato del DTO: `^\d+([.,]\d{1,2})?$`, con punto
/// decimal. Lo que no se entiende devuelve nil: mejor una captura sin monto
/// —queda por revisar— que una con el monto equivocado.
enum AmountParser {
    static func normalizar(_ texto: String?) -> String? {
        guard let texto else { return nil }
        // Solo cuentan dígitos y separadores; el símbolo, el código y los
        // espacios son decoración.
        let limpio = texto.filter { $0.isNumber || $0 == "." || $0 == "," }
        guard limpio.contains(where: \.isNumber) else { return nil }

        let grupos = limpio.split(omittingEmptySubsequences: false) { $0 == "." || $0 == "," }.map(String.init)
        let separadores = limpio.filter { $0 == "." || $0 == "," }
        guard grupos.allSatisfy({ !$0.isEmpty }) else { return nil }

        var entero = ""
        var decimal: String? = nil

        switch separadores.count {
        case 0:
            entero = grupos[0]
        case 1:
            let ultimo = grupos[1]
            if ultimo.count == 3 {
                // «45.000» y «1,200»: un solo separador con tres cifras detrás
                // es de miles en los dos idiomas.
                entero = grupos[0] + ultimo
            } else if (1...2).contains(ultimo.count) {
                entero = grupos[0]
                decimal = ultimo
            } else {
                return nil
            }
        default:
            let primero = separadores.first
            let ultimo = separadores.last
            if primero == ultimo {
                // «1.200.000»: el mismo separador repetido solo puede ser de miles.
                guard grupos.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                entero = grupos.joined()
            } else {
                // Dos separadores distintos: el último es el decimal
                // («45.000,50», «1,200.50»).
                guard let cola = grupos.last, (1...2).contains(cola.count) else { return nil }
                let miles = grupos.dropLast()
                guard miles.dropFirst().allSatisfy({ $0.count == 3 }) else { return nil }
                // Un separador de miles no puede aparecer después del decimal.
                guard separadores.dropLast().allSatisfy({ $0 == primero }) else { return nil }
                entero = miles.joined()
                decimal = cola
            }
        }

        guard entero.allSatisfy(\.isNumber), !entero.isEmpty else { return nil }
        let sinCeros = String(entero.drop(while: { $0 == "0" }))
        let base = sinCeros.isEmpty ? "0" : sinCeros
        if let decimal { return "\(base).\(decimal)" }
        return base
    }
}
