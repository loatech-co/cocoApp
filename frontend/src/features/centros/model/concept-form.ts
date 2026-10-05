import { type CategoryTree } from '@/shared/api/categories';

import type { Recurrencia } from '../components/campos-de-recurrencia';

/**
 * Lo que la ficha de un concepto lee del árbol y lo que manda al servidor.
 *
 * Funciones puras: la ficha (`ConceptoModal`) y su estado
 * (`useConceptForm`) solo deciden CUÁNDO se llaman.
 */

/** La recurrencia con la que abre la ficha: la del concepto, o la de fábrica. */
export function initialRecurrence(concepto: CategoryTree | null | undefined): Recurrencia {
  return {
    recurrente: concepto?.isRecurring ?? false,
    periodicidad: concepto?.periodicity ?? 'monthly',
    diaDePago: concepto?.paymentDay ?? 1,
    // El mes en curso: si alguien pasa a trimestral, lo más probable es que el
    // ciclo empiece ahora, no en enero.
    mesDePago: concepto?.paymentMonth ?? new Date().getMonth() + 1,
    // Sin decimales: el campo escribe pesos enteros, que es como se escribe
    // la plata aquí. Un «180000.00» que vuelve de la API se enseñaría con un
    // «.00» que nadie tecleó y que el campo no deja borrar.
    presupuesto: concepto?.budget != null ? String(Math.round(Number(concepto.budget))) : '',
    pagoAutomatico: concepto?.isAutoPaid ?? false,
    variosPagos: concepto?.isMultiPayment ?? false,
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
  arbol: CategoryTree[],
  concepto: CategoryTree | null | undefined,
): { valor: string; etiqueta: string }[] {
  return arbol.flatMap((centro) => {
    const categorias = centro.children ?? [];
    return categorias.some((g) => g.id === Number(concepto?.parentId))
      ? categorias.map((g) => ({ valor: String(g.id), etiqueta: g.name }))
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
  arbol: CategoryTree[],
  concepto: CategoryTree | null | undefined,
  nombre: string,
): CategoryTree | undefined {
  return conceptosDe(arbol).find(
    (c) => c.id !== concepto?.id && normalizar(c.name) === normalizar(nombre),
  );
}

/** Los campos que se guardan, al crear y al editar. */
export function conceptFields(nombre: string, recurrencia: Recurrencia, palabrasClave: string[]) {
  return {
    name: nombre.trim(),
    isRecurring: recurrencia.recurrente,
    periodicity: recurrencia.recurrente ? recurrencia.periodicidad : null,
    paymentDay: recurrencia.recurrente ? recurrencia.diaDePago : null,
    // El mes solo significa algo si el ciclo no es mensual.
    paymentMonth:
      recurrencia.recurrente && recurrencia.periodicidad !== 'monthly'
        ? recurrencia.mesDePago
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
      recurrencia.recurrente && recurrencia.presupuesto.trim() !== ''
        ? Number(recurrencia.presupuesto)
        : null,
    // Se va con la recurrencia, como el presupuesto: cobrar solo «cada vez»
    // no significa nada donde no hay una próxima vez.
    isAutoPaid: recurrencia.recurrente && recurrencia.pagoAutomatico,
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
    isMultiPayment:
      recurrencia.recurrente && recurrencia.variosPagos && !recurrencia.pagoAutomatico,
    keywords: palabrasClave,
  };
}

/** Los cambios al editar: los campos, y la categoría solo si de verdad cambió. */
export function conceptChanges(
  campos: ReturnType<typeof conceptFields>,
  categoria: string,
  concepto: CategoryTree,
) {
  return {
    ...campos,
    // Solo si de verdad cambió: un `parentId` en cada guardado
    // dispara la comprobación de ciclos y de profundidad del árbol
    // para nada.
    ...(categoria !== '' && Number(categoria) !== Number(concepto.parentId)
      ? { parentId: Number(categoria) }
      : {}),
  };
}

/** Lo que se crea, colgado de la categoría cuyo botón abrió la ficha. */
export function newConcept(campos: ReturnType<typeof conceptFields>, categoriaId?: number) {
  return {
    ...campos,
    kind: 'expense' as const,
    ...(categoriaId === undefined ? {} : { parentId: categoriaId }),
  };
}

/** Los conceptos del árbol: las hojas, que es donde cuelgan los movimientos. */
function conceptosDe(arbol: CategoryTree[]): CategoryTree[] {
  return arbol.flatMap((centro) =>
    (centro.children ?? []).flatMap((categoria) => categoria.children ?? []),
  );
}

/** Dos nombres son el mismo si solo se diferencian en mayúsculas o espacios. */
function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase().replace(/\s+/g, ' ');
}
