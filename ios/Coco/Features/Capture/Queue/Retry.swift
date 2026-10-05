import Foundation

/// Cuánto esperar antes del siguiente intento: espera creciente con tope y un
/// poco de azar, para que cien teléfonos que perdieron la red a la vez no
/// vuelvan a golpear la API en el mismo segundo.
struct Retry: Sendable {
    var base: Duration = .seconds(5)
    var limit: Duration = .seconds(3600)
    /// Fracción de variación: 0.2 es ±20 %.
    var jitter: Double = 0.2

    /// `min(base·2^intento, tope) · (1 ± jitter)`. `azar` en 0...1; con 0.5 la
    /// espera es exacta (así se prueba sin aleatoriedad).
    func delay(attempt: Int, random: Double = .random(in: 0...1)) -> Duration {
        let exponent = max(0, min(attempt, 30))
        let raw = base * Double(1 << exponent)
        let capped = raw < limit ? raw : limit
        let factor = 1 + jitter * (2 * random - 1)
        return capped * factor
    }
}

extension Duration {
    fileprivate static func * (d: Duration, f: Double) -> Duration {
        let seconds = Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
        return .seconds(seconds * f)
    }
}
