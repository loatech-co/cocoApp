import { useState } from 'react';

import { useDeleteCategory, useCategoryUsage } from '@/features/cost-centers/api/categories';
import { ApiClientError } from '@/shared/api/api-client';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { Alert, AlertDescription, ErrorAlert } from '@/shared/ui/atoms/alert';
import { Field } from '@/shared/ui/atoms/field';
import { Confirmation } from '@/shared/ui/organisms/confirmation';
import { Select } from '@/shared/ui/organisms/select';

interface ConfirmDeletionProps {
  category: CategoryTree;
  /**
   * Which of the three levels the thing to be deleted is on.
   *
   * It is passed in and not deduced because a `CategoryTree` does not say at what depth
   * it lives: to know it one would have to traverse the whole tree looking for it, and whoever
   * opens this dialog already knows —they opened it from the row of a cost center, a
   * category or a concept—.
   *
   * ALL the text comes from here: what the deleted thing is called and what
   * what hangs from it is called. With a single sentence for the three, deleting a cost
   * center said «estás a punto de borrar la categoría “Vivienda”», which is
   * naming wrongly right on the screen where a mistake costs the most.
   */
  level: CategoryLevel;
  /** The whole tree: the possible targets come from there. */
  tree: CategoryTree[];
  isOpen: boolean;
  onClose: () => void;
  /** Called after deleting. For example, to close the form on top. */
  onDeleted?: (() => void) | undefined;
}

/**
 * Confirm the deletion of a cost center, a category or a concept.
 *
 * ── Why it is one component and not three dialogs ───────────────────────────
 * Because the three levels delete the same thing —a category with whatever hangs from
 * it— and the question to ask is the same. They were written three
 * times with the same copied text, and that text was, besides, a description of
 * a system rule instead of help: «Si tiene movimientos, el sistema
 * se niega: no se elimina nada que deje filas sin clasificar».
 *
 * ── And why the system no longer refuses ────────────────────────────────────
 * Refusing left the structure with no way to be corrected: a concept created by mistake
 * with a transaction inside could never be removed. What was missing was not a
 * prohibition, it was a QUESTION: where its transactions go. That is a
 * piece of data, and it is asked for here.
 *
 * It is not chosen on its own. The system does not know whether the misclassified rent
 * belongs to «Vivienda» or to «Oficina», and guessing means moving money to a
 * place nobody asked for.
 *
 * ── What is NOT deleted ─────────────────────────────────────────────────────
 * The transactions. They change category and stay there, with their date and their amount.
 * It has to be said, because «eliminar» next to a number of transactions reads
 * as if the transactions are going away.
 */
/** The three levels of the tree. */
type CategoryLevel = 'costCenter' | 'category' | 'concept';

export function ConfirmDeletion({
  category,
  level,
  tree,
  isOpen,
  onClose,
  onDeleted,
}: ConfirmDeletionProps) {
  const deletion = useDeletionFlow({ category, isOpen, onClose, onDeleted });
  const { usage, target, error, transactions } = deletion;
  const shouldReassign = transactions > 0;

  return (
    <Confirmation
      isOpen={isOpen}
      title={t('centers.deletion.title', { name: category.name })}
      isDestructive
      confirmLabel={t('common.delete')}
      isBusy={deletion.isBusy}
      // With transactions inside it cannot be confirmed until saying where they go.
      // Disabled and not «fails on press»: finding out after pressing «Eliminar»
      // in a dialog that warns it cannot be undone is the worst.
      // Without the count it is unknown whether movements hang below: deleting
      // blind would leave them unclassified with no question asked.
      isConfirmDisabled={usage.isError || (shouldReassign && target === '')}
      onCancel={onClose}
      onConfirm={deletion.confirm}
    >
      <div className="flex flex-col gap-3">
        {/* What goes away, and the question. The three beats of the pattern: what happens, that
            there is no going back, and whether for real. */}
        <p>{whatGetsDeleted(level, category.name, usage.data?.subcategories ?? 0)}</p>

        {usage.isPending && <p>{t('centers.deletion.counting')}</p>}

        {usage.isError && <ErrorAlert message={t('centers.deletion.countFailed')} />}

        {shouldReassign && (
          <ReassignTarget
            transactions={transactions}
            target={target}
            onChange={deletion.setTarget}
            options={possibleTargets(tree, category.id)}
          />
        )}

        {/*
          The question goes AFTER the selector, not before.

          It is the last beat of the pattern —what happens, that there is no going back, and
          whether for real—, and when there are transactions inside, a field that has to be filled in
          gets between the warning and the button. With the question
          above it was answered before it could be answered; down here it falls
          right above the buttons, which is where it is answered.
        */}
        <p>{t('centers.deletion.areYouSure')}</p>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </Confirmation>
  );
}

