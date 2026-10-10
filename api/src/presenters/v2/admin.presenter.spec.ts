import { auditChangesV2 } from './admin.presenter';

/** A recorded entry: its keys are stored data, not names of this code. */
const recorded = (...pairs: [string, string][]) => Object.fromEntries(pairs);

describe('auditChangesV2', () => {
  it('reads an entry recorded with the old keys in the current shape', () => {
    expect(auditChangesV2(recorded(['de', 'pending'], ['a', 'active']))).toEqual({
      from: 'pending',
      to: 'active',
    });
    expect(auditChangesV2(recorded(['motivo', 'credenciales_incorrectas']))).toEqual({
      reason: 'invalid_credentials',
    });
  });

  it('leaves an entry in the current shape as it is', () => {
    expect(auditChangesV2({ from: 'user', to: 'admin' })).toEqual({ from: 'user', to: 'admin' });
    expect(auditChangesV2({ role: 'user', status: 'pending' })).toEqual({
      role: 'user',
      status: 'pending',
    });
    expect(auditChangesV2(null)).toBeNull();
  });

  it('prefers the current key when both are present', () => {
    expect(auditChangesV2(recorded(['de', 'old'], ['from', 'new']))).toEqual({ from: 'new' });
  });
});
