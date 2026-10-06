import { useState, type SubmitEvent } from 'react';

import { useActualizarCategoria, useUnificarCategoria } from '@/features/centros/api/categories';
import type { Recurrencia } from '@/features/centros/components/campos-de-recurrencia';
import {
  conceptChanges,
  conceptFields,
  initialRecurrence,
  newConcept,
} from '@/features/centros/model/concept-form';
import { ApiClientError } from '@/shared/api/api-client';
import { useCreateCategory } from '@/shared/api/categories';
import { type Category } from '@/shared/api/generated/model';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';

interface ConceptFormOptions {
  abierta: boolean;
  concepto?: Category | null | undefined;
  categoriaId?: number | undefined;
  onCerrar: () => void;
}

/** El estado de la ficha de un concepto, y cómo se guarda o se funde con otro. */
export function useConceptForm({ abierta, concepto, categoriaId, onCerrar }: ConceptFormOptions) {
  const crear = useCreateCategory();
  const actualizar = useActualizarCategoria();
  const unificar = useUnificarCategoria();
  const campos = useConceptFields(abierta, concepto);
  const { nombre, recurrencia, palabrasClave, categoria, setError } = campos;

  async function guardar(accion: () => Promise<unknown>, siFalla: string): Promise<void> {
    setError(null);
    try {
      await accion();
      onCerrar();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : siFalla);
    }
  }

  function onUnificar(destinoId: number): Promise<void> {
    if (!concepto) return Promise.resolve();
    const origenId = concepto.id;
    return guardar(
      () => unificar.mutateAsync({ origenId, destinoId }),
      t('centers.conceptModal.mergeFailed'),
    );
  }

  function onSubmit(evento: SubmitEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const campos = conceptFields(nombre, recurrencia, palabrasClave);
    return guardar(
      () =>
        concepto
          ? actualizar.mutateAsync({
              id: concepto.id,
              cambios: conceptChanges(campos, categoria, concepto),
            })
          : crear.mutateAsync(newConcept(campos, categoriaId)),
      t('centers.saveFailed'),
    );
  }

  return {
    ...campos,
    guardando: crear.isPending || actualizar.isPending || unificar.isPending,
    onUnificar,
    onSubmit,
  };
}

/** Los campos de la ficha, rellenos con lo del concepto en cada apertura. */
function useConceptFields(abierta: boolean, concepto: Category | null | undefined) {
  const [nombre, setNombre] = useState('');
  const [recurrencia, setRecurrencia] = useState<Recurrencia>(() => initialRecurrence(null));
  const [error, setError] = useState<string | null>(null);
  /** Lo que se busca en un soporte para reconocer este concepto. */
  const [palabrasClave, setPalabrasClave] = useState<string[]>([]);
  /** La categoría al que pertenece. Vacío mientras no se esté editando. */
  const [categoria, setCategoría] = useState('');

  // Se recarga en cada apertura: sin esto, abrir el segundo concepto mostraría
  // los datos del primero.
  useOnChange([abierta, concepto], () => {
    if (!abierta) return;
    setNombre(concepto?.name ?? '');
    setRecurrencia(initialRecurrence(concepto));
    setCategoría(concepto?.parentId != null ? String(concepto.parentId) : '');
    setPalabrasClave(concepto?.keywords ?? []);
    setError(null);
  });

  return {
    nombre,
    setNombre,
    recurrencia,
    setRecurrencia,
    palabrasClave,
    setPalabrasClave,
    categoria,
    setCategoría,
    error,
    setError,
  };
}
