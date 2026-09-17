import type { PrismaService } from '../../prisma/prisma.service';

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
export interface NodoDePlantilla {
  name: string;
  /** Nombre de lucide. El único set permitido. */
  icon?: string;
  /**
   * Solo en el primer nivel, y solo se lee de ahí: lo que cuelga de un centro
   * estático no se reclasifica desde la tabla ni desde la ficha.
   */
  estatico?: boolean;
  children?: readonly NodoDePlantilla[];
}

export const PLANTILLA_DE_CUENTA_NUEVA: readonly NodoDePlantilla[] = [
  {
    name: 'Costos fijos',
    // Estático porque es la estructura que no se improvisa: el alquiler no
    // cambia de categoría un martes.
    estatico: true,
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

/**
 * Copia la plantilla en una cuenta. Devuelve cuántas filas creó.
 *
 * ── Por qué es una función suelta y no un método del servicio ───────────────
 * Porque la llaman dos sitios que no se conocen entre sí: el registro, para
 * que una cuenta nazca con su estructura, y `POST /categories/seed`, para
 * rellenar una que se quedó vacía. Como método de `CategoriesService` habría
 * que inyectar ese servicio en el de autenticación, y `CategoriesModule` ya
 * depende del de autenticación por el guard: sería un ciclo entre módulos por
 * una función de veinte líneas.
 *
 * ── Por qué nivel por nivel y no un `createMany` ────────────────────────────
 * Porque un hijo necesita el `id` de su padre, y `createMany` no devuelve los
 * ids que acaba de asignar. El árbol son nueve filas: el ahorro de una sola
 * consulta no paga tener que resolver eso a mano.
 */
export async function sembrarPlantilla(prisma: PrismaService, userId: bigint): Promise<number> {
  return copiar(prisma, userId, PLANTILLA_DE_CUENTA_NUEVA, null);
}

async function copiar(
  prisma: PrismaService,
  userId: bigint,
  nodos: readonly NodoDePlantilla[],
  parentId: bigint | null,
): Promise<number> {
  let creadas = 0;

  for (const [posicion, nodo] of nodos.entries()) {
    const fila = await prisma.category.create({
      data: {
        userId,
        name: nodo.name,
        // Todo lo de la plantilla es gasto. Los ingresos no se clasifican
        // todavía en esta app —la opción está apagada y rotulada «Pronto»—,
        // así que sembrar un árbol de ingresos sería sembrar algo que no se
        // puede usar.
        kind: 'expense',
        parentId,
        icon: nodo.icon ?? null,
        estatico: nodo.estatico ?? false,
        // Explícito y correlativo, no el 0 de fábrica: con todo en cero el
        // orden lo acaba decidiendo el id, que es el orden de inserción por
        // casualidad y no por decisión.
        sortOrder: posicion,
      },
    });
    creadas += 1;

    if (nodo.children?.length) {
      creadas += await copiar(prisma, userId, nodo.children, fila.id);
    }
  }

  return creadas;
}
