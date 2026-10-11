import { Loader2, Merge, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { useConceptForm } from '@/features/cost-centers/hooks/use-concept-form';
import { findTwin, siblingCategories } from '@/features/cost-centers/model/concept-form';
import { useCategories } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { Block } from '@/shared/ui/atoms/block';
import { Button } from '@/shared/ui/atoms/button';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { ModalFooter } from '@/shared/ui/molecules/modal-parts';
import { Modal } from '@/shared/ui/organisms/modal';
import { Select } from '@/shared/ui/organisms/select';

import { ConfirmDeletion } from './confirm-deletion';
import { KeywordsFields } from './keywords-fields';
import { RecurrenceFields } from './recurrence-fields';

interface ConceptModalProps {
  isOpen: boolean;
  /** Without a concept, the form creates inside `categoryId`. With one, it edits. */
  concept?: Category | null;
  categoryId?: number;
  onClose: () => void;
}

/**
 * Create or rename a concept, and say whether it is paid every so often.
 *
 * ── Why only concepts ───────────────────────────────────────────────────────
 * A cost center and a category are not paid: they are sums. What has an
 * amount, a date and a periodicity is the concept —the rent, the
 * electricity—, and it is the only level where recurrence means something.
 *
 * ── Why the same format as the transactions one ─────────────────────────────
 * Because it is the same kind of act: open a form, change some fields,
 * save. Two different forms for the same thing force learning twice
 * where the save button is.
 */
export function ConceptModal({ isOpen, concept, categoryId, onClose }: ConceptModalProps) {
  const categories = useCategories();
  const form = useConceptForm({ isOpen, concept, categoryId, onClose });
  const [isConfirming, setIsConfirming] = useState(false);

  if (!isOpen) return null;

  const tree = categories.data ?? [];
  const twin = findTwin(tree, concept, form.name);

  return (
    <>
      <Modal
        isOpen={isOpen}
        title={concept ? t('centers.conceptModal.editTitle') : t('centers.conceptModal.newTitle')}
        description={t('centers.conceptModal.help')}
        // Delete goes in the header, next to the cross: it is the other action
        // of the form that is not "save".
        actions={
          concept && <DeleteConceptButton concept={concept} onClick={() => setIsConfirming(true)} />
        }
        onClose={onClose}
      >
        <ConceptForm form={form} concept={concept} tree={tree} twin={twin} onClose={onClose} />
      </Modal>

      {concept && (
        <ConfirmDeletion
          category={concept}
          level="concept"
          tree={tree}
          isOpen={isConfirming}
          onClose={() => setIsConfirming(false)}
          // Without the concept, this form has nothing to talk about.
          onDeleted={onClose}
        />
      )}
    </>
  );
}

function DeleteConceptButton({ concept, onClick }: { concept: Category; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm-icon"
      onClick={onClick}
      aria-label={t('centers.conceptModal.deleteNamed', { name: concept.name })}
      title={t('centers.conceptModal.delete')}
      className="text-muted-foreground hover:text-destructive"
    >
      <Trash2 className="size-4" aria-hidden="true" />
    </Button>
  );
}

interface ConceptFormProps {
  form: ReturnType<typeof useConceptForm>;
  concept: Category | null | undefined;
  tree: Category[];
  twin: Category | undefined;
  onClose: () => void;
}

function ConceptForm({ form, concept, tree, twin, onClose }: ConceptFormProps) {
  const siblings = siblingCategories(tree, concept);

  return (
    <form onSubmit={(e) => void form.onSubmit(e)} className="flex flex-1 flex-col gap-4">
      <Field label={t('common.name')} id="concept-name">
        <Input
          id="concept-name"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder={t('centers.conceptModal.namePlaceholder')}
          required
        />
      </Field>

      {/* Only when editing: when creating, the category is the one whose button was pressed
          to open this, so asking it again is asking about
          something that was just said. */}
      {concept && siblings.length > 1 && <SiblingCategoryField form={form} siblings={siblings} />}

      <RecurrenceFields value={form.recurrence} onChange={form.setRecurrence} />

      {/*
        After the recurrence and not before the name.

        What one comes to do in this form is create or correct a
        concept; having its receipts read on their own is what is done AFTERWARD,
        and the first time almost never —one does not know what the receipt says until
        it arrives—. Above, it would force going over a field that
        most of the time is left empty.
      */}
      <KeywordsFields
        value={form.keywords}
        onChange={form.setKeywords}
        tree={tree}
        conceptId={concept?.id}
      />

      {twin && <TwinNotice twin={twin} concept={concept} form={form} />}

      {form.error && (
        <p role="alert" className="text-sm text-destructive">
          {form.error}
        </p>
      )}

      <ConceptFormFooter
        form={form}
        isEditing={concept != null}
        isLocked={twin !== undefined}
        onClose={onClose}
      />
    </form>
  );
}

function TwinNotice({
  twin,
  concept,
  form,
}: {
  twin: Category;
  concept: Category | null | undefined;
  form: ReturnType<typeof useConceptForm>;
}) {
  return (
    /*
      Neutral surface, not amber.

      Amber is for what is PENDING —an unclassified
      transaction, a payment coming due—. This is not pending nor did it go
      wrong: it is a way out being offered. And in dark mode, besides, the
      `warning-surface` is a brown that over the green of the modal gave
      a dirty olive green.
    */
    <Block className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        <strong className="font-semibold text-foreground">
          {t('centers.conceptModal.duplicateBefore', { name: twin.name })}
        </strong>
        {t('centers.conceptModal.duplicateMiddle')}
        {concept
          ? t('centers.conceptModal.duplicateDisappears', { name: concept.name })
          : t('centers.conceptModal.duplicateNoNew')}
        .
      </p>
      {concept && (
        <Button
          type="button"
          variant="tool"
          size="sm"
          className="self-start"
          disabled={form.isSaving}
          onClick={() => void form.onMerge(twin.id)}
        >
          <Merge className="size-4" aria-hidden="true" />
          {t('centers.conceptModal.mergeWith', { name: twin.name })}
        </Button>
      )}
    </Block>
  );
}

function ConceptFormFooter({
  form,
  isEditing,
  isLocked,
  onClose,
}: {
  form: ReturnType<typeof useConceptForm>;
  isEditing: boolean;
  /** There is another concept with the same name: it is merged, not saved. */
  isLocked: boolean;
  onClose: () => void;
}) {
  return (
    <ModalFooter>
      <Button type="button" variant="outline" onClick={onClose}>
        {t('common.cancel')}
      </Button>
      <Button type="submit" disabled={form.isSaving || form.name.trim() === '' || isLocked}>
        {form.isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {isEditing ? t('common.save') : t('common.create')}
      </Button>
    </ModalFooter>
  );
}

function SiblingCategoryField({
  form,
  siblings,
}: {
  form: ReturnType<typeof useConceptForm>;
  siblings: { value: string; label: string }[];
}) {
  return (
    <Field
      label={t('centers.levels.category')}
      id="concept-category"
      description={t('centers.conceptModal.categoryHelp')}
    >
      <Select
        id="concept-category"
        label={t('centers.levels.category')}
        value={form.category}
        options={siblings}
        onChange={form.setCategory}
      />
    </Field>
  );
}
