import XCTest

@testable import Coco

final class RellenoDelFormularioTests: XCTestCase {
    private func interpretacion(
        amount: String? = "45000", date: String? = "2026-10-03", merchant: String? = "D1", certeza: String = "alta",
        conceptoId: Int? = 100, candidatos: [ClasificacionPropuesta.Candidato] = []
    ) -> Interpretacion {
        Interpretacion(
            amount: amount, date: date, merchant: merchant, description: nil,
            clasificacion: ClasificacionPropuesta(
                certeza: certeza, fuente: nil, concepto_id: conceptoId, categoria_id: 10, nombre: "Colegio",
                candidatos: candidatos, motivo: ""),
            por_revisar: false
        )
    }

    func testRellenaLoVacioYMarcaElConceptoComoSugerido() {
        let r = RellenoDelFormulario.aplicar(interpretacion(), a: CamposDelFormulario())
        XCTAssertEqual(
            r.campos, CamposDelFormulario(monto: "45.000", fecha: "2026-10-03", comercio: "D1", conceptoId: 100))
        XCTAssertTrue(r.conceptoSugerido)
        XCTAssertTrue(r.candidatos.isEmpty)
    }

    func testNoPisaLoQueLaPersonaYaEscribio() {
        let antes = CamposDelFormulario(monto: "12.500", fecha: "2026-10-01", comercio: "Éxito", conceptoId: 7)
        let r = RellenoDelFormulario.aplicar(interpretacion(), a: antes)
        XCTAssertEqual(r.campos, antes)
        XCTAssertFalse(r.conceptoSugerido)
    }

    func testConCertezaMediaNoEligeYDevuelveLosCandidatos() {
        let candidatos = [
            ClasificacionPropuesta.Candidato(id: 100, nombre: "Colegio", ruta: "Costos fijos › Educación › Colegio")
        ]
        let r = RellenoDelFormulario.aplicar(
            interpretacion(certeza: "media", conceptoId: nil, candidatos: candidatos), a: CamposDelFormulario())
        XCTAssertNil(r.campos.conceptoId)
        XCTAssertFalse(r.conceptoSugerido)
        XCTAssertEqual(r.candidatos, candidatos)
    }

    func testUnMontoIlegibleNoEntra() {
        let r = RellenoDelFormulario.aplicar(interpretacion(amount: "abc"), a: CamposDelFormulario())
        XCTAssertEqual(r.campos.monto, "")
    }
}
