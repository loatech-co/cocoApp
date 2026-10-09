import { Injectable } from '@nestjs/common';

import { NEW_ACCOUNT_TEMPLATE, type TemplateNode } from './categories.template';
import { mergeKeywords } from './keywords';
import type { CategoryNode } from '../../common/categories/categories.tree';
import type { Category, CategoryKind, Prisma } from '../../generated/prisma/client';
import { Database, type UserTx } from '../../prisma/database';

@Injectable()
export class CategoriesRepository {
  constructor(private readonly db: Database) {}

  async list(
    userId: bigint,
    filters: { kind?: CategoryKind | undefined; includeArchived?: boolean } = {},
  ): Promise<Category[]> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findMany({
        where: {
          userId,
          ...(filters.kind ? { kind: filters.kind } : {}),
          ...(filters.includeArchived ? {} : { isArchived: false }),
        },
        orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      }),
    );
  }

  /**
   * Only id and parentId: checking cycles and depth does not need the whole
   * tree with names and colors.
   */
  async treeSkeleton(userId: bigint): Promise<CategoryNode[]> {
    return this.db.forUser(userId, (tx) =>
      tx.category.findMany({ where: { userId }, select: { id: true, parentId: true } }),
    );
  }

  async findById(userId: bigint, id: bigint): Promise<Category | null> {
    return this.db.forUser(userId, (tx) => tx.category.findFirst({ where: { id, userId } }));
  }

  async create(userId: bigint, data: Prisma.CategoryUncheckedCreateInput): Promise<Category> {
    return this.db.forUser(userId, (tx) => tx.category.create({ data: { ...data, userId } }));
  }

  /**
   * ── Why the type is `UncheckedUpdateMany` and not `UpdateInput` ──────────
   * Because this is an `updateMany`, and `updateMany` does NOT accept nested
   * relation writes: no `connect`, no `disconnect`, no `create`. Only columns.
   *
   * It was declared as `CategoryUpdateInput`, which does accept them, so
   * TypeScript allowed a `parent: { connect: … }` that Prisma rejects at run
   * time with "Unknown argument `parent`". The result was a 500 when moving a
   * concept to another category, and nobody saw it because the type lied.
   *
   * `Unchecked` is the variant that exposes foreign keys as what they are
   * —`parentId`, a number—, which is how a parent is changed from here.
   */
  async update(
    userId: bigint,
    id: bigint,
    data: Prisma.CategoryUncheckedUpdateManyInput,
  ): Promise<number> {
    const { count } = await this.db.forUser(userId, (tx) =>
      tx.category.updateMany({ where: { id, userId }, data }),
    );
    return count;
  }

  /**
   * How many transactions hang from these categories.
   *
   * It takes a LIST and not an id because what is counted is a subtree: the
   * transactions of a cost center are not in the cost center, they are in the
   * concepts three levels below. Counting only the top id, a cost center with
   * forty transactions gave zero.
   */
  async countUsage(userId: bigint, categoryIds: readonly bigint[]): Promise<number> {
    if (categoryIds.length === 0) return 0;
    const ids = [...categoryIds];

    const [inTransactions, enSplits] = await this.db.forUser(userId, (tx) =>
      Promise.all([
        tx.transaction.count({ where: { userId, categoryId: { in: ids } } }),
        tx.transactionSplit.count({
          where: { categoryId: { in: ids }, transaction: { userId } },
        }),
      ]),
    );
    return inTransactions + enSplits;
  }

  /**
   * Deletes a whole subtree, first reassigning what hung from it.
   *
   * ── Why the subtree and not the row ─────────────────────────────────────
   * Because `parent_id` is declared `ON DELETE SET NULL`: deleting only the
   * category, its concepts were left with a null parent and were PROMOTED to
   * cost centers. A deletion that creates three new cost centers is not what
   * anybody asked for.
   *
   * ── Why in one transaction ──────────────────────────────────────────────
   * Because if the reassignment goes through and the deletion fails, the
   * transactions sit at their new target with the old category still alive
   * —and nobody knows they moved—. The other way round is worse:
   * `category_id` is `ON DELETE SET NULL`, so a deletion without a prior
   * reassignment leaves the transactions unclassified, silently.
   */
  async deleteSubtreeReassigning(
    userId: bigint,
    ids: readonly bigint[],
    reassignTo: bigint | null,
  ): Promise<{ deleted: number; reassigned: number }> {
    const idList = [...ids];

    return this.db.forUser(userId, async (tx) => {
      let reassigned = 0;

      if (reassignTo !== null) {
        const [transactions, splits] = await Promise.all([
          tx.transaction.updateMany({
            where: { userId, categoryId: { in: idList } },
            data: { categoryId: reassignTo },
          }),
          tx.transactionSplit.updateMany({
            where: { categoryId: { in: idList }, transaction: { userId } },
            data: { categoryId: reassignTo },
          }),
        ]);
        reassigned = transactions.count + splits.count;
      }

      const { count } = await tx.category.deleteMany({ where: { userId, id: { in: idList } } });
      return { deleted: count, reassigned };
    });
  }

  /** Reorders in a single transaction: either the whole new order lands, or none of it. */
  async reorder(
    userId: bigint,
    items: readonly { id: bigint; sortOrder: number }[],
  ): Promise<void> {
    await this.db.forUser(userId, async (tx) => {
      for (const item of items) {
        await tx.category.updateMany({
          where: { id: item.id, userId },
          data: { sortOrder: item.sortOrder },
        });
      }
    });
  }

  async countForUser(userId: bigint): Promise<number> {
    return this.db.forUser(userId, (tx) => tx.category.count({ where: { userId } }));
  }

  /**
   * Copies the new-account template. Returns how many rows it created.
   *
   * Two places that do not know each other call it: the registration, so an
   * account is born with its structure (through
   * `CategoriesService.seedNewAccount`), and `POST /categories/seed`, to fill
   * one that was left empty. `categories.template.ts` is the STRUCTURE and the
   * why of each decision; this is the database access.
   *
   * ── Why level by level and not a `createMany` ─────────────────────────────
   * Because a child needs its parent's `id`, and `createMany` does not return
   * the ids it just assigned. The tree is nine rows: saving one query does not
   * pay for solving that by hand.
   */
  async seedTemplate(userId: bigint): Promise<number> {
    return this.db.forUser(userId, (tx) => copyTemplate(tx, userId, NEW_ACCOUNT_TEMPLATE, null));
  }

  /**
   * Moves everything that hangs from one concept to another and deletes the
   * first.
   *
   * In ONE transaction. Halfway there would be transactions pointing at an
   * already deleted category, and that is not fixed by looking at the screen.
   */
  async merge(userId: bigint, sourceId: bigint, targetId: bigint): Promise<number> {
    return this.db.forUser(userId, async (tx) => {
      const moved = await tx.transaction.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });

      // Splits spread a transaction across categories: if one pointed at the
      // concept that goes away, it has to move or it would be left unclassified.
      // Neither splits nor import rows carry `user_id`: they are filtered by the
      // owner of the transaction or of the batch. Without that filter, someone
      // else's row pointing at the source (from when splits did not validate
      // the category) would jump into this user's tree.
      await tx.transactionSplit.updateMany({
        where: { categoryId: sourceId, transaction: { userId } },
        data: { categoryId: targetId },
      });

      await tx.importRow.updateMany({
        where: { categoryId: sourceId, batch: { userId } },
        data: { categoryId: targetId },
      });

      // Learned rules are unique per (user, pattern), so changing their
      // category never clashes with the target's.
      await tx.categoryRule.updateMany({
        where: { userId, categoryId: sourceId },
        data: { categoryId: targetId },
      });

      /*
        The keywords of the one that goes away move to the one that stays.

        They are what makes the next receipt from that creditor be recognized
        on its own, and merging «Movistar» into «MOVISTAR S.A.» says they are
        the same: the words that recognized the first recognize the second.
        Letting them die with the row, the merge fixed the totals and broke the
        reading, and that does not show until the next month —when a receipt
        that used to come in classified stops doing so— and by then nobody
        links it to having merged two concepts.

        `mergeKeywords` joins them without repeats: the creditor's name is
        usually in both, which is exactly why duplicates were created.
      */
      const [source, target] = await Promise.all([
        tx.category.findUnique({ where: { id: sourceId }, select: { keywords: true } }),
        tx.category.findUnique({ where: { id: targetId }, select: { keywords: true } }),
      ]);

      const merged = mergeKeywords(target?.keywords ?? [], source?.keywords ?? []);
      if (merged.length !== (target?.keywords.length ?? 0)) {
        await tx.category.update({ where: { id: targetId }, data: { keywords: merged } });
      }

      await tx.category.delete({ where: { id: sourceId } });

      return moved.count;
    });
  }
}

async function copyTemplate(
  tx: UserTx,
  userId: bigint,
  nodes: readonly TemplateNode[],
  parentId: bigint | null,
): Promise<number> {
  let created = 0;

  for (const [position, node] of nodes.entries()) {
    const row = await tx.category.create({
      data: {
        userId,
        name: node.name,
        // Everything in the template is an expense. Income is not classified in
        // this app yet —the option is off and labelled «Pronto»—, so seeding an
        // income tree would be seeding something that cannot be used.
        kind: 'expense',
        parentId,
        icon: node.icon ?? null,
        isStatic: node.isStatic ?? false,
        // Explicit and consecutive, not the factory 0: with everything at zero
        // the order ends up decided by the id, which is insertion order by
        // chance and not by decision.
        sortOrder: position,
      },
    });
    created += 1;

    if (node.children?.length) {
      created += await copyTemplate(tx, userId, node.children, row.id);
    }
  }

  return created;
}
