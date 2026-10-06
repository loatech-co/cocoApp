import { categoryTreeV1, categoryV1 } from './categories.presenter';
import type { Category } from '../../modules/categories/categories.domain';

/**
 * Lo que el servicio publica tiene que SALIR por la v1.
 *
 * ── El fallo que esto vigila ────────────────────────────────────────────────
 * La v1 nombraba los campos uno a uno, contra un tipo que también los
 * nombraba uno a uno. Dos listas paralelas que nada obligaba a coincidir: al
 * añadir `presupuesto` y `pago_automatico` al modelo, los dos se guardaban en
 * la base y se caían por el camino. La API devolvía 200, el formulario los
 * releía vacíos y el siguiente guardado los borraba — así que parecía que «no
 * se guardaba», cuando lo que no hacía era volver.
 *
 * El presentador de la v1 vuelve a nombrarlos uno a uno, a propósito: es lo
 * que deja la v1 congelada mientras el dominio crece. Por eso `NOMBRE_EN_V1`
 * está tipado sobre `keyof Category`: un campo nuevo en el dominio rompe la
 * compilación de esta prueba, y quien lo añade tiene que decir aquí si la v1
 * lo publica (su nombre) o no (`null`). Lo que no puede es caerse sin que
 * nadie lo decida.
 */
const NOMBRE_EN_V1: Record<keyof Category, string | null> = {
  id: 'id',
  parentId: 'parent_id',
  name: 'name',
  kind: 'kind',
  color: 'color',
  icon: 'icon',
  sortOrder: 'sort_order',
  isArchived: 'is_archived',
  isRecurring: 'recurrente',
  isStatic: 'estatico',
  periodicity: 'periodicidad',
  paymentDay: 'dia_de_pago',
  paymentMonth: 'mes_de_pago',
  budget: 'presupuesto',
  isAutoPaid: 'pago_automatico',
  isMultiPayment: 'varios_pagos',
  keywords: 'palabras_clave',
};

const CONCEPTO: Category = {
  id: 10n,
  parentId: 3n,
  name: 'Netflix',
  kind: 'expense',
  color: '#004225',
  icon: 'tv',
  sortOrder: 2,
  isArchived: false,
  isRecurring: true,
  isStatic: false,
  periodicity: 'monthly',
  paymentDay: 12,
  paymentMonth: null,
  budget: '39800',
  isAutoPaid: false,
  isMultiPayment: true,
  keywords: ['netflix'],
};

describe('Lo que sale por la v1 de categorías', () => {
  it('no se deja ni un campo del dominio por el camino', () => {
    const payload: Record<string, unknown> = { ...categoryV1(CONCEPTO) };

    for (const nombre of Object.values(NOMBRE_EN_V1)) {
      if (nombre !== null) expect(Object.keys(payload)).toContain(nombre);
    }
    expect(payload.parent_id).toBe(3n);
    expect(payload.parentId).toBeUndefined();
  });

  it('los valores llegan intactos, y las palabras vuelven al español', () => {
    const payload: Record<string, unknown> = { ...categoryV1(CONCEPTO) };

    expect(payload.presupuesto).toBe('39800');
    expect(payload.pago_automatico).toBe(false);
    expect(payload.varios_pagos).toBe(true);
    expect(payload.periodicidad).toBe('mensual');
  });

  it('el padre va al final, como siempre salió', () => {
    expect(Object.keys(categoryV1(CONCEPTO)).at(-1)).toBe('parent_id');
  });

  it('a los hijos les pasa lo mismo, hasta el fondo', () => {
    const arbol = {
      tree: [
        {
          ...CONCEPTO,
          parentId: null,
          children: [{ ...CONCEPTO, id: 20n, children: [{ ...CONCEPTO, id: 30n, children: [] }] }],
        },
      ],
      total: 3,
    };

    const { data } = categoryTreeV1(arbol);
    const hijo = data[0]!.children![0]!;
    const nieto = hijo.children![0]!;

    // El árbol entero se sirve de una vez, así que un campo que se caiga en el
    // tercer nivel es un campo que no existe para los conceptos — que son
    // justo los que llevan presupuesto y pago automático.
    expect(nieto.presupuesto).toBe('39800');
    expect(nieto.pago_automatico).toBe(false);
    expect(nieto.varios_pagos).toBe(true);
    expect(nieto.parent_id).toBe(3n);
  });
});
