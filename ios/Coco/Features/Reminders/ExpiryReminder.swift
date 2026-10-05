import Foundation

/// Cuándo y con qué palabras avisar de que la instalación caduca.
enum ExpiryReminder {
    /// La víspera a las 09:00 locales; si faltan menos de 24 h, en un minuto;
    /// si ya venció, nil (eso se dice con un cartel, no con un aviso).
    static func momentoDelAviso(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Date? {
        guard expiresAt > now else { return nil }
        let enUnMinuto = now.addingTimeInterval(60)
        guard expiresAt.timeIntervalSince(now) >= 24 * 3600 else { return enUnMinuto }
        guard let vispera = calendar.date(byAdding: .day, value: -1, to: expiresAt),
            let alasNueve = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: vispera)
        else { return enUnMinuto }
        // La víspera a las 09:00 puede haber pasado ya (vence mañana de
        // madrugada): entonces no se espera.
        return alasNueve > now ? alasNueve : enUnMinuto
    }

    static func text(expiresAt: Date, now: Date) -> (title: String, body: String) {
        let dias = diasRestantes(expiresAt: expiresAt, now: now)
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
    static func diasRestantes(expiresAt: Date, now: Date, calendar: Calendar = .current) -> Int {
        let inicio = calendar.startOfDay(for: now)
        let fin = calendar.startOfDay(for: expiresAt)
        return calendar.dateComponents([.day], from: inicio, to: fin).day ?? 0
    }
}
