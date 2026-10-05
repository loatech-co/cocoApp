import Foundation

/// Cuándo y con qué palabras avisar de que la instalación caduca.
enum AvisoDeVencimiento {
    /// La víspera a las 09:00 locales; si faltan menos de 24 h, en un minuto;
    /// si ya venció, nil (eso se dice con un cartel, no con un aviso).
    static func momentoDelAviso(vence: Date, ahora: Date, calendario: Calendar = .current) -> Date? {
        guard vence > ahora else { return nil }
        let enUnMinuto = ahora.addingTimeInterval(60)
        guard vence.timeIntervalSince(ahora) >= 24 * 3600 else { return enUnMinuto }
        guard let vispera = calendario.date(byAdding: .day, value: -1, to: vence),
              let alasNueve = calendario.date(bySettingHour: 9, minute: 0, second: 0, of: vispera)
        else { return enUnMinuto }
        // La víspera a las 09:00 puede haber pasado ya (vence mañana de
        // madrugada): entonces no se espera.
        return alasNueve > ahora ? alasNueve : enUnMinuto
    }

    static func texto(vence: Date, ahora: Date) -> (titulo: String, cuerpo: String) {
        let dias = diasRestantes(vence: vence, ahora: ahora)
        let cuando: String
        switch dias {
        case ..<0: cuando = "ya caducó"
        case 0: cuando = "caduca hoy"
        case 1: cuando = "caduca mañana"
        default: cuando = "caduca en \(dias) días"
        }
        return ("Tu instalación de Coco \(cuando)", "Vuelve a instalarla desde Xcode con el cable.")
    }

    /// Días de calendario entre hoy y el día del vencimiento: a las 23:50 con
    /// vencimiento a las 00:30 queda 1, no 0.
    static func diasRestantes(vence: Date, ahora: Date, calendario: Calendar = .current) -> Int {
        let inicio = calendario.startOfDay(for: ahora)
        let fin = calendario.startOfDay(for: vence)
        return calendario.dateComponents([.day], from: inicio, to: fin).day ?? 0
    }
}
