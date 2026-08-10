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
export const CUENTAS_HABILITADAS = 'cuentas_habilitadas';

export interface Preferencias {
  [CUENTAS_HABILITADAS]: boolean;
}

export const PREFERENCIAS_POR_DEFECTO: Readonly<Preferencias> = Object.freeze({
  [CUENTAS_HABILITADAS]: false,
});

export type ClaveDePreferencia = keyof Preferencias;

export const CLAVES: readonly ClaveDePreferencia[] = Object.keys(
  PREFERENCIAS_POR_DEFECTO,
) as ClaveDePreferencia[];

export function esClaveConocida(clave: string): clave is ClaveDePreferencia {
  return Object.prototype.hasOwnProperty.call(PREFERENCIAS_POR_DEFECTO, clave);
}

/**
 * Combina lo guardado con los valores por defecto.
 *
 * Tolerante a propósito: una fila con una clave que ya no existe, o con un
 * valor del tipo equivocado, se IGNORA en vez de tumbar la petición. Estas son
 * preferencias de interfaz — que una quede mal guardada no puede impedirle a
 * nadie ver sus finanzas.
 */
export function combinarConDefectos(
  guardadas: readonly { prefKey: string; prefValue: unknown }[],
): Preferencias {
  const resultado: Preferencias = { ...PREFERENCIAS_POR_DEFECTO };

  for (const fila of guardadas) {
    if (!esClaveConocida(fila.prefKey)) continue;

    const valor = fila.prefValue;
    // Hoy todas las preferencias son booleanas. Cuando haya de otro tipo, esta
    // comprobación se abre por clave — no antes.
    if (typeof valor === 'boolean') {
      resultado[fila.prefKey] = valor;
    }
  }

  return resultado;
}
