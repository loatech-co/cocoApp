import {
  anidar,
  descendientesDe,
  generariaCiclo,
  profundidadDe,
  profundidadResultante,
  type NodoDeCategoria,
} from './categories.tree';

const n = (id: number, parentId: number | null = null): NodoDeCategoria => ({
  id: BigInt(id),
  parentId: parentId === null ? null : BigInt(parentId),
});

/**
 *   1 Hogar
 *   └─ 2 Servicios
 *      └─ 3 Energía
 *   4 Alimentación
 */
const arbol: NodoDeCategoria[] = [n(1), n(2, 1), n(3, 2), n(4)];

describe('Detección de ciclos', () => {
  it('no hay ciclo al mover una categoría a la raíz', () => {
    expect(generariaCiclo(arbol, BigInt(2), null)).toBe(false);
  });

  it('no hay ciclo al colgar de una rama ajena', () => {
    expect(generariaCiclo(arbol, BigInt(4), BigInt(1))).toBe(false);
  });

  it('ser su propio padre es un ciclo', () => {
    expect(generariaCiclo(arbol, BigInt(1), BigInt(1))).toBe(true);
  });

  it('colgar de un hijo propio es un ciclo', () => {
    // Hogar(1) no puede colgar de Servicios(2), que es su hijo.
    expect(generariaCiclo(arbol, BigInt(1), BigInt(2))).toBe(true);
  });

  it('colgar de un nieto propio también es un ciclo', () => {
    expect(generariaCiclo(arbol, BigInt(1), BigInt(3))).toBe(true);
  });

  it('termina aunque los datos ya vengan con un ciclo, en vez de colgarse', () => {
    // 10 → 11 → 10: dato corrupto.
    const corrupto = [n(10, 11), n(11, 10), n(12)];
    expect(generariaCiclo(corrupto, BigInt(12), BigInt(10))).toBe(true);
  });
});

describe('Profundidad', () => {
  it('la raíz está en el nivel 1', () => {
    expect(profundidadDe(arbol, BigInt(1))).toBe(1);
  });

  it('un hijo está en el nivel 2', () => {
    expect(profundidadDe(arbol, BigInt(2))).toBe(2);
  });

  it('un nieto está en el nivel 3', () => {
    expect(profundidadDe(arbol, BigInt(3))).toBe(3);
  });

  it('sin padre, la profundidad es 0', () => {
    expect(profundidadDe(arbol, null)).toBe(0);
  });

  it('mover una hoja bajo una raíz la deja en el nivel 2', () => {
    expect(profundidadResultante(arbol, BigInt(4), BigInt(1))).toBe(2);
  });

  it('mover una rama arrastra a sus hijos y suma su altura', () => {
    // Servicios(2) tiene a Energía(3) debajo. Colgarlo de Alimentación(4)
    // dejaría a Energía en el nivel 3.
    expect(profundidadResultante(arbol, BigInt(2), BigInt(4))).toBe(3);
  });

  it('una categoría sin hijos movida a la raíz queda en el nivel 1', () => {
    expect(profundidadResultante(arbol, BigInt(3), null)).toBe(1);
  });
});

describe('Descendientes', () => {
  it('encuentra hijos y nietos', () => {
    const ids = descendientesDe(arbol, BigInt(1)).map(Number).sort();
    expect(ids).toEqual([2, 3]);
  });

  it('una hoja no tiene descendientes', () => {
    expect(descendientesDe(arbol, BigInt(3))).toEqual([]);
  });
});

describe('Anidar', () => {
  it('arma el árbol desde una lista plana', () => {
    const raices = anidar(arbol);

    expect(raices).toHaveLength(2);
    const hogar = raices.find((raiz) => raiz.id === BigInt(1))!;
    expect(hogar.children).toHaveLength(1);
    expect(hogar.children[0].id).toBe(BigInt(2));
    expect(hogar.children[0].children[0].id).toBe(BigInt(3));
  });

  it('un huérfano (por filtro de kind) sube a la raíz en vez de perderse', () => {
    // Solo Energía(3), cuyo padre Servicios(2) quedó fuera del filtro.
    const raices = anidar([n(3, 2)]);

    expect(raices).toHaveLength(1);
    expect(raices[0].id).toBe(BigInt(3));
  });

  it('una lista vacía da un árbol vacío', () => {
    expect(anidar([])).toEqual([]);
  });
});
