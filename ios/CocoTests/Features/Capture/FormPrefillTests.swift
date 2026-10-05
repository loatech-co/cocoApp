import XCTest

@testable import Coco

final class FormPrefillTests: XCTestCase {
    private func interpretacion(
        amount: String? = "45000", date: String? = "2026-10-03", merchant: String? = "D1", certeza: String = "alta",
        conceptoId: Int? = 100, candidatos: [ProposedClassification.Candidate] = []
    ) -> Interpretation {
        Interpretation(
            amount: amount, date: date, merchant: merchant, description: nil,
            clasificacion: ProposedClassification(
                certeza: certeza, fuente: nil, conceptId: conceptoId, categoryId: 10, nombre: "Colegio",
                candidatos: candidatos, motivo: ""),
            needsReview: false
        )
    }

    func testRellenaLoVacioYMarcaElConceptoComoSugerido() {
        let r = FormPrefill.aplicar(interpretacion(), a: FormFields())
        XCTAssertEqual(
            r.campos, FormFields(monto: "45.000", fecha: "2026-10-03", comercio: "D1", conceptoId: 100))
        XCTAssertTrue(r.conceptoSugerido)
        XCTAssertTrue(r.candidatos.isEmpty)
    }

    func testNoPisaLoQueLaPersonaYaEscribio() {
        let antes = FormFields(monto: "12.500", fecha: "2026-10-01", comercio: "Éxito", conceptoId: 7)
        let r = FormPrefill.aplicar(interpretacion(), a: antes)
        XCTAssertEqual(r.campos, antes)
        XCTAssertFalse(r.conceptoSugerido)
    }

    func testConCertezaMediaNoEligeYDevuelveLosCandidatos() {
        let candidatos = [
            ProposedClassification.Candidate(id: 100, nombre: "Colegio", ruta: "Costos fijos › Educación › Colegio")
        ]
        let r = FormPrefill.aplicar(
            interpretacion(certeza: "media", conceptoId: nil, candidatos: candidatos), a: FormFields())
        XCTAssertNil(r.campos.conceptoId)
        XCTAssertFalse(r.conceptoSugerido)
        XCTAssertEqual(r.candidatos, candidatos)
    }

    func testUnMontoIlegibleNoEntra() {
        let r = FormPrefill.aplicar(interpretacion(amount: "abc"), a: FormFields())
        XCTAssertEqual(r.campos.monto, "")
    }
}
