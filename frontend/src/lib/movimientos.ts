import type { Category, Transaction } from '@coco/types';

/**
 * Lo que un movimiento ES, y de dónde saca su nombre.
 *
 * ── Un movimiento es un REGISTRO ────────────────────────────────────────────
 * No es una cosa con nombre propio: es la anotación de que tal día salió tal
 * plata de tal concepto. El nombre no lo tiene, lo TOMA del concepto al que
 * pertenece.
 *
 * ── Por qué se deriva y no se guarda ────────────────────────────────────────
 * Porque si se guardara una copia, renombrar un concepto dejaría atrás a sus
 * movimientos: «Aseo» pasaría a llamarse «Aseo y limpieza» en Centros de
 * costos y en la tabla seguirían los cuarenta viejos diciendo «Aseo». Dos
 * nombres para lo mismo, y ninguna forma de saber cuál es el bueno.
 *
 * Derivándolo, renombrar el concepto renombra sus movimientos, que es
 * exactamente lo que significa que el nombre sea del concepto.
 *
 * ── Y el concepto NO se va con el movimiento ────────────────────────────────
 * Borrar un movimiento borra el registro y nada más: el concepto sigue vivo,
 * porque es estructura y no dato. Es la razón por la que ni los conceptos ni
 * las categorías ni los centros se pueden tocar desde aquí —solo desde Centros de
 * costos—: desde la tabla de movimientos se anota y se corrige lo que pasó,
 * no se rehace el mapa con el que se ordena.
 */

/**
 * Reconstruye la ruta completa a partir de un solo id.
 *
 * Los filtros y los movimientos guardan UN id —el más específico que se
 * eligió—, no los tres. Guardar los tres obligaría a mantenerlos coherentes
 * entre sí en cada cambio, y bastaría un descuido para tener una categoría que no
 * pertenece al centro seleccionado. Con uno solo, el resto se deduce y no
 * puede contradecirse.
 */
export function rutaSeleccionada(
  arbol: Category[],
  categoryId?: number,
): { centro?: Category; categoria?: Category; concepto?: Category } {
  if (categoryId === undefined) return {};

  for (const centro of arbol) {
    if (centro.id === categoryId) return { centro };

    for (const categoria of centro.children ?? []) {
      if (categoria.id === categoryId) return { centro, categoria };

      for (const concepto of categoria.children ?? []) {
        if (concepto.id === categoryId) return { centro, categoria, concepto };
      }
    }
  }

  return {};
}

/**
 * El nombre de un movimiento.
 *
 * El del concepto al que pertenece. Si solo está clasificado hasta la categoría,
 * el dla categoría: es lo más específico que se sabe de él.
 *
 * ── Los dos respaldos, y por qué existen ────────────────────────────────────
 * `description` y `merchant` son lo que DECÍA EL PAPEL, no el nombre del
 * movimiento: los rellena una importación con lo que traía el extracto, y un
 * movimiento importado y todavía sin clasificar no tiene concepto del que
 * tomar nombre. Ahí «PAGO PSE COMCEL» es mucho mejor que «Sin concepto»,
 * porque es justo el dato con el que alguien va a decidir dónde clasificarlo.
 *
 * Van DESPUÉS del concepto y no antes. Al revés —que es como estaba— un
 * movimiento creado a mano se quedaba sin nombre: el rediseño de la ficha
 * cambió el campo libre de «Concepto» por un selector de conceptos, así que
 * `description` dejó de rellenarse por ningún camino visible y la tabla, que
 * pintaba `description`, decía «Sin concepto» de todo lo que se registraba a
 * mano aunque tuviera su concepto elegido.
 */
export function nombreDelMovimiento(
  movimiento: Pick<Transaction, 'description' | 'merchant' | 'category_id'>,
  arbol: Category[],
): string {
  const { categoria, concepto } = rutaSeleccionada(arbol, movimiento.category_id ?? undefined);

  return (
    concepto?.name ??
    categoria?.name ??
    movimiento.description ??
    movimiento.merchant ??
    'Sin concepto'
  );
}
