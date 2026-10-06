import type { Preferences } from '../../modules/preferences/preferences';

/** v1 named each preference by its key in `user_preferences`. */
export interface PreferencesV1 {
  cuentas_habilitadas: boolean;
}

export function preferencesV1(p: Preferences): PreferencesV1 {
  return { cuentas_habilitadas: p.accountsEnabled };
}
