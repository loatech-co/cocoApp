import { useState, type SubmitEvent } from 'react';

import { useActualizarCategoria } from '@/features/centros/api/categories';
import { categoryChanges, newCategory } from '@/features/centros/model/category-form';
import { ApiClientError } from '@/shared/api/api-client';
import { useCrearCategoria } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { useAlCambiar } from '@/shared/lib/al-cambiar';

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
  const crear = useCrearCategoria();
  const actualizar = useActualizarCategoria();
  const [nombre, setNombre] = useState('');
  const [estatico, setEstatico] = useState(false);
  const [icono, setIcono] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const esCentro = nivel === 'centro';

  // Se rellena en cada apertura con lo que toque: sin esto, lo que se canceló
  // la vez anterior reaparece escrito la siguiente.
  useAlCambiar([abierta, categoria], () => {
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
      setError(e instanceof ApiClientError ? e.message : 'No se pudo guardar.');
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
