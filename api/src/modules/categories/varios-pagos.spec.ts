import { porQueNoAdmiteVariosPagos } from './varios-pagos';

/**
 * Las tres condiciones de «se paga en varias veces», y la razón de que se
 * comprueben sobre el estado RESULTANTE.
 */
describe('Quién puede pagarse en varias veces', () => {
  const concepto = { variosPagos: true, pagoAutomatico: false, recurrente: true, profundidad: 3 };

  it('un concepto recurrente del tercer nivel, sí', () => {
    expect(porQueNoAdmiteVariosPagos(concepto)).toBeNull();
  });

  it('un centro de costos o una categoría, no', () => {
    // Son sumas de lo que cuelga de ellos: no se pagan, ni de una vez ni de
    // varias.
    expect(porQueNoAdmiteVariosPagos({ ...concepto, profundidad: 1 })).toContain(
      'centro de costos',
    );
    expect(porQueNoAdmiteVariosPagos({ ...concepto, profundidad: 2 })).toContain('categoría');
  });

  it('un concepto que no vuelve, tampoco', () => {
    // Sin algo que se repita no hay un total al que llegar.
    expect(porQueNoAdmiteVariosPagos({ ...concepto, recurrente: false })).toContain('recurrente');
  });

  it('y nunca junto al pago automático', () => {
    const motivo = porQueNoAdmiteVariosPagos({ ...concepto, pagoAutomatico: true });
    expect(motivo).toContain('a la vez');
    // El mensaje tiene que decir POR QUÉ, no solo que no: son dos marcas que
    // se contradicen, no un capricho.
    expect(motivo).toContain('el día que vence');
  });

  it('apagada no exige nada', () => {
    // Si no, archivar un centro de costos viejo fallaría por una marca que
    // nadie encendió.
    for (const estado of [
      { variosPagos: false, pagoAutomatico: true, recurrente: false, profundidad: 1 },
      { variosPagos: false, pagoAutomatico: false, recurrente: false, profundidad: 2 },
    ]) {
      expect(porQueNoAdmiteVariosPagos(estado)).toBeNull();
    }
  });

  it('cada negativa dice algo distinto', () => {
    // Tres «no se puede» idénticos dejarían a quien lo recibe adivinando cuál
    // de las tres condiciones incumplió.
    const motivos = [
      porQueNoAdmiteVariosPagos({ ...concepto, profundidad: 2 }),
      porQueNoAdmiteVariosPagos({ ...concepto, recurrente: false }),
      porQueNoAdmiteVariosPagos({ ...concepto, pagoAutomatico: true }),
    ];
    expect(new Set(motivos).size).toBe(3);
  });
});
