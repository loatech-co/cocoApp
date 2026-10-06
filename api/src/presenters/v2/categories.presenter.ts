import type {
  Category,
  CategoryMerge,
  CategoryNode,
  CategorySeed,
  CategoryUsage,
} from '../../modules/categories/categories.domain';

/** v2 bodies of the categories (see `transactions.presenter.ts`). */

export function categoryV2(category: Category): Category {
  return category;
}

export function categoryNodeV2(node: CategoryNode): CategoryNode {
  return { ...categoryV2(node), children: node.children.map(categoryNodeV2) };
}

export function categoryMergeV2(merge: CategoryMerge): CategoryMerge {
  return { moved: merge.moved, target: categoryV2(merge.target) };
}

export function categoryUsageV2(usage: CategoryUsage): CategoryUsage {
  return usage;
}

export function categorySeedV2(seed: CategorySeed): CategorySeed {
  return seed;
}
