/**
 * Con qué estructura nace una cuenta.
 *
 * ── Cada cuenta tiene la SUYA ───────────────────────────────────────────────
 * Los centros de costos no se comparten entre cuentas: cada fila de
 * `categories` lleva su `user_id` y todas las consultas filtran por él. Esto
 * no es una copia viva de la estructura de nadie — es un punto de partida que
 * se copia UNA VEZ, al crear la cuenta, y desde ese momento es suya: renombra,
 * agrega y borra sin que eso toque a nadie más.
 *
 * ── Y es un SNAPSHOT, no un espejo ──────────────────────────────────────────
 * Lo de aquí abajo se sacó de la estructura real del 17 de septiembre de 2026,
 * y se quedó quieto. Lo que se cree de aquí en adelante en una cuenta no
 * aparece en las que vengan después: para que aparezca, hay que escribirlo
 * aquí. Es a propósito —una plantilla que siguiera viva convertiría cualquier
 * experimento en estructura obligatoria para todo el mundo— y es la razón de
 * que esto sea un archivo versionado y no una consulta.
 *
 * ── Por qué llega hasta las CATEGORÍAS y no hasta los conceptos ─────────────
 * Porque los dos primeros niveles son taxonomía —«Servicios públicos»,
 * «Vehículos»— y el tercero son compromisos de una persona concreta: el nombre
 * del colegio de su hija, el de quien le arrienda, cuánto y qué día paga. Eso
 * no es un punto de partida para nadie más; es información privada que se
 * habría copiado a cada cuenta nueva.
 *
 * Por lo mismo no se copia la recurrencia ni las palabras clave: las dos viven
 * en el concepto, que es el nivel que no viaja.
 */
export interface TemplateNode {
  name: string;
  /** Nombre de lucide. El único set permitido. */
  icon?: string;
  /**
   * Solo en el primer nivel, y solo se lee de ahí: lo que cuelga de un centro
   * estático no se reclasifica desde la tabla ni desde la ficha.
   */
  isStatic?: boolean;
  children?: readonly TemplateNode[];
}

export const NEW_ACCOUNT_TEMPLATE: readonly TemplateNode[] = [
  {
    name: 'Costos fijos',
    // Estático porque es la estructura que no se improvisa: el alquiler no
    // cambia de categoría un martes.
    isStatic: true,
    children: [
      { name: 'Educación', icon: 'graduation-cap' },
      { name: 'Vivienda', icon: 'house' },
      { name: 'Familia', icon: 'users' },
      { name: 'Salud y vida', icon: 'heart-pulse' },
      { name: 'Servicios públicos', icon: 'droplet' },
      { name: 'Vehículos', icon: 'car' },
    ],
  },
  {
    name: 'Costos variables',
    children: [{ name: 'Licencias', icon: 'credit-card' }],
  },
];
