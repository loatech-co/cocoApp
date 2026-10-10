import Foundation

/// What the person already has written in the form, reduced to what the
/// interpretation can touch. A nil `date` means «has not changed it»:
/// the field is never empty —it starts at today—, but today is not a decision.
struct FormFields: Equatable, Sendable {
    var amount: String = ""
    var date: String?
    var merchant: String?
    var conceptId: Int?
}

/// How an `Interpretation` from the API enters the form: it fills what is
/// EMPTY and overwrites nothing. The person may have typed the amount while the photo
/// was being read, and what they typed by hand is worth more than what a machine read.
enum FormPrefill {
    struct Outcome: Equatable, Sendable {
        var fields: FormFields
        /// The concept came from the interpretation: it is shown as «sugerido»
        /// so that it is reviewed before confirming.
        var isConceptSuggested: Bool
        /// With medium confidence the API does not dare: the search opens with
        /// these on top and the person decides.
        var candidates: [ProposedClassification.Candidate]
    }

    static func apply(_ i: Interpretation, to fields: FormFields) -> Outcome {
        var output = fields
        var suggested = false
        var candidates: [ProposedClassification.Candidate] = []

        if isBlank(fields.amount), let amount = i.amount, AmountParser.normalize(amount) != nil {
            // It is shown as it is written in Colombia —«45.000»—, which is what
            // `AmountParser` reads again when confirming.
            output.amount = String(PesoFormat.format(amount).dropFirst())
        }
        if fields.date == nil, let date = i.date, !date.isEmpty {
            output.date = date
        }
        if isBlank(fields.merchant), let merchant = i.merchant, !isBlank(merchant) {
            output.merchant = merchant
        }
        if fields.conceptId == nil {
            let c = i.classification
            switch c.confidence {
            case "high":
                if let id = c.conceptId ?? c.categoryId {
                    output.conceptId = id
                    suggested = true
                }
            case "medium":
                candidates = c.candidates
            default:
                break
            }
        }
        return Outcome(fields: output, isConceptSuggested: suggested, candidates: candidates)
    }

    private static func isBlank(_ s: String?) -> Bool {
        (s ?? "").trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
}
