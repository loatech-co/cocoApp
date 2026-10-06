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

describe('Cycle detection', () => {
  it('moving a category to the root is no cycle', () => {
    expect(wouldCreateCycle(tree, BigInt(2), null)).toBe(false);
  });

  it('hanging it from another branch is no cycle', () => {
    expect(wouldCreateCycle(tree, BigInt(4), BigInt(1))).toBe(false);
  });

  it('being its own parent is a cycle', () => {
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(1))).toBe(true);
  });

  it('hanging from its own child is a cycle', () => {
    // Hogar(1) cannot hang from Servicios(2), its child.
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(2))).toBe(true);
  });

  it('hanging from its own grandchild is a cycle too', () => {
    expect(wouldCreateCycle(tree, BigInt(1), BigInt(3))).toBe(true);
  });

  it('ends even when the data already has a cycle, instead of hanging', () => {
    // 10 → 11 → 10: corrupt data.
    const corrupt = [n(10, 11), n(11, 10), n(12)];
    expect(wouldCreateCycle(corrupt, BigInt(12), BigInt(10))).toBe(true);
  });
});

describe('Depth', () => {
  it('the root is at level 1', () => {
    expect(depthOf(tree, BigInt(1))).toBe(1);
  });

  it('a child is at level 2', () => {
    expect(depthOf(tree, BigInt(2))).toBe(2);
  });

  it('a grandchild is at level 3', () => {
    expect(depthOf(tree, BigInt(3))).toBe(3);
  });

  it('with no parent, the depth is 0', () => {
    expect(depthOf(tree, null)).toBe(0);
  });

  it('moving a leaf under a root leaves it at level 2', () => {
    expect(resultingDepth(tree, BigInt(4), BigInt(1))).toBe(2);
  });

  it('moving a branch drags its children and adds their height', () => {
    // Servicios(2) has Energía(3) below it. Hanging it from Alimentación(4)
    // would leave Energía at level 3.
    expect(resultingDepth(tree, BigInt(2), BigInt(4))).toBe(3);
  });

  it('a childless category moved to the root ends at level 1', () => {
    expect(resultingDepth(tree, BigInt(3), null)).toBe(1);
  });
});

describe('Descendants', () => {
  it('finds children and grandchildren', () => {
    const ids = descendantsOf(tree, BigInt(1)).map(Number).sort();
    expect(ids).toEqual([2, 3]);
  });

  it('a leaf has no descendants', () => {
    expect(descendantsOf(tree, BigInt(3))).toEqual([]);
  });
});

describe('Nesting', () => {
  it('builds the tree from a flat list', () => {
    const roots = nest(tree);

    expect(roots).toHaveLength(2);
    const home = roots.find((root) => root.id === BigInt(1))!;
    expect(home.children).toHaveLength(1);
    expect(home.children[0]!.id).toBe(BigInt(2));
    expect(home.children[0]!.children[0]!.id).toBe(BigInt(3));
  });

  it('an orphan (filtered out by kind) moves up to the root instead of getting lost', () => {
    // Only Energía(3), whose parent Servicios(2) was filtered out.
    const roots = nest([n(3, 2)]);

    expect(roots).toHaveLength(1);
    expect(roots[0]!.id).toBe(BigInt(3));
  });

  it('an empty list gives an empty tree', () => {
    expect(nest([])).toEqual([]);
  });

  describe('The three levels of the model', () => {
    it('allows cost center → category → concept, and nothing more', () => {
      expect(MAX_DEPTH).toBe(3);
    });

    it('names each level by its domain name', () => {
      expect(levelName(1)).toBe('centro de costos');
      expect(levelName(2)).toBe('categoría');
      expect(levelName(3)).toBe('concepto');
    });

    it('a concept fits: a grandchild of the root has depth 3', () => {
      // 1 (center) → 2 (category) → 3 (concept)
      expect(depthOf(tree, BigInt(3))).toBeLessThanOrEqual(MAX_DEPTH);
    });
  });
});

describe('Filtering by several categories', () => {
  const tree = [
    { id: BigInt(1), parentId: null },
    { id: BigInt(2), parentId: BigInt(1) },
    { id: BigInt(3), parentId: BigInt(2) },
    { id: BigInt(10), parentId: null },
    { id: BigInt(11), parentId: BigInt(10) },
  ];

  it('reads a comma-separated list', () => {
    expect(categoryIds('1,10')).toEqual([BigInt(1), BigInt(10)]);
  });

  it('drops anything that is not a number instead of failing', () => {
    // A mistyped parameter in a pasted URL cannot stop someone from seeing
    // their transactions.
    expect(categoryIds('1,abc,,10')).toEqual([BigInt(1), BigInt(10)]);
    expect(categoryIds('')).toEqual([]);
    expect(categoryIds(undefined)).toEqual([]);
  });

  it('does not repeat ids', () => {
    expect(categoryIds('4,4,4')).toEqual([BigInt(4)]);
  });

  it('each id brings its whole branch', () => {
    // Transactions hang from the concept: without expanding, filtering by a
    // center would return zero rows.
    expect(branchesOf(tree, [BigInt(1)]).sort()).toEqual([BigInt(1), BigInt(2), BigInt(3)].sort());
  });

  it('joins the branches of several without repeats', () => {
    const branch = branchesOf(tree, [BigInt(1), BigInt(2), BigInt(10)]);
    expect(new Set(branch).size).toBe(branch.length);
    expect(branch.sort()).toEqual([BigInt(1), BigInt(2), BigInt(3), BigInt(10), BigInt(11)].sort());
  });

  it('no ids, no branch', () => {
    expect(branchesOf(tree, [])).toEqual([]);
  });
});
