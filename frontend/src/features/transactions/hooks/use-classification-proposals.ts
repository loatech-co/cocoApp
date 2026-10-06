import { useMemo } from 'react';

import { useTransactions } from '@/features/transactions/api/transactions';
import { useSugerenciaDeCategoria } from '@/features/transactions/hooks/use-category-suggestion';
import { proposalFromText } from '@/features/transactions/model/movement-form';
import { conceptosRecientes } from '@/features/transactions/model/recent';
import { type Category, type Transaction } from '@/shared/api/generated/model';
import { useOnChange } from '@/shared/lib/on-change';
import { toSearchableNodes } from '@/shared/lib/searchable-tree';
import { indexTree } from '@coco/receipt-parser';

import type { MovementSheetState } from './use-movement-form';

/**
 * Las fuentes automáticas de la clasificación, y los conceptos recientes.
 *
 * ── Las fuentes ─────────────────────────────────────────────────────────────
 * Tres, y las tres pasan por `proponer`, que aplica la precedencia:
 *
 * · El HISTORIAL, que vive en el servidor: `/categorization/suggest` con lo
 *   que se está escribiendo (con espera entre teclas; ver el hook).
 * · Las PALABRAS CLAVE y los nombres de la persona: lo escrito se busca en su
 *   árbol; si lleva a un solo concepto, se propone.
 * · El DICCIONARIO del sistema: si lo escrito nombra un comercio conocido, sus
 *   términos se buscan en el árbol. Ver `proposalFromText`.
 *
 * Solo con la ficha en el formulario y editable: proponer sobre una ficha de
 * solo lectura sería cambiarle la clasificación a un movimiento guardado.
 *
 * ── La recurrencia NO se edita aquí ─────────────────────────────────────────
 * Es del CONCEPTO, no del movimiento, y su sitio es Centros de costos. Editable
 * desde la ficha, un formulario que uno abre para corregir una cifra podía
 * cambiar cada cuánto vuelve un pago, y eso reaparece semanas después en la
 * tarjeta de pagos pendientes sin que nadie recuerde haberlo tocado.
 */
export function useClassificationProposals(
  ficha: MovementSheetState,
  {
    abierta,
    movimiento,
    arbol,
  }: {
    abierta: boolean;
    movimiento: Transaction | null | undefined;
    arbol: Category[] | undefined;
  },
) {
  const indiceDelArbol = useMemo(() => indexTree(toSearchableNodes(arbol ?? [])), [arbol]);
  const proponiendo = abierta && ficha.paso === 'formulario' && ficha.editable;

  const sugerenciaDelHistorial = useSugerenciaDeCategoria(proponiendo ? ficha.description : '');
  useOnChange([sugerenciaDelHistorial?.categoryId], () => {
    // Solo con un id de verdad: una respuesta con otra forma no puede vaciar
    // lo que otra fuente ya había puesto.
    if (typeof sugerenciaDelHistorial?.categoryId !== 'number') return;
    ficha.setHuboSugerencia(true);
    ficha.proponer({ categoryId: sugerenciaDelHistorial.categoryId, origen: 'historial' });
  });

  const propuestaLocal = useMemo(() => {
    const escrito = ficha.description.trim();
    if (!proponiendo || escrito.length < 3) return null;
    return proposalFromText(indiceDelArbol, escrito);
  }, [indiceDelArbol, ficha.description, proponiendo]);

  useOnChange(
    [
      propuestaLocal?.categoryId,
      propuestaLocal?.origen,
      propuestaLocal && (propuestaLocal.candidatos ?? []).map((c) => c.id).join(','),
    ],
    () => {
      if (!propuestaLocal) return;
      ficha.setHuboSugerencia(true);
      const { categoryId, origen, candidatos } = propuestaLocal;
      if (categoryId !== undefined) ficha.proponer({ categoryId, origen });
      if (candidatos) ficha.setCandidatosDelRecibo(candidatos);
    },
  );

  // Los conceptos usados últimamente, para el buscador en blanco. Solo al
  // crear: editando, el concepto ya está puesto.
  const movimientosRecientes = useTransactions(
    { perPage: 40 },
    { enabled: abierta && !movimiento },
  );
  return useMemo(
    () => conceptosRecientes(movimientosRecientes.data?.data ?? [], indiceDelArbol),
    [movimientosRecientes.data, indiceDelArbol],
  );
}
