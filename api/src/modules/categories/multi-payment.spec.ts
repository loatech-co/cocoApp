import { whyNotMultiPayment } from './multi-payment';

/**
 * The three conditions of "paid in several installments", and why they are
 * checked on the RESULTING state.
 */
describe('Who can be paid in several installments', () => {
  const concept = { isMultiPayment: true, isAutoPaid: false, isRecurring: true, depth: 3 };

  it('a recurring concept on the third level, yes', () => {
    expect(whyNotMultiPayment(concept)).toBeNull();
  });

  it('a cost center or a category, no', () => {
    // They are sums of what hangs from them: they are not paid, neither at once
    // nor in installments.
    expect(whyNotMultiPayment({ ...concept, depth: 1 })).toContain('centro de costos');
    expect(whyNotMultiPayment({ ...concept, depth: 2 })).toContain('categoría');
  });

  it('a concept that does not come back, neither', () => {
    // Without something that repeats there is no total to reach.
    expect(whyNotMultiPayment({ ...concept, isRecurring: false })).toContain('recurrente');
  });

  it('and never together with automatic payment', () => {
    const reason = whyNotMultiPayment({ ...concept, isAutoPaid: true });
    expect(reason).toContain('a la vez');
    // The message has to say WHY, not just no: they are two flags that
    // contradict each other, not a whim.
    expect(reason).toContain('el día que vence');
  });

  it('turned off it requires nothing', () => {
    // Otherwise, archiving an old cost center would fail because of a flag
    // nobody turned on.
    for (const state of [
      { isMultiPayment: false, isAutoPaid: true, isRecurring: false, depth: 1 },
      { isMultiPayment: false, isAutoPaid: false, isRecurring: false, depth: 2 },
    ]) {
      expect(whyNotMultiPayment(state)).toBeNull();
    }
  });

  it('cada negativa dice algo distinto', () => {
    // Three identical "not allowed" would leave whoever gets them guessing
    // which of the three conditions failed.
    const reasons = [
      whyNotMultiPayment({ ...concept, depth: 2 }),
      whyNotMultiPayment({ ...concept, isRecurring: false }),
      whyNotMultiPayment({ ...concept, isAutoPaid: true }),
    ];
    expect(new Set(reasons).size).toBe(3);
  });
});