/** What is deleted, where its transactions go, and how it is confirmed. */
function useDeletionFlow({
  category,
  isOpen,
  onClose,
  onDeleted,
}: Pick<ConfirmDeletionProps, 'category' | 'isOpen' | 'onClose' | 'onDeleted'>) {
  const deleteCategory = useDeleteCategory();
  // It is only asked when the dialog is open: it is one query per
  // category, and the tree has forty.
  const usage = useCategoryUsage(isOpen ? category.id : undefined);

  const [target, setTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Every opening starts clean: a target chosen and canceled the previous
  // time has no reason to reappear pointing at another category.
  useOnChange([isOpen], () => {
    if (isOpen) {
      setTarget('');
      setError(null);
    }
  });

  function confirm(): void {
    setError(null);
    deleteCategory.mutate(
      {
        id: category.id,
        reassignTo: target === '' ? undefined : Number(target),
      },
      {
        onSuccess: () => {
          onClose();
          onDeleted?.();
        },
        onError: (e) =>
          setError(e instanceof ApiClientError ? e.message : t('centers.deletion.failed')),
      },
    );
  }

  return {
    usage,
    transactions: usage.data?.transactions ?? 0,
    isBusy: deleteCategory.isPending || usage.isPending,
    target,
    setTarget,
    error,
    confirm,
  };
}

function ReassignTarget({
  transactions,
  target,
  onChange,
  options,
}: {
  transactions: number;
  target: string;
  onChange: (target: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <>
      <Alert variant="warning">
        <AlertDescription>
          {/* «A donde elijas» and not «a la categoría que elijas»: the
              target can be a cost center, a category or a
              concept —the three levels are in the list—, so
              naming only one would promise less than what is offered. */}
          {transactions === 1
            ? t('centers.deletion.movesOne')
            : t('centers.deletion.movesMany', { n: transactions })}
        </AlertDescription>
      </Alert>

      <Field label={t('centers.deletion.destination')} id="destino-del-borrado">
        <Select
          id="destino-del-borrado"
          label={t('centers.deletion.destination')}
          emptyLabel={t('centers.deletion.chooseDestination')}
          value={target}
          options={options}
          onChange={onChange}
        />
      </Field>
    </>
  );
}

/**
 * The first sentence: what structure goes away with this.
 *
 * ── Each level is called by its name ────────────────────────────────────────
 * And so is what hangs from it. It said «la categoría “Vivienda” y la que
 * tiene dentro» for the three, and it was two things wrong at once: «Vivienda» is a
 * cost center, not a category, and «la que tiene dentro» forces you to
 * guess what «la que» is —another category?, a concept?, a transaction?—
 * right in the sentence that warns this cannot be undone.
 *
 * A concept has nothing inside: it is the last leaf of the tree, so its
 * sentence does not talk about children even if it receives a number.
 */
function whatGetsDeleted(level: CategoryLevel, name: string, count: number): string {
  /*
    Whole sentences, not pieces that get glued together.

    Spanish agrees in gender and in number, and a cost center has
    CATEGORIES while a category has CONCEPTS: gluing an article
    to a word produced «la 3 conceptos» and «el categoría». Written whole there is
    no way for one to agree wrongly.
  */
  const { subject, one, many } = {
    costCenter: {
      subject: t('centers.deletion.thisCostCenter'),
      one: t('centers.deletion.oneCategory'),
      many: (n: number) => t('centers.deletion.manyCategories', { n }),
    },
    category: {
      subject: t('centers.deletion.thisCategory'),
      one: t('centers.deletion.oneConcept'),
      many: (n: number) => t('centers.deletion.manyConcepts', { n }),
    },
    // A concept is the last leaf of the tree: it has nothing inside, so
    // its sentence does not talk about children even if it receives a number.
    concept: { subject: t('centers.deletion.thisConcept'), one: null, many: null },
  }[level];

  const inside =
    count === 0 || one === null
      ? ''
      : t('centers.deletion.andInside', { what: count === 1 ? one : many(count) });

  return t('centers.deletion.summary', { what: subject, name, inside });
}

/**
 * Where it can be reassigned: the whole tree EXCEPT what is about to be deleted.
 *
 * ── Why the whole path in the label ─────────────────────────────────────────
 * Because «Aseo» alone does not tell the one in Casa from the one in Oficina, and the list is
 * flat: a dropdown with «Aseo» twice forces guessing which is which
 * right when money is being moved around.
 *
 * ── Why the three levels are offered ────────────────────────────────────────
 * The normal thing is to move the transactions to another concept, and that is why concepts
 * are most of the list. But when deleting a whole category there may not be an
 * equivalent concept yet, and leaving them hanging from the target category is
 * better than not being able to delete: they stay classified, and the concept is assigned to them
 * later from the table.
 */
function possibleTargets(
  tree: CategoryTree[],
  excludedId: number,
): { value: string; label: string }[] {
  const result: { value: string; label: string }[] = [];

  for (const costCenter of tree) {
    if (costCenter.id === excludedId) continue;
    result.push({ value: String(costCenter.id), label: costCenter.name });

    for (const category of costCenter.children ?? []) {
      if (category.id === excludedId) continue;
      result.push({ value: String(category.id), label: `${costCenter.name} › ${category.name}` });

      for (const concept of category.children ?? []) {
        if (concept.id === excludedId) continue;
        result.push({
          value: String(concept.id),
          label: `${costCenter.name} › ${category.name} › ${concept.name}`,
        });
      }
    }
  }

  return result;
}
