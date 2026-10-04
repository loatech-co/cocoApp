import { aPayload } from './categories.controller';
import type { CategoryView } from './categories.service';

/**
 * Lo que el servicio publica tiene que SALIR por la API.
 *
 * ── El fallo que esto vigila ────────────────────────────────────────────────
 * `aPayload` nombraba los campos uno a uno, contra un tipo que también los
 * nombraba uno a uno. Dos listas paralelas que nada obligaba a coincidir: al
 * añadir `presupuesto` y `pago_automatico` al modelo, los dos se guardaban en
 * la base y se caían aquí. La API devolvía 200, el formulario los releía
 * vacíos y el siguiente guardado los borraba — así que parecía que «no se
 * guardaba», cuando lo que no hacía era volver.
 *
 * Es un fallo que no se ve: no hay excepción, no hay registro, y la pantalla
 * enseña un campo en blanco que es indistinguible de uno que nadie llenó.
 *
 * ── Por qué el objeto de abajo está completo ────────────────────────────────
 * Está tipado como `CategoryView`, así que TypeScript obliga a nombrar TODOS
 * sus campos. Un campo nuevo en la vista rompe la compilación de esta prueba
 * —hay que añadirlo aquí— y a partir de ahí la comprobación se encarga de que
 * llegue al payload. El aviso es de la compilación y la defensa es de la
 * prueba; el comentario que había antes no era ninguna de las dos.
 */
const VISTA: CategoryView = {
  id: 10n,
  name: 'Netflix',
  parentId: 3n,
  kind: 'expense',
  color: '#004225',
  icon: 'tv',
  sort_order: 2,
  is_archived: false,
  recurrente: true,
  estatico: false,
  periodicidad: 'mensual',
  dia_de_pago: 12,
  mes_de_pago: null,
  presupuesto: '39800',
  pago_automatico: false,
  varios_pagos: true,
  palabras_clave: ['netflix'],
};

describe('Lo que sale por la API de categorías', () => {
  it('no se deja ni un campo de la vista por el camino', () => {
    const payload = aPayload(VISTA) as Record<string, unknown>;

    // `parentId` es el único que cambia de nombre: sale como `parent_id`,
    // igual que todo lo demás de la forma pública.
    for (const campo of Object.keys(VISTA)) {
      const esperado = campo === 'parentId' ? 'parent_id' : campo;
      expect(Object.keys(payload)).toContain(esperado);
    }

    expect(payload.parent_id).toBe(3n);
    expect(payload.parentId).toBeUndefined();
  });

  it('los valores llegan intactos, no solo las llaves', () => {
    const payload = aPayload(VISTA) as Record<string, unknown>;

    // Los dos que se caían. Se comprueban por su nombre además del barrido de
    // arriba: si alguien cambiara el barrido, esto sigue en pie.
    expect(payload.presupuesto).toBe('39800');
    expect(payload.pago_automatico).toBe(false);
    expect(payload.varios_pagos).toBe(true);
  });

  it('a los hijos les pasa lo mismo, hasta el fondo', () => {
    const conNietos = {
      ...VISTA,
      parentId: null,
      children: [{ ...VISTA, id: 20n, children: [{ ...VISTA, id: 30n, children: [] }] }],
    };

    const payload = aPayload(conNietos) as Record<string, unknown>;
    const hijo = (payload.children as Record<string, unknown>[])[0];
    const nieto = (hijo.children as Record<string, unknown>[])[0];

    // El árbol entero se sirve de una vez, así que un campo que se caiga en el
    // tercer nivel es un campo que no existe para los conceptos — que son
    // justo los que llevan presupuesto y pago automático.
    expect(nieto.presupuesto).toBe('39800');
    expect(nieto.pago_automatico).toBe(false);
    expect(nieto.varios_pagos).toBe(true);
    expect(nieto.parent_id).toBe(3n);
  });
});
