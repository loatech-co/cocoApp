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
  /** Sin concepto, el formulario crea dentro de `categoríaId`. Con él, edita. */
  concept?: Category | null;
  categoryId?: number;
  onClose: () => void;
}

/**
 * Crear o renombrar un concepto, y decir si se paga cada cierto tiempo.
 *
 * ── Por qué solo los conceptos ──────────────────────────────────────────────
 * Un centro de costos y una categoría no se pagan: son sumas. Lo que tiene un
 * importe, una fecha y una periodicidad es el concepto —el alquiler, la
 * energía—, y es el único nivel donde la recurrencia significa algo.
 *
 * ── Por qué el mismo formato que el de movimientos ──────────────────────────
 * Porque es la misma clase de acto: abrir una ficha, cambiar unos campos,
 * guardar. Dos formularios distintos para lo mismo obligan a aprender dos
 * veces dónde está el botón de guardar.
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
        // Eliminar va en la cabecera, al lado de la equis: es la otra acción
        // de la ficha que no es "guardar".
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
          // Sin el concepto, esta ficha no tiene de qué hablar.
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
      <Field label={t('common.name')} id="concepto-nombre">
        <Input
          id="concepto-nombre"
          value={form.name}
          onChange={(e) => form.setName(e.target.value)}
          placeholder={t('centers.conceptModal.namePlaceholder')}
          required
        />
      </Field>

      {/* Solo al editar: al crear, la categoría es aquella cuyo botón se pulsó
          para abrir esto, así que preguntarlo otra vez es preguntar por
          algo que se acaba de decir. */}
      {concept && siblings.length > 1 && <SiblingCategoryField form={form} siblings={siblings} />}

      <RecurrenceFields value={form.recurrence} onChange={form.setRecurrence} />

      {/*
        Después de la recurrencia y no antes del nombre.

        Lo que se viene a hacer a esta ficha es crear o corregir un
        concepto; que sus recibos se lean solos es lo que se hace DESPUÉS,
        y la primera vez casi nunca —no se sabe qué dice el recibo hasta
        que llega—. Arriba obligaría a pasar por encima de un campo que la
        mayoría de las veces se deja vacío.
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
      Superficie neutra, no ámbar.

      El ámbar es para lo que está PENDIENTE —un movimiento sin
      clasificar, un pago que vence—. Esto no está pendiente ni salió
      mal: es una salida que se ofrece. Y en oscuro, además, el
      `warning-surface` es un marrón que sobre el verde del modal daba
      un verde oliva sucio.
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
  /** Hay otro concepto con el mismo nombre: se unifica, no se guarda. */
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
      id="concepto-categoria"
      description={t('centers.conceptModal.categoryHelp')}
    >
      <Select
        id="concepto-categoria"
        label={t('centers.levels.category')}
        value={form.category}
        options={siblings}
        onChange={form.setCategory}
      />
    </Field>
  );
}
