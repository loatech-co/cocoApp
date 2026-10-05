import XCTest

@testable import Coco

final class FormPrefillTests: XCTestCase {
    private func interpretacion(
        amount: String? = "45000", date: String? = "2026-10-03", merchant: String? = "D1", confidence: String = "alta",
        conceptoId: Int? = 100, candidates: [ProposedClassification.Candidate] = []
    ) -> Interpretation {
        Interpretation(
            amount: amount, date: date, merchant: merchant, description: nil,
            classification: ProposedClassification(
                confidence: confidence, source: nil, conceptId: conceptoId, categoryId: 10, name: "Colegio",
                candidates: candidates, reason: ""),
            needsReview: false
        )
    }

    func testRellenaLoVacioYMarcaElConceptoComoSugerido() {
        let r = FormPrefill.aplicar(interpretacion(), to: FormFields())
        XCTAssertEqual(
            r.campos, FormFields(amount: "45.000", date: "2026-10-03", merchant: "D1", conceptoId: 100))
        XCTAssertTrue(r.conceptoSugerido)
        XCTAssertTrue(r.candidates.isEmpty)
    }

    func testNoPisaLoQueLaPersonaYaEscribio() {
        let antes = FormFields(amount: "12.500", date: "2026-10-01", merchant: "Éxito", conceptoId: 7)
        let r = FormPrefill.aplicar(interpretacion(), to: antes)
        XCTAssertEqual(r.campos, antes)
        XCTAssertFalse(r.conceptoSugerido)
    }

    func testConCertezaMediaNoEligeYDevuelveLosCandidatos() {
        let candidates = [
            ProposedClassification.Candidate(id: 100, name: "Colegio", path: "Costos fijos › Educación › Colegio")
        ]
        let r = FormPrefill.aplicar(
            interpretacion(confidence: "media", conceptoId: nil, candidates: candidates), to: FormFields())
        XCTAssertNil(r.campos.conceptoId)
        XCTAssertFalse(r.conceptoSugerido)
        XCTAssertEqual(r.candidates, candidates)
    }

    func testUnMontoIlegibleNoEntra() {
        let r = FormPrefill.aplicar(interpretacion(amount: "abc"), to: FormFields())
        XCTAssertEqual(r.campos.amount, "")
    }
}
