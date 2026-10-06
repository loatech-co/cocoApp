import { Injectable } from '@nestjs/common';

import {
  categoryFromRow,
  type Category,
  type CategoryChanges,
  type CategoryPosition,
  type CategoryMerge,
  type CategorySeed,
  type CategoryTree,
  type CategoryUsage,
  type NewCategory,
} from './categories.domain';
import { CategoriesRepository } from './categories.repository';
import { multiPaymentRejection } from './multi-payment';
import {
  nest,
  descendantsOf,
  wouldCreateCycle,
  resultingDepth,
  MAX_DEPTH,
} from '../../common/categories/categories.tree';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/domain-error';
import type { Category as CategoryRow, CategoryKind } from '../../generated/prisma/client';

@Injectable()
export class CategoriesService {
  constructor(private readonly repo: CategoriesRepository) {}

  /** Returns the nested tree, not the flat list: it is how the UI consumes it. */
  async listTree(
    userId: bigint,
    filters: { kind?: CategoryKind | undefined; includeArchived?: boolean },
  ): Promise<CategoryTree> {
    const categories = (await this.repo.list(userId, filters)).map(categoryFromRow);
    return { tree: nest(categories), total: categories.length };
  }

  async get(userId: bigint, id: bigint): Promise<Category> {
    return categoryFromRow(await this.requireCategory(userId, id));
  }

  async create(userId: bigint, input: NewCategory): Promise<Category> {
    const parentId = input.parentId ?? null;
    // Without a parent it is a cost center, which is the first level.
    let depth = 1;

    if (parentId !== null) {
      const parent = await this.requireCategory(userId, parentId);
      const skeleton = await this.repo.treeSkeleton(userId);

      // A new category has no children: its depth is the parent's + 1.
      depth = resultingDepth(
        [...skeleton, { id: BigInt(-1), parentId: parent.id }],
        BigInt(-1),
        parent.id,
      );
      this.requireValidDepth(depth);
    }

    this.requireConsistentMultiPayment({
      isMultiPayment: input.isMultiPayment ?? false,
      isAutoPaid: input.isAutoPaid ?? false,
      isRecurring: input.isRecurring ?? false,
      depth,
    });

    const category = await this.repo.create(userId, {
      userId,
      name: input.name,
      kind: input.kind,
      parentId,
      color: input.color ?? null,
      icon: input.icon ?? null,
      sortOrder: input.sortOrder ?? 0,
      // The row is built field by field, so a new input field does not
      // arrive on its own: it has to be named here or it is silently lost, with
      // the API answering 201 and the concept created without its recurrence.
      isRecurring: input.isRecurring ?? false,
      isStatic: input.isStatic ?? false,
      periodicity: input.periodicity ?? null,
      paymentDay: input.paymentDay ?? null,
      paymentMonth: input.paymentMonth ?? null,
      budget: input.budget ?? null,
      isAutoPaid: input.isAutoPaid ?? false,
      isMultiPayment: input.isMultiPayment ?? false,
      keywords: input.keywords ?? [],
    });

    return categoryFromRow(category);
  }

  async update(userId: bigint, id: bigint, changes: CategoryChanges): Promise<Category> {
    const actual = await this.requireCategory(userId, id);

    /*
      The tree is fetched ONCE and shared, because two different checks need
      it —moving the parent and the multi-payment flag— and fetching it twice
      in the same request is a free extra query.

      Lazily, though: most updates touch neither the parent nor that flag,
      and then no query is needed.
    */
    let skeleton: Awaited<ReturnType<typeof this.repo.treeSkeleton>> | null = null;
    const tree = async (): Promise<NonNullable<typeof skeleton>> =>
      (skeleton ??= await this.repo.treeSkeleton(userId));

    if (changes.parentId !== undefined) {
      const newParentId = changes.parentId;
      if (newParentId !== null) await this.requireCategory(userId, newParentId);

      if (wouldCreateCycle(await tree(), id, newParentId)) {
        throw new ValidationError(
          'Una categoría no puede colgar de sí misma ni de una de sus descendientes.',
          { code: 'category_cycle' },
        );
      }

      this.requireValidDepth(resultingDepth(await tree(), id, newParentId));
    }

    /*
      What is checked is how the row ends up, not what the request brought.

      Turning `isAutoPaid` on for a concept that is ALREADY paid in several
      installments does not bring `isMultiPayment` in the body, so looking
      only at the request it would pass, and the row would end up with both
      flags on —which is exactly what cannot happen—. That is why each field
      is read from the changes when present and from the existing row when not.
    */
    const isMultiPaymentAfter = changes.isMultiPayment ?? actual.isMultiPayment;
    if (isMultiPaymentAfter) {
      const finalParentId = changes.parentId !== undefined ? changes.parentId : actual.parentId;

      this.requireConsistentMultiPayment({
        isMultiPayment: true,
        isAutoPaid: changes.isAutoPaid ?? actual.isAutoPaid,
        isRecurring: changes.isRecurring ?? actual.isRecurring,
        depth: resultingDepth(await tree(), id, finalParentId),
      });
    }

    await this.repo.update(userId, id, columnsOf(changes));

    return this.get(userId, id);
  }

