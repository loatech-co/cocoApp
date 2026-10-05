import { useEffect } from 'react';

import { rutaSeleccionada } from '@/features/transactions/model/movimientos';
import { useCategories } from '@/shared/api/categories';

import { makeReceiptScan } from './receipt-scan';
import { useClassificationProposals } from './use-classification-proposals';
import { useMovementForm, type SheetOpening } from './use-movement-form';
import { useCreateInside, useSaveMovement } from './use-save-movement';

function useCloseOnEscape(abierta: boolean, onCerrar: () => void): void {
  useEffect(() => {
    if (!abierta) return;
    const alPulsar = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCerrar();
    };
    document.addEventListener('keydown', alPulsar);
    return () => document.removeEventListener('keydown', alPulsar);
  }, [abierta, onCerrar]);
}

/**
 * Todo lo que la ficha de un movimiento necesita, junto.
 *
 * El estado vive en `useMovementForm`; lo que proponen las fuentes
 * automáticas, en `useClassificationProposals`; leer un recibo, en
 * `makeReceiptScan`; y guardar, en `useSaveMovement`.
 */
export function useMovementSheet(apertura: SheetOpening & { onCerrar: () => void }) {
  const { abierta, movimiento, onCerrar } = apertura;
  const categorias = useCategories();
  const ficha = useMovementForm(apertura);
  const recientes = useClassificationProposals(ficha, {
    abierta,
    movimiento,
    arbol: categorias.data,
  });
  const guardar = useSaveMovement(ficha, movimiento, onCerrar);
  const crear = useCreateInside(ficha);
  useCloseOnEscape(abierta, onCerrar);

  const arbol = categorias.data ?? [];
  /*
    ── Lo que ya está en un centro estático no se mueve ──────────────────────
    Estático es estático: ni desde la tabla ni desde aquí. La estructura de
    los costos fijos se decide una vez, y si de verdad hay que cambiarla, se
    hace dinámico el centro y entonces se mueve —que es un acto deliberado, en
    otra pantalla, y no un desplegable a un clic de distancia—.

    Se mira el centro GUARDADO, no el que esté elegido en el formulario. Con
    el elegido, escoger "Costos fijos" al crear un movimiento bloqueaba los dos
    desplegables de abajo y dejaba el formulario a medias: entrar sí se puede,
    salir es lo que no.
  */
  const estatico =
    rutaSeleccionada(arbol, movimiento?.categoryId ?? undefined).centro?.isStatic ?? false;

  return {
    ficha,
    recientes,
    escanear: makeReceiptScan(ficha, categorias.data),
    guardar,
    crear,
    arbol,
    estatico,
  };
}

export type MovementSheet = ReturnType<typeof useMovementSheet>;
