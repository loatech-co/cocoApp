import Foundation

/// Cuánto esperar antes del siguiente intento: espera creciente con tope y un
/// poco de azar, para que cien teléfonos que perdieron la red a la vez no
/// vuelvan a golpear la API en el mismo segundo.
struct Reintento: Sendable {
    var base: Duration = .seconds(5)
    var tope: Duration = .seconds(3600)
    /// Fracción de variación: 0.2 es ±20 %.
    var jitter: Double = 0.2

    /// `min(base·2^intento, tope) · (1 ± jitter)`. `azar` en 0...1; con 0.5 la
    /// espera es exacta (así se prueba sin aleatoriedad).
    func espera(intento: Int, azar: Double = .random(in: 0...1)) -> Duration {
        let exponente = max(0, min(intento, 30))
        let crudo = base * Double(1 << exponente)
        let acotado = crudo < tope ? crudo : tope
        let factor = 1 + jitter * (2 * azar - 1)
        return acotado * factor
    }
}

private extension Duration {
    static func * (d: Duration, f: Double) -> Duration {
        let segundos = Double(d.components.seconds) + Double(d.components.attoseconds) / 1e18
        return .seconds(segundos * f)
    }
}
