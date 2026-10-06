import { type CategoryTree } from '@/shared/api/categories';

import type { Recurrence } from '../components/recurrence-fields';

/**
 * Lo que la ficha de un concepto lee del árbol y lo que manda al servidor.
 *
 * Funciones puras: la ficha (`ConceptModal`) y su estado
 * (`useConceptForm`) solo deciden CUÁNDO se llaman.
 */

/** La recurrencia con la que abre la ficha: la del concepto, o la de fábrica. */
export function initialRecurrence(concept: CategoryTree | null | undefined): Recurrence {
  return {
    isRecurring: concept?.isRecurring ?? false,
    periodicity: concept?.periodicity ?? 'monthly',
    paymentDay: concept?.paymentDay ?? 1,
    // El mes en curso: si alguien pasa a trimestral, lo más probable es que el
    // ciclo empiece ahora, no en enero.
    paymentMonth: concept?.paymentMonth ?? new Date().getMonth() + 1,
    // Sin decimales: el campo escribe pesos enteros, que es como se escribe
    // la plata aquí. Un «180000.00» que vuelve de la API se enseñaría con un
    // «.00» que nadie tecleó y que el campo no deja borrar.
    budget: concept?.budget != null ? String(Math.round(Number(concept.budget))) : '',
    isAutoPay: concept?.isAutoPaid ?? false,
    isMultiPayment: concept?.isMultiPayment ?? false,
  };
}

/*
  ── Las categorías del MISMO centro, y solo esos ────────────────────────────
  Mover un concepto de categoría es corregir dónde está dentro de su centro:
  «Claro Móvil» estaba en Vivienda y va en Servicios públicos. Mover de
  CENTRO es otra cosa —cambia de qué bolsa sale la plata— y es la clase de
  decisión que no se toma de pasada en un desplegable mientras se corrige un
  nombre.

  Y hay una razón práctica encima: un centro puede ser estático, y entonces
  lo que cuelga de él no se reclasifica. Ofrecer el salto entre centros
  obligaría a decidir aquí qué pasa con esa regla; limitándolo al centro
  propio, la pregunta no existe.
*/
export function siblingCategories(
  tree: CategoryTree[],
  concept: CategoryTree | null | undefined,
): { value: string; label: string }[] {
  return tree.flatMap((costCenter) => {
    const categories = costCenter.children ?? [];
    return categories.some((g) => g.id === Number(concept?.parentId))
      ? categories.map((g) => ({ value: String(g.id), label: g.name }))
      : [];
  });
}

/*
  ── El choque de nombres ────────────────────────────────────────────────
  Los duplicados aparecen solos: una importación crea "Movistar", otra crea
  "MOVISTAR S.A.", y a partir de ahí la misma factura suma por separado en
  dos conceptos. Ningún total cuadra y la dona muestra dos porciones donde
  hay una.

  Renombrar a secas no lo arregla —quedarían dos conceptos con el mismo
  nombre, que es peor: se ven iguales y siguen sumando aparte—, así que
  cuando el nombre ya existe se ofrece fundirlos.

  Sin distinguir mayúsculas ni espacios de sobra, que es justo como se
  escriben distinto dos veces la misma cosa.
*/
export function findTwin(
  tree: CategoryTree[],
  concept: CategoryTree | null | undefined,
  name: string,
): CategoryTree | undefined {
  return conceptsOf(tree).find(
    (c) => c.id !== concept?.id && normalize(c.name) === normalize(name),
  );
}

/** Los campos que se guardan, al crear y al editar. */
export function conceptFields(name: string, recurrence: Recurrence, keywords: string[]) {
  return {
    name: name.trim(),
    isRecurring: recurrence.isRecurring,
    periodicity: recurrence.isRecurring ? recurrence.periodicity : null,
    paymentDay: recurrence.isRecurring ? recurrence.paymentDay : null,
    // El mes solo significa algo si el ciclo no es mensual.
    paymentMonth:
      recurrence.isRecurring && recurrence.periodicity !== 'monthly'
        ? recurrence.paymentMonth
        : null,
    /*
      Vacío es `null`, no cero.

      Son dos cosas distintas y la API las distingue: `null` es «no lo sé,
      estímalo con el promedio» y cero es «esto ahora no cuesta». Mandar cero
      por un campo en blanco haría desaparecer el concepto del presupuesto
      del mes sin que nadie lo hubiera pedido.

      Y si deja de ser recurrente se va con la recurrencia: un presupuesto
      «cada vez» no significa nada donde no hay una próxima vez.
    */
    budget:
      recurrence.isRecurring && recurrence.budget.trim() !== '' ? Number(recurrence.budget) : null,
    // Se va con la recurrencia, como el presupuesto: cobrar solo «cada vez»
    // no significa nada donde no hay una próxima vez.
    isAutoPaid: recurrence.isRecurring && recurrence.isAutoPay,
    /*
      Se va con la recurrencia por lo mismo, y además NUNCA junto al pago
      automático.

      El segundo filtro parece redundante —en la pantalla los dos
      interruptores se excluyen— pero no lo es: la exclusión de allí depende
      de un estado que esta función no controla, y basta con que alguien
      reordene los campos para que se cuelen las dos marcas encendidas. La
      API contestaría 422 y el concepto no se guardaría, lo cual está bien
      como última defensa pero es un error que no tiene por qué llegar a
      ocurrir.
    */
    isMultiPayment: recurrence.isRecurring && recurrence.isMultiPayment && !recurrence.isAutoPay,
    keywords,
  };
}

/** Los cambios al editar: los campos, y la categoría solo si de verdad cambió. */
export function conceptChanges(
  fields: ReturnType<typeof conceptFields>,
  category: string,
  concept: CategoryTree,
) {
  return {
    ...fields,
    // Solo si de verdad cambió: un `parentId` en cada guardado
    // dispara la comprobación de ciclos y de profundidad del árbol
    // para nada.
    ...(category !== '' && Number(category) !== Number(concept.parentId)
      ? { parentId: Number(category) }
      : {}),
  };
}

/** Lo que se crea, colgado de la categoría cuyo botón abrió la ficha. */
export function newConcept(fields: ReturnType<typeof conceptFields>, categoryId?: number) {
  return {
    ...fields,
    kind: 'expense' as const,
    ...(categoryId === undefined ? {} : { parentId: categoryId }),
  };
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptsOf(tree: CategoryTree[]): CategoryTree[] {
  return tree.flatMap((costCenter) =>
    (costCenter.children ?? []).flatMap((category) => category.children ?? []),
  );
}

/** Dos nombres son el mismo si solo se diferencian en mayúsculas o espacios. */
function normalize(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
