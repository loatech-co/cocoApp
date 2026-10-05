import XCTest

@testable import Coco

final class FormPrefillTests: XCTestCase {
    private func interpretation(
        amount: String? = "45000", date: String? = "2026-10-03", merchant: String? = "D1", confidence: String = "alta",
        conceptId: Int? = 100, candidates: [ProposedClassification.Candidate] = []
    ) -> Interpretation {
        Interpretation(
            amount: amount, date: date, merchant: merchant, description: nil,
            classification: ProposedClassification(
                confidence: confidence, source: nil, conceptId: conceptId, categoryId: 10, name: "Colegio",
                candidates: candidates, reason: ""),
            needsReview: false
        )
    }

    func testFillsTheBlanksAndMarksTheConceptAsSuggested() {
        let r = FormPrefill.apply(interpretation(), to: FormFields())
        XCTAssertEqual(
            r.fields, FormFields(amount: "45.000", date: "2026-10-03", merchant: "D1", conceptId: 100))
        XCTAssertTrue(r.isConceptSuggested)
        XCTAssertTrue(r.candidates.isEmpty)
    }

    func testDoesNotOverwriteWhatThePersonAlreadyTyped() {
        let before = FormFields(amount: "12.500", date: "2026-10-01", merchant: "Éxito", conceptId: 7)
        let r = FormPrefill.apply(interpretation(), to: before)
        XCTAssertEqual(r.fields, before)
        XCTAssertFalse(r.isConceptSuggested)
    }

    func testMediumConfidenceDoesNotChooseAndReturnsTheCandidates() {
        let candidates = [
            ProposedClassification.Candidate(id: 100, name: "Colegio", path: "Costos fijos › Educación › Colegio")
        ]
        let r = FormPrefill.apply(
            interpretation(confidence: "media", conceptId: nil, candidates: candidates), to: FormFields())
        XCTAssertNil(r.fields.conceptId)
        XCTAssertFalse(r.isConceptSuggested)
        XCTAssertEqual(r.candidates, candidates)
    }

    func testAnUnreadableAmountDoesNotGoIn() {
        let r = FormPrefill.apply(interpretation(amount: "abc"), to: FormFields())
        XCTAssertEqual(r.fields.amount, "")
    }
}
