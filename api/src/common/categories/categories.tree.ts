/**
 * Pure logic of the category tree.
 *
 * It lives apart from the service so it can be tested without a database:
 * they are shape rules (cycles, depth, nesting) that do not depend on Prisma.
 */

/** The least of a category needed to reason about the tree. */
export interface CategoryNode {
  id: bigint;
  parentId: bigint | null;
}

/**
 * Maximum depth: THREE levels, which is the shape of the model.
 *
 *   Cost center   →  Category  →  Concept
 *   Costos fijos      Servicios públicos   Celsia (Energía)
 *
 * A transaction hangs from the CONCEPT, which is the leaf. The two levels
 * above are not used to classify: they exist to add up. "How much went on
 * utilities?" is the sum of its concepts, and "how much on fixed costs?" the
 * sum of its categories.
 *
 * No more than three: a fourth level forces deciding which branch each thing
 * goes in before it can be recorded, and that friction is what makes people
 * stop recording.
 */
export const MAX_DEPTH = 3;

/** The three levels, by their domain name (user-facing). `depthOf` returns 1, 2 or 3. */
export const LEVELS = ['centro de costos', 'categoría', 'concepto'] as const;

/** The name of the level at a given depth. */
export function levelName(depth: number): string {
  return LEVELS[depth - 1] ?? 'nivel';
}

const key = (id: bigint): string => id.toString();

function indexById<T extends CategoryNode>(categories: readonly T[]): Map<string, T> {
  return new Map(categories.map((category) => [key(category.id), category]));
}

/**
 * Would making `newParentId` the parent of `id` create a cycle?
 *
 * It climbs the proposed parent's chain of ancestors: if the category itself
 * shows up on the way, the tree would bite its own tail and leave a ring of
 * rows unreachable from the root. Being its own parent, the trivial case,
 * counts too.
 *
 * The walk keeps a visited set: if the data were ALREADY corrupt with a
 * cycle, this still ends instead of hanging.
 */
export function wouldCreateCycle(
  categories: readonly CategoryNode[],
  id: bigint,
  newParentId: bigint | null,
): boolean {
  if (newParentId === null) return false;
  if (newParentId === id) return true;

  const byId = indexById(categories);
  const visited = new Set<string>();

  let actual: bigint | null = newParentId;
  while (actual !== null) {
    if (actual === id) return true;

    const k = key(actual);
    if (visited.has(k)) return true;
    visited.add(k);

    actual = byId.get(k)?.parentId ?? null;
  }

  return false;
}

/** How many levels from the root down to this category (the root is 1). */
export function depthOf(categories: readonly CategoryNode[], id: bigint | null): number {
  if (id === null) return 0;

  const byId = indexById(categories);
  const visited = new Set<string>();

  let depth = 0;
  let actual: bigint | null = id;

  while (actual !== null) {
    const k = key(actual);
    if (visited.has(k)) break;
    visited.add(k);

    depth += 1;
    actual = byId.get(k)?.parentId ?? null;
  }

  return depth;
}

/** A category's descendants, at any level. */
export function descendantsOf(categories: readonly CategoryNode[], id: bigint): bigint[] {
  const childrenByParent = new Map<string, bigint[]>();
  for (const category of categories) {
    if (category.parentId === null) continue;
    const k = key(category.parentId);
    childrenByParent.set(k, [...(childrenByParent.get(k) ?? []), category.id]);
  }

  const result: bigint[] = [];
  const pending = [...(childrenByParent.get(key(id)) ?? [])];
  const visited = new Set<string>();

  for (let actual = pending.pop(); actual !== undefined; actual = pending.pop()) {
    const k = key(actual);
    if (visited.has(k)) continue;
    visited.add(k);

    result.push(actual);
    pending.push(...(childrenByParent.get(k) ?? []));
  }

  return result;
}

/**
 * The resulting branch: the depth the subtree of `id` would reach if it hung
 * from `newParentId`. Used to reject moves that would go past the limit by
 * dragging children along.
 */
export function resultingDepth(
  categories: readonly CategoryNode[],
  id: bigint,
  newParentId: bigint | null,
): number {
  const parentDepth = depthOf(categories, newParentId);

  const byId = indexById(categories);
  const subtreeHeight = descendantsOf(categories, id).reduce((highest, descendant) => {
    // Distance from the descendant up to `id`.
    let distance = 0;
    let actual: bigint | null = descendant;
    const visited = new Set<string>();

    while (actual !== null && actual !== id) {
      const k = key(actual);
      if (visited.has(k)) break;
      visited.add(k);
      distance += 1;
      actual = byId.get(k)?.parentId ?? null;
    }

    return Math.max(highest, distance);
  }, 0);

  return parentDepth + 1 + subtreeHeight;
}

/** A category with its children nested, the way the client expects it. */
export type WithChildren<T> = T & { children: WithChildren<T>[] };

/**
 * Nests a flat list. Categories whose parent is not in the list (because it
 * was filtered by `kind`, for instance) move up to the root instead of
 * vanishing: losing categories silently would be worse than showing them
 * outside their branch.
 */
export function nest<T extends CategoryNode>(categories: readonly T[]): WithChildren<T>[] {
  const nodes = new Map<string, WithChildren<T>>(
    categories.map((category) => [key(category.id), { ...category, children: [] }]),
  );

  const roots: WithChildren<T>[] = [];

  for (const category of categories) {
    const node = nodes.get(key(category.id));
    if (node === undefined) continue; // `nodes` comes from this same list: it is always there
    const parent = category.parentId !== null ? nodes.get(key(category.parentId)) : undefined;

    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

/**
 * The ids of a category filter: `"3,7,12"` → `[3n, 7n, 12n]`.
 *
 * ── Why a list and not one id ────────────────────────────────────────────────
 * Because the filter panel is checkboxes: several centers can be ticked at
 * once, or two categories from different centers. With a single id one would
 * have to choose between "Casa" and "Transporte" when the real question is
 * usually "how much do the two cost me together?".
 *
 * Anything that is not a number is dropped silently. A mistyped parameter in
 * a pasted URL should not stop someone from seeing their transactions, and the
 * widest filter —no filter— never hides data.
 */
export function categoryIds(raw?: string | number | null): bigint[] {
  if (raw === undefined || raw === null || raw === '') return [];

  const parts = String(raw).split(',');
  const ids: bigint[] = [];

  for (const part of parts) {
    const trimmed = part.trim();
    if (!/^\d+$/.test(trimmed)) continue;
    const id = BigInt(trimmed);
    if (!ids.includes(id)) ids.push(id);
  }

  return ids;
}

/**
 * Each id with its whole branch below it, without repeats.
 *
 * Transactions hang from the CONCEPT, never from the center or the category,
 * so filtering by a center without expanding its branch returns zero rows —
 * which is exactly what used to happen before this.
 */
export function branchesOf(categories: readonly CategoryNode[], ids: readonly bigint[]): bigint[] {
  const branch = new Set<string>();

  for (const id of ids) {
    branch.add(id.toString());
    for (const child of descendantsOf(categories, id)) branch.add(child.toString());
  }

  return [...branch].map((id) => BigInt(id));
}
