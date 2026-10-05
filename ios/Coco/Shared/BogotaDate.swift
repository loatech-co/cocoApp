import Foundation

/// Las fechas de un gasto se escriben en el día de Bogotá, no en el del
/// simulador ni en UTC: un pago a las 23:30 del día 3 es del día 3.
enum BogotaDate {
    static let zona = TimeZone(identifier: "America/Bogota") ?? TimeZone(secondsFromGMT: -5 * 3600) ?? .current

    /// `YYYY-MM-DD` en America/Bogota.
    static func dia(_ instante: Date, calendario: Calendar = .init(identifier: .gregorian)) -> String {
        let partes = componentes(instante, calendario: calendario)
        return String(format: "%04d-%02d-%02d", partes.year ?? 0, partes.month ?? 0, partes.day ?? 0)
    }

    /// `YYYY-MM` en America/Bogota.
    static func mes(_ instante: Date, calendario: Calendar = .init(identifier: .gregorian)) -> String {
        let partes = componentes(instante, calendario: calendario)
        return String(format: "%04d-%02d", partes.year ?? 0, partes.month ?? 0)
    }

    private static func componentes(_ instante: Date, calendario: Calendar) -> DateComponents {
        var cal = calendario
        cal.timeZone = zona
        return cal.dateComponents([.year, .month, .day], from: instante)
    }
}
