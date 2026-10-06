import { useState, type SubmitEvent } from 'react';

import { useUpdateCategory, useMergeCategory } from '@/features/cost-centers/api/categories';
import type { Recurrence } from '@/features/cost-centers/components/recurrence-fields';
import {
  conceptChanges,
  conceptFields,
  initialRecurrence,
  newConcept,
} from '@/features/cost-centers/model/concept-form';
import { ApiClientError } from '@/shared/api/api-client';
import { useCreateCategory } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

interface ConceptFormOptions {
  isOpen: boolean;
  concept?: Category | null | undefined;
  categoryId?: number | undefined;
  onClose: () => void;
}

/** El estado de la ficha de un concepto, y cómo se guarda o se funde con otro. */
export function useConceptForm({ isOpen, concept, categoryId, onClose }: ConceptFormOptions) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const merge = useMergeCategory();
  const fields = useConceptFields(isOpen, concept);
  const { name, recurrence, keywords, category, setError } = fields;

  async function save(action: () => Promise<unknown>, failureMessage: string): Promise<void> {
    setError(null);
    try {
      await action();
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : failureMessage);
    }
  }

  function onMerge(targetId: number): Promise<void> {
    if (!concept) return Promise.resolve();
    const sourceId = concept.id;
    return save(
      () => merge.mutateAsync({ sourceId, targetId }),
      t('centers.conceptModal.mergeFailed'),
    );
  }

  function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const payload = conceptFields(name, recurrence, keywords);
    return save(
      () =>
        concept
          ? update.mutateAsync({
              id: concept.id,
              changes: conceptChanges(payload, category, concept),
            })
          : create.mutateAsync(newConcept(payload, categoryId)),
      t('centers.saveFailed'),
    );
  }

  return {
    ...fields,
    isSaving: create.isPending || update.isPending || merge.isPending,
    onMerge,
    onSubmit,
  };
}

/** Los campos de la ficha, rellenos con lo del concepto en cada apertura. */
function useConceptFields(isOpen: boolean, concept: Category | null | undefined) {
  const [name, setName] = useState('');
  const [recurrence, setRecurrence] = useState<Recurrence>(() => initialRecurrence(null));
  const [error, setError] = useState<string | null>(null);
  /** Lo que se busca en un soporte para reconocer este concepto. */
  const [keywords, setKeywords] = useState<string[]>([]);
  /** La categoría al que pertenece. Vacío mientras no se esté editando. */
  const [category, setCategory] = useState('');

  // Se recarga en cada apertura: sin esto, abrir el segundo concepto mostraría
  // los datos del primero.
  useOnChange([isOpen, concept], () => {
    if (!isOpen) return;
    setName(concept?.name ?? '');
    setRecurrence(initialRecurrence(concept));
    setCategory(concept?.parentId != null ? String(concept.parentId) : '');
    setKeywords(concept?.keywords ?? []);
    setError(null);
  });

  return {
    name,
    setName,
    recurrence,
    setRecurrence,
    keywords,
    setKeywords,
    category,
    setCategory,
    error,
    setError,
  };
}
