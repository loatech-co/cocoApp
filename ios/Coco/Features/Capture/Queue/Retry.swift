import Foundation

/// How long to wait before the next attempt: a growing wait with a cap and a
/// bit of randomness, so that a hundred phones that lost the network at once do not
/// hit the API again in the same second.
struct Retry: Sendable {
    var base: Duration = .seconds(5)
    var limit: Duration = .seconds(3600)
    /// Variation fraction: 0.2 is ±20 %.
    var jitter: Double = 0.2

    /// `min(base·2^attempt, limit) · (1 ± jitter)`. `random` in 0...1; with 0.5 the
    /// wait is exact (that is how it is tested without randomness).
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
