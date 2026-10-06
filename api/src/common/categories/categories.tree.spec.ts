import {
  MAX_DEPTH,
  nest,
  descendantsOf,
  wouldCreateCycle,
  categoryIds,
  levelName,
  depthOf,
  resultingDepth,
  branchesOf,
  type CategoryNode,
} from './categories.tree';

const n = (id: number, parentId: number | null = null): CategoryNode => ({
  id: BigInt(id),
  parentId: parentId === null ? null : BigInt(parentId),
});

/**
 *   1 Hogar
 *   └─ 2 Servicios
 *      └─ 3 Energía
 *   4 Alimentación
 */
const tree: CategoryNode[] = [n(1), n(2, 1), n(3, 2), n(4)];

describe('Detección de ciclos', () => {
  it('no hay ciclo al mover una categoría a la raíz', () => {
    expect(wouldCreateCycle(tree, BigInt(2), null)).toBe(false);
  });

  it('no hay ciclo al colgar de una rama ajena', () => {
    expect(wouldCreateCycle(tree, BigInt(4), BigInt(1))).toBe(false);
  });

  it('ser su propio padre es un ciclo', () => {
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(1))).toBe(true);
  });

  it('colgar de un hijo propio es un ciclo', () => {
    // Hogar(1) no puede colgar de Servicios(2), que es su hijo.
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(2))).toBe(true);
  });

  it('colgar de un nieto propio también es un ciclo', () => {
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(3))).toBe(true);
  });

  it('termina aunque los datos ya vengan con un ciclo, en vez de colgarse', () => {
    // 10 → 11 → 10: dato corrupto.
    const corrupt = [n(10, 11), n(11, 10), n(12)];
    expect(wouldCreateCycle(corrupt, BigInt(12), BigInt(10))).toBe(true);
  });
});

describe('Profundidad', () => {
  it('la raíz está en el nivel 1', () => {
    expect(depthOf(tree, BigInt(1))).toBe(1);
  });

  it('un hijo está en el nivel 2', () => {
    expect(depthOf(tree, BigInt(2))).toBe(2);
  });

  it('un nieto está en el nivel 3', () => {
    expect(depthOf(tree, BigInt(3))).toBe(3);
  });

  it('sin padre, la profundidad es 0', () => {
    expect(depthOf(tree, null)).toBe(0);
  });

  it('mover una hoja bajo una raíz la deja en el nivel 2', () => {
    expect(resultingDepth(tree, BigInt(4), BigInt(1))).toBe(2);
  });

  it('mover una rama arrastra a sus hijos y suma su altura', () => {
    // Servicios(2) tiene a Energía(3) debajo. Colgarlo de Alimentación(4)
    // dejaría a Energía en el nivel 3.
    expect(resultingDepth(tree, BigInt(2), BigInt(4))).toBe(3);
  });

  it('una categoría sin hijos movida a la raíz queda en el nivel 1', () => {
    expect(resultingDepth(tree, BigInt(3), null)).toBe(1);
  });
});

describe('Descendientes', () => {
  it('encuentra hijos y nietos', () => {
    const ids = descendantsOf(tree, BigInt(1)).map(Number).sort();
    expect(ids).toEqual([2, 3]);
  });

  it('una hoja no tiene descendientes', () => {
    expect(descendantsOf(tree, BigInt(3))).toEqual([]);
  });
});

describe('Anidar', () => {
  it('arma el árbol desde una lista plana', () => {
    const roots = nest(tree);

    expect(roots).toHaveLength(2);
    const home = roots.find((root) => root.id === BigInt(1))!;
    expect(home.children).toHaveLength(1);
    expect(home.children[0]!.id).toBe(BigInt(2));
    expect(home.children[0]!.children[0]!.id).toBe(BigInt(3));
  });

  it('un huérfano (por filtro de kind) sube a la raíz en vez de perderse', () => {
    // Solo Energía(3), cuyo padre Servicios(2) quedó fuera del filtro.
    const roots = nest([n(3, 2)]);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(BigInt(3));
  });

  it('una lista vacía da un árbol vacío', () => {
    expect(nest([])).toEqual([]);
  });

  describe('Los tres niveles del modelo', () => {
    it('admite centro de costos → categoría → concepto, y nada más', () => {
      expect(MAX_DEPTH).toBe(3);
    });

    it('nombra cada nivel por su nombre de dominio', () => {
      expect(levelName(1)).toBe('centro de costos');
      expect(levelName(2)).toBe('categoría');
      expect(levelName(3)).toBe('concepto');
    });

    it('un concepto cabe: colgar un nieto de la raíz da profundidad 3', () => {
      // 1 (centro) → 2 (categoría) → 3 (concepto)
      expect(depthOf(tree, BigInt(3))).toBeLessThanOrEqual(MAX_DEPTH);
    });
  });
});

describe('Filtro por varias categorías', () => {
  const tree = [
    { id: BigInt(1), parentId: null },
    { id: BigInt(2), parentId: BigInt(1) },
    { id: BigInt(3), parentId: BigInt(2) },
    { id: BigInt(10), parentId: null },
    { id: BigInt(11), parentId: BigInt(10) },
  ];

  it('lee una lista separada por comas', () => {
    expect(categoryIds('1,10')).toEqual([BigInt(1), BigInt(10)]);
  });

  it('descarta lo que no sea un número en vez de reventar', () => {
    // Un parámetro mal escrito en una URL pegada no puede impedirle a alguien
    // ver sus movimientos.
    expect(categoryIds('1,abc,,10')).toEqual([BigInt(1), BigInt(10)]);
    expect(categoryIds('')).toEqual([]);
    expect(categoryIds(undefined)).toEqual([]);
  });

  it('no repite ids', () => {
    expect(categoryIds('4,4,4')).toEqual([BigInt(4)]);
  });

  it('cada id arrastra su rama entera', () => {
    // Los movimientos cuelgan del concepto: sin expandir, filtrar por un
    // centro devolvería cero filas.
    expect(branchesOf(tree, [BigInt(1)]).sort()).toEqual([BigInt(1), BigInt(2), BigInt(3)].sort());
  });

  it('une las ramas de varios sin repetir', () => {
    const branch = branchesOf(tree, [BigInt(1), BigInt(2), BigInt(10)]);
    expect(new Set(branch).size).toBe(branch.length);
    expect(branch.sort()).toEqual([BigInt(1), BigInt(2), BigInt(3), BigInt(10), BigInt(11)].sort());
  });

  it('sin ids, ninguna rama', () => {
    expect(branchesOf(tree, [])).toEqual([]);
  });
});