  async reorder(userId: bigint, positions: readonly CategoryPosition[]): Promise<void> {
    await this.repo.reorder(userId, positions);
  }

  /**
   * The default operation is to ARCHIVE, not delete: the reports of past
   * periods would stop adding up if a category in use disappeared.
   * Physical deletion is only allowed when it was never used.
   */
  async archive(userId: bigint, id: bigint, shouldCascade: boolean): Promise<void> {
    await this.requireCategory(userId, id);

    const skeleton = await this.repo.treeSkeleton(userId);
    const childIds = skeleton.filter((node) => node.parentId === id).map((node) => node.id);

    if (childIds.length > 0 && !shouldCascade) {
      throw new ConflictError(
        `Esta categoría tiene ${childIds.length} subcategoría(s). Archívala en cascada o reasigna sus hijas primero.`,
        { code: 'category_has_children' },
      );
    }

    await this.repo.archiveMany(userId, shouldCascade ? [id, ...childIds] : [id]);
  }

  /**
   * What a deletion would take with it, before doing it.
   *
   * The interface asks when it opens the confirmation: without this it would
   * have to choose between saying nothing —and then deleting is blind— or
   * trying and learning from the error, which is worse, because the error
   * arrives after pressing «Eliminar».
   */
  async usageOf(userId: bigint, id: bigint): Promise<CategoryUsage> {
    await this.requireCategory(userId, id);

    const skeleton = await this.repo.treeSkeleton(userId);
    const descendants = descendantsOf(skeleton, id);

    return {
      transactions: await this.repo.countUsage(userId, [id, ...descendants]),
      subcategories: descendants.length,
    };
  }

  /**
   * Deletes a category —and everything that hangs from it—, reassigning its
   * transactions.
   *
   * ── Why it no longer refuses ────────────────────────────────────────────
   * It used to refuse as soon as a transaction used it: "archive it instead of
   * deleting it". That left the structure with no way to be corrected —a
   * concept created by mistake with one transaction inside could never be
   * removed— and forced the interface to explain a rule of the system instead
   * of solving the problem of whoever is using it.
   *
   * Now it deletes, and what was missing was asking WHERE its transactions
   * GO. That is a datum, not an obstacle.
   *
   * ── When it is still an error ───────────────────────────────────────────
   * When there are transactions and it is not said where they go. They are
   * not picked on their own: the system does not know whether the
   * misclassified rent belongs to «Vivienda» or to «Oficina», and guessing
   * means moving money somewhere nobody asked for.
   *
   * And when the target is INSIDE what is about to be deleted: reassigning to
   * something that disappears in the same operation leaves the transactions
   * unclassified through the `ON DELETE SET NULL`, which is exactly what was
   * to be avoided.
   */
  async remove(
    userId: bigint,
    id: bigint,
    reassignTo?: bigint,
  ): Promise<{ deleted: number; reassigned: number }> {
    await this.requireCategory(userId, id);

    const skeleton = await this.repo.treeSkeleton(userId);
    const subtree = [id, ...descendantsOf(skeleton, id)];
    const usageCount = await this.repo.countUsage(userId, subtree);

    if (usageCount > 0 && reassignTo === undefined) {
      throw new ConflictError(
        `Esta categoría tiene ${usageCount} movimiento(s). Indica a qué categoría pasan.`,
        { code: 'reassignment_required' },
      );
    }

    if (reassignTo !== undefined) {
      await this.requireCategory(userId, reassignTo);

      if (subtree.some((candidate) => candidate === reassignTo)) {
        throw new ConflictError(
          'El destino está dentro de lo que se va a eliminar. Elige uno de fuera.',
          { code: 'reassignment_target_inside' },
        );
      }
    }

    return this.repo.deleteSubtreeReassigning(userId, subtree, reassignTo ?? null);
  }

  /**
   * A new account's structure: the template, copied as is. The registration
   * calls it right after creating the profile, so there is nothing to check.
   * Returns how many rows it created.
   */
  seedNewAccount(userId: bigint): Promise<number> {
    return this.repo.seedTemplate(userId);
  }

  /**
   * Seeds the suggested dictionary of Annex A.
   *
   * It only runs if the user has no categories: it is not a migration that is
   * reapplied, it is a starting point. And it is optional by design — whoever
   * prefers to build their own taxonomy simply does not call it.
   */
  async seed(userId: bigint): Promise<CategorySeed> {
    const existentes = await this.repo.countForUser(userId);
    if (existentes > 0) {
      throw new ConflictError(
        'Ya tienes centros de costos. La plantilla solo se siembra en una cuenta vacía.',
        { code: 'template_requires_empty' },
      );
    }

    // The SAME template that is copied when the account is created. Two lists
    // drift apart as soon as someone touches one: the new account would be born
    // with one structure and the one left empty would be filled with another.
    return { created: await this.repo.seedTemplate(userId) };
  }

