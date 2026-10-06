import { useState, type SubmitEvent } from 'react';

import { useActualizarCategoria } from '@/features/cost-centers/api/categories';
import { categoryChanges, newCategory } from '@/features/cost-centers/model/category-form';
import { ApiClientError } from '@/shared/api/api-client';
import { useCreateCategory } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

interface CategoryFormOptions {
  abierta: boolean;
  nivel: 'centro' | 'categoria';
  categoria?: Category | null | undefined;
  padreId?: number | undefined;
  onCerrar: () => void;
}

/**
 * El estado de la ficha de un centro o una categoría, y cómo se guarda.
 *
 * Crear y renombrar son el mismo formulario: lo único que cambia es a qué
 * mutación se llama y qué campos le tocan a cada nivel —lo estático al centro,
 * el icono a la categoría—.
 */
export function useCategoryForm({
  abierta,
  nivel,
  categoria,
  padreId,
  onCerrar,
}: CategoryFormOptions) {
  const crear = useCreateCategory();
  const actualizar = useActualizarCategoria();
  const [nombre, setNombre] = useState('');
  const [estatico, setEstatico] = useState(false);
  const [icono, setIcono] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esCentro = nivel === 'centro';

  // Se rellena en cada apertura con lo que toque: sin esto, lo que se canceló
  // la vez anterior reaparece escrito la siguiente.
  useOnChange([abierta, categoria], () => {
    if (!abierta) return;
    setNombre(categoria?.name ?? '');
    setEstatico(categoria?.isStatic ?? false);
    setIcono(categoria?.icon ?? null);
    setError(null);
  });

  async function onSubmit(evento: SubmitEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);

    const valores = { esCentro, nombre, estatico, icono };
    try {
      if (categoria != null) {
        await actualizar.mutateAsync({ id: categoria.id, cambios: categoryChanges(valores) });
      } else {
        await crear.mutateAsync(newCategory(valores, padreId));
      }
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : t('centers.saveFailed'));
    }
  }

  return {
    nombre,
    setNombre,
    estatico,
    setEstatico,
    icono,
    setIcono,
    error,
    guardando: crear.isPending || actualizar.isPending,
    onSubmit,
  };
}
