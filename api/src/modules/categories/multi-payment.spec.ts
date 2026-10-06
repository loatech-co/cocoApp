import { whyNotMultiPayment } from './multi-payment';

/**
 * Las tres condiciones de «se paga en varias veces», y la razón de que se
 * comprueben sobre el estado RESULTANTE.
 */
describe('Quién puede pagarse en varias veces', () => {
  const concept = { isMultiPayment: true, isAutoPaid: false, isRecurring: true, depth: 3 };

  it('un concepto recurrente del tercer nivel, sí', () => {
    expect(whyNotMultiPayment(concept)).toBeNull();
  });

  it('un centro de costos o una categoría, no', () => {
    // Son sumas de lo que cuelga de ellos: no se pagan, ni de una vez ni de
    // varias.
    expect(whyNotMultiPayment({ ...concept, depth: 1 })).toContain('centro de costos');
    expect(whyNotMultiPayment({ ...concept, depth: 2 })).toContain('categoría');
  });

  it('un concepto que no vuelve, tampoco', () => {
    // Sin algo que se repita no hay un total al que llegar.
    expect(whyNotMultiPayment({ ...concept, isRecurring: false })).toContain('recurrente');
  });

  it('y nunca junto al pago automático', () => {
    const reason = whyNotMultiPayment({ ...concept, isAutoPaid: true });
    expect(reason).toContain('a la vez');
    // El mensaje tiene que decir POR QUÉ, no solo que no: son dos marcas que
    // se contradicen, no un capricho.
    expect(reason).toContain('el día que vence');
  });

  it('apagada no exige nada', () => {
    // Si no, archivar un centro de costos viejo fallaría por una marca que
    // nadie encendió.
    for (const state of [
      { isMultiPayment: false, isAutoPaid: true, isRecurring: false, depth: 1 },
      { isMultiPayment: false, isAutoPaid: false, isRecurring: false, depth: 2 },
    ]) {
      expect(whyNotMultiPayment(state)).toBeNull();
    }
  });

  it('cada negativa dice algo distinto', () => {
    // Tres «no se puede» idénticos dejarían a quien lo recibe adivinando cuál
    // de las tres condiciones incumplió.
    const reasons = [
      whyNotMultiPayment({ ...concept, depth: 2 }),
      whyNotMultiPayment({ ...concept, isRecurring: false }),
      whyNotMultiPayment({ ...concept, isAutoPaid: true }),
    ];
    expect(new Set(reasons).size).toBe(3);
  });
});
