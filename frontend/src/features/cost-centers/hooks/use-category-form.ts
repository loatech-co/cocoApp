import { useState, type SubmitEvent } from 'react';

import { useUpdateCategory } from '@/features/cost-centers/api/categories';
import { categoryChanges, newCategory } from '@/features/cost-centers/model/category-form';
import { ApiClientError } from '@/shared/api/api-client';
import { useCreateCategory } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

interface CategoryFormOptions {
  isOpen: boolean;
  level: 'costCenter' | 'category';
  category?: Category | null | undefined;
  parentId?: number | undefined;
  onClose: () => void;
}

/**
 * El estado de la ficha de un centro o una categoría, y cómo se guarda.
 *
 * Crear y renombrar son el mismo formulario: lo único que cambia es a qué
 * mutación se llama y qué campos le tocan a cada nivel —lo estático al centro,
 * el icono a la categoría—.
 */
export function useCategoryForm({
  isOpen,
  level,
  category,
  parentId,
  onClose,
}: CategoryFormOptions) {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [name, setName] = useState('');
  const [isStatic, setIsStatic] = useState(false);
  const [icon, setIcon] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isCostCenter = level === 'costCenter';

  // Se rellena en cada apertura con lo que toque: sin esto, lo que se canceló
  // la vez anterior reaparece escrito la siguiente.
  useOnChange([isOpen, category], () => {
    if (!isOpen) return;
    setName(category?.name ?? '');
    setIsStatic(category?.isStatic ?? false);
    setIcon(category?.icon ?? null);
    setError(null);
  });

  async function onSubmit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    const valores = { isCostCenter, name, isStatic, icon };
    try {
      if (category != null) {
        await update.mutateAsync({ id: category.id, changes: categoryChanges(valores) });
      } else {
        await create.mutateAsync(newCategory(valores, parentId));
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('centers.saveFailed'));
    }
  }

  return {
    name,
    setName,
    isStatic,
    setIsStatic,
    icon,
    setIcon,
    error,
    isSaving: create.isPending || update.isPending,
    onSubmit,
  };
}
