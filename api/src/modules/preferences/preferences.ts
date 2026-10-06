/**
 * Preferencias del usuario — catálogo y lógica pura.
 *
 * ── Por qué hay un catálogo cerrado ────────────────────────────────────────
 * `user_preferences` es una tabla clave-valor con `pref_value` en JSON, así que
 * técnicamente admite cualquier cosa. Sin un catálogo, en seis meses habría
 * claves escritas de tres formas distintas y valores de tipos inesperados
 * reventando en producción. Aquí se declara qué preferencias existen, de qué
 * tipo son y qué valor tienen cuando nadie las ha tocado.
 *
 * El valor por defecto se decide UNA vez, aquí. Si viviera repartido por los
 * servicios, un módulo leería `false` donde otro lee `true`.
 */

/**
 * Llevar cuentas —tarjetas, ahorros, efectivo— está APAGADO por defecto.
 *
 * Es la decisión de producto que ordena todo lo demás: registrar un gasto no
 * puede exigir haber inventado antes una cuenta. Quien quiera seguir saldos lo
 * enciende; para el resto, las cuentas sencillamente no existen.
 */
export const ACCOUNTS_ENABLED = 'cuentas_habilitadas';

export interface StoredPreferences {
  [ACCOUNTS_ENABLED]: boolean;
}

export const DEFAULT_PREFERENCES: Readonly<StoredPreferences> = Object.freeze({
  [ACCOUNTS_ENABLED]: false,
});

export type PreferenceKey = keyof StoredPreferences;

export const KEYS: readonly PreferenceKey[] = Object.keys(DEFAULT_PREFERENCES) as PreferenceKey[];

export function isKnownKey(key: string): key is PreferenceKey {
  return Object.prototype.hasOwnProperty.call(DEFAULT_PREFERENCES, key);
}

/**
 * Combina lo guardado con los valores por defecto.
 *
 * Tolerante a propósito: una fila con una clave que ya no existe, o con un
 * valor del tipo equivocado, se IGNORA en vez de tumbar la petición. Estas son
 * preferencias de interfaz — que una quede mal guardada no puede impedirle a
 * nadie ver sus finanzas.
 */
export function withDefaults(
  saved: readonly { prefKey: string; prefValue: unknown }[],
): StoredPreferences {
  const result: StoredPreferences = { ...DEFAULT_PREFERENCES };

  for (const row of saved) {
    if (!isKnownKey(row.prefKey)) continue;

    const value = row.prefValue;
    // Hoy todas las preferencias son booleanas. Cuando haya de otro tipo, esta
    // comprobación se abre por clave — no antes.
    if (typeof value === 'boolean') {
      result[row.prefKey] = value;
    }
  }

  return result;
}

/** The preferences as the service hands them out: the domain, by meaning and not by table key. */
export interface Preferences {
  /** Whether this user keeps accounts at all. */
  accountsEnabled: boolean;
}

export function preferencesOf(stored: StoredPreferences): Preferences {
  return { accountsEnabled: stored[ACCOUNTS_ENABLED] };
}