  private requireConsistentMultiPayment(state: {
    isMultiPayment: boolean;
    isAutoPaid: boolean;
    isRecurring: boolean;
    depth: number;
  }): void {
    const rejection = multiPaymentRejection(state);
    if (rejection !== null) throw new ValidationError(rejection.message, { code: rejection.code });
  }

  private requireValidDepth(depth: number): void {
    if (depth > MAX_DEPTH) {
      throw new ValidationError(
        `El árbol admite hasta ${MAX_DEPTH} niveles: centro de costos, categoría y concepto. ` +
          'Anidar más vuelve los reportes ilegibles.',
        { code: 'category_too_deep' },
      );
    }
  }

  private async requireCategory(userId: bigint, id: bigint): Promise<CategoryRow> {
    const category = await this.repo.findById(userId, id);
    if (!category) throw new NotFoundError('La categoría no existe.');
    return category;
  }

  /**
   * Merges one concept into another: everything that hung from the first
   * moves to the second and the first disappears.
   *
   * ── Why it exists ───────────────────────────────────────────────────────
   * Because duplicates show up on their own. One import creates "Movistar",
   * another creates "MOVISTAR S.A.", and from then on the same bill is split
   * across two concepts that add up separately: no total adds up and the donut
   * shows two slices where there is one.
   *
   * ── Why renaming is not enough ──────────────────────────────────────────
   * Renaming leaves two concepts with the same name, which is worse: they look
   * the same and keep adding up apart. The only way out is to move the
   * transactions and delete the one that is left over.
   *
   * All in ONE transaction. Halfway there would be transactions pointing at
   * an already deleted category, and that is not fixed by looking at the
   * screen.
   */
  async merge(userId: bigint, sourceId: bigint, targetId: bigint): Promise<CategoryMerge> {
    if (sourceId === targetId) {
      throw new ValidationError('Un concepto no se puede unificar consigo mismo.', {
        code: 'merge_into_itself',
      });
    }

    const source = await this.requireCategory(userId, sourceId);
    const target = await this.requireCategory(userId, targetId);

    // Only between concepts. Merging a category into another would move its
    // children without anybody asking for it, and a cost center does not even
    // have transactions of its own to move.
    if (source.parentId === null || target.parentId === null) {
      throw new ValidationError(
        'Solo se pueden unificar conceptos, no centros de costos ni categorías.',
        { code: 'merge_requires_concepts' },
      );
    }

    // A concept with things inside is not a concept: it is a misplaced
    // category, and merging it would move its children without anybody asking.
    const allCategories = await this.repo.list(userId, { includeArchived: true });
    const childCount = allCategories.filter((c) => c.parentId === sourceId).length;
    if (childCount > 0) {
      throw new ValidationError(
        'Ese concepto tiene otras categorías dentro. Vacíalo antes de unificarlo.',
        { code: 'merge_source_has_children' },
      );
    }

    const moved = await this.repo.merge(userId, sourceId, targetId);
    return { moved, target: categoryFromRow(target) };
  }
}

/**
 * The columns a PATCH changes, named one by one: a key that is not listed
 * here does not reach the row, whatever the caller put in the object.
 */
function columnsOf(changes: CategoryChanges): Parameters<CategoriesRepository['update']>[2] {
  return {
    ...(changes.name !== undefined && { name: changes.name }),
    ...(changes.kind !== undefined && { kind: changes.kind }),
    // The COLUMN, not the relation: see why in `repo.update`.
    ...(changes.parentId !== undefined && { parentId: changes.parentId }),
    ...(changes.color !== undefined && { color: changes.color }),
    ...(changes.icon !== undefined && { icon: changes.icon }),
    ...(changes.sortOrder !== undefined && { sortOrder: changes.sortOrder }),
    ...(changes.isArchived !== undefined && { isArchived: changes.isArchived }),
    ...(changes.isRecurring !== undefined && { isRecurring: changes.isRecurring }),
    ...(changes.isStatic !== undefined && { isStatic: changes.isStatic }),
    ...(changes.periodicity !== undefined && { periodicity: changes.periodicity }),
    ...(changes.paymentDay !== undefined && { paymentDay: changes.paymentDay }),
    ...(changes.paymentMonth !== undefined && { paymentMonth: changes.paymentMonth }),
    // `!== undefined` and not a truthy check: `null` clears it and ZERO is a value.
    ...(changes.budget !== undefined && { budget: changes.budget }),
    ...(changes.isAutoPaid !== undefined && { isAutoPaid: changes.isAutoPaid }),
    ...(changes.isMultiPayment !== undefined && { isMultiPayment: changes.isMultiPayment }),
    ...(changes.keywords !== undefined && { keywords: changes.keywords }),
  };
}
