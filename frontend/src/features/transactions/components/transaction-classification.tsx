import type { TransactionSheetState } from '@/features/transactions/hooks/use-transaction-form';
import { originName } from '@/features/transactions/model/precedence';
import { selectedPath } from '@/features/transactions/model/transactions';
import { type CategoryTree } from '@/shared/api/categories';
import { t } from '@/shared/lib/i18n';
import { Field } from '@/shared/ui/atoms/field';
import { TextButton } from '@/shared/ui/atoms/text-button';
import { Combo } from '@/shared/ui/organisms/combo';

import { ConceptSearch } from './concept-search';

interface ClassificationProps {
  sheet: TransactionSheetState;
  tree: CategoryTree[];
  /** The SAVED center is static: neither the search nor the cascade moves. */
  isStatic: boolean;
  createInside: (name: string, parentId: number | undefined) => Promise<void>;
  isCreating: boolean;
}

/** What the search says underneath: where what is set came from. */
function searchHelp(sheet: TransactionSheetState): string | undefined {
  const { classification, categoryId, receiptCandidates } = sheet;
  if (classification.origin && classification.origin !== 'manual' && categoryId !== undefined) {
    return t('transactions.classification.canChange', {
      origin: originName(classification.origin).replace(/^\w/, (c) => c.toUpperCase()),
    });
  }
  return receiptCandidates.length > 0 && classification.origin !== 'manual'
    ? t('transactions.classification.severalConcepts')
    : undefined;
}

/**
 * ── A single search to classify ─────────────────────────────────────────────
 * You type «d1» and «Mercado · Alimentación › Costos variables» shows up: one
 * click and the three levels are set. The cascade of center, category and
 * concept is still there, behind the link below, for whoever wants to go level by
 * level; but it is no longer the door.
 *
 * What the search says underneath —«sugerido por tu historial»— is the rule of
 * never saving a suggested classification without the person seeing it.
 *
 * ── All three lock if the SAVED center is static ────────────────────────────
 * This rule existed and was lost when the sheet was redesigned: the dropdowns
 * started locking only by dependency —«elige antes un centro»— and the
 * static one stopped counting, so a Costos fijos transaction could be
 * reclassified from here even though the table did not allow it. The same money
 * moved or not depending on where you came in.
 *
 * What a static center protects is its structure. Deleting the transaction is
 * allowed —that is the record, not the structure—; moving it to another concept is not.
 */
export function TransactionClassification({
  sheet,
  tree,
  isStatic,
  createInside,
  isCreating,
  recent,
}: ClassificationProps & { recent: readonly number[] }) {
  return (
    <>
      <ConceptSearch
        id="tx-concept"
        tree={tree}
        value={sheet.categoryId}
        disabled={isStatic}
        onSelect={(id) => sheet.propose({ categoryId: id, origin: 'manual' })}
        onCreateConcept={(name, categoryId) => void createInside(name, categoryId)}
        isCreating={isCreating}
        recent={recent}
        candidates={sheet.receiptCandidates}
        description={searchHelp(sheet)}
      />

      {!isStatic && (
        // -mt-3 and not -mt-2: the button measures 24 and its text 16, so the text
        // stays where it was.
        <div className="-mt-3 flex self-start">
          <TextButton
            tone="subtle"
            onClick={() => sheet.setIsCascadeVisible((isVisible) => !isVisible)}
          >
            {sheet.isCascadeVisible
              ? t('transactions.classification.hidePicker')
              : t('transactions.classification.showPicker')}
          </TextButton>
        </div>
      )}

      {(sheet.isCascadeVisible || isStatic) && (
        <ClassificationCascade
          sheet={sheet}
          tree={tree}
          isStatic={isStatic}
          createInside={createInside}
          isCreating={isCreating}
        />
      )}
    </>
  );
}

/**
 * The usual cascade: which center, which category, which concept.
 *
 * The center does not offer creating: a center is the top structure and it is defined
 * three times in the life of an account.
 */
function ClassificationCascade(props: ClassificationProps) {
  const { sheet, tree, isStatic, createInside, isCreating } = props;
  const { costCenter, category, concept } = selectedPath(tree, sheet.categoryId);
  const choose = (id?: number): void => sheet.propose({ categoryId: id, origin: 'manual' });

  return (
    <>
      <CostCenterField costCenter={costCenter} tree={tree} isStatic={isStatic} onSelect={choose} />

      <Field label={t('centers.levels.category')} id="tx-category">
        <Combo
          id="tx-category"
          label={t('centers.levels.category')}
          value={category ? String(category.id) : ''}
          options={(costCenter?.children ?? []).map((g) => ({
            value: String(g.id),
            label: g.name,
          }))}
          disabled={isStatic || !costCenter}
          emptyLabel={
            costCenter
              ? t('transactions.classification.notChosen')
              : t('transactions.classification.chooseCostCenterFirst')
          }
          isCreating={isCreating}
          onChange={(v) => choose(v === '' ? costCenter?.id : Number(v))}
          onCreate={(name) => void createInside(name, costCenter?.id)}
        />
      </Field>

      <Field label={t('transactions.fields.concept')} id="tx-concept-cascade">
        <Combo
          id="tx-concept-cascade"
          label={t('transactions.fields.concept')}
          value={concept ? String(concept.id) : ''}
          options={(category?.children ?? []).map((c) => ({
            value: String(c.id),
            label: c.name,
          }))}
          disabled={isStatic || !category}
          emptyLabel={
            category
              ? t('transactions.classification.notChosen')
              : t('transactions.classification.chooseCategoryFirst')
          }
          isCreating={isCreating}
          onChange={(v) => choose(v === '' ? category?.id : Number(v))}
          onCreate={(name) => void createInside(name, category?.id)}
        />
      </Field>
    </>
  );
}

/** The cost center. It does not offer creating: it is the top structure. */
function CostCenterField({
  costCenter,
  tree,
  isStatic,
  onSelect,
}: {
  costCenter: CategoryTree | undefined;
  tree: CategoryTree[];
  isStatic: boolean;
  onSelect: (id?: number) => void;
}) {
  return (
    <Field label={t('centers.levels.costCenter')} id="tx-cost-center">
      <Combo
        id="tx-cost-center"
        label={t('centers.levels.costCenter')}
        value={costCenter ? String(costCenter.id) : ''}
        options={tree.map((c) => ({ value: String(c.id), label: c.name }))}
        disabled={isStatic}
        onChange={(v) => onSelect(v === '' ? undefined : Number(v))}
      />
    </Field>
  );
}
