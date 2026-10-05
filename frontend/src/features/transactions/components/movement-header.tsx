import { Pencil, Trash2, TrendingDown, TrendingUp } from 'lucide-react';

import { mayuscula, nombreDelTipo } from '@/features/transactions/model/movement-form';
import { Button } from '@/shared/ui/atoms/button';
import { ChipIcono } from '@/shared/ui/atoms/chip-icono';
import { CabeceraDeModal } from '@/shared/ui/molecules/modal-partes';
import type { PagoPendiente, TransactionType } from '@coco/types';

interface SheetMode {
  type: TransactionType;
  editando: boolean;
  editable: boolean;
  /** El pago que se viene a confirmar, solo si la ficha no es de un movimiento ya guardado. */
  confirmando: PagoPendiente | null;
}

/**
 * Lo que se va a hacer no es lo mismo, así que no se llama igual. «Confirmar
 * pago» en un concepto que se cubre a pedazos promete cerrar el mes, y lo que
 * se anota es una ida de cuatro: la lista ya ofreció «Registrar otro» y la
 * ficha que se abre tiene que ser la que se pidió.
 */
function sheetTitle({ type, editando, editable, confirmando }: SheetMode): string {
  if (confirmando) return confirmando.varios_pagos ? 'Registrar otro' : 'Confirmar pago';
  if (!editando) return `Nuevo ${nombreDelTipo(type)}`;
  return editable ? `Editar ${nombreDelTipo(type)}` : mayuscula(nombreDelTipo(type));
}

/**
 * Solo al confirmar un pago, y dice las tres cosas que hacen falta: CUÁL es el
 * pago —el título no lo dice—, que lo que hay escrito es un esperado y no un
 * dato, y qué hacer para que deje de serlo.
 *
 * Sin la segunda, un valor calculado del promedio de tres meses se ve igual
 * que uno copiado del recibo, y el que confirme sin mirar registra un promedio
 * como si fuera la plata que salió.
 */
function sheetHelp(pago: PagoPendiente | null): string | undefined {
  if (!pago) return undefined;
  if (pago.varios_pagos) {
    return `${pago.name}. Esto se paga en varias veces: anota lo de ESTA vez, no el total del mes.`;
  }
  return pago.expected_amount != null
    ? `${pago.name}. El valor y la fecha son los esperados: adjunta el soporte y se corrigen con lo que diga el recibo.`
    : `${pago.name}. Adjunta el soporte y se leen el valor y la fecha.`;
}

interface MovementHeaderProps {
  modo: SheetMode;
  onEditar: () => void;
  onEliminar: () => void;
  onCerrar: () => void;
}

/**
 * La misma cabecera que las demás fichas, con el pastel de color en su hueco.
 *
 * El tipo está en el TÍTULO y en el color, no en un par de botones dentro del
 * formulario: lo eligió el menú de "Nuevo movimiento" antes de abrir esto, así
 * que aquí ya no es una pregunta —es de qué se está hablando, y el pastel lo
 * dice antes de leer—.
 */
export function MovementHeader({ modo, onEditar, onEliminar, onCerrar }: MovementHeaderProps) {
  const { type, editando, editable } = modo;

  return (
    <CabeceraDeModal
      titulo={sheetTitle(modo)}
      ayuda={sheetHelp(modo.confirmando)}
      antes={
        <ChipIcono
          Icono={type === 'income' ? TrendingUp : TrendingDown}
          color={type === 'income' ? 'ingreso' : 'gasto'}
          tamano="sm"
        />
      }
      acciones={
        <>
          {editando && !editable && (
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              onClick={onEditar}
              aria-label="Editar movimiento"
              title="Editar"
            >
              <Pencil className="size-4" aria-hidden="true" />
            </Button>
          )}

          {/*
            También en los centros estáticos, y no es una excepción a la regla:
            es que la regla nunca hablaba de esto.

            Lo que un centro estático protege es su ESTRUCTURA —qué conceptos
            existen y en qué categoría viven—, y por eso no se reclasifica desde
            aquí. Un movimiento no es estructura: es el registro de que tal mes
            salió tal plata de un concepto. Borrarlo borra el registro y deja el
            concepto donde estaba, igual de vivo, listo para el mes siguiente.
          */}
          {editando && (
            <Button
              type="button"
              variant="ghost"
              size="sm-icon"
              onClick={onEliminar}
              aria-label="Eliminar movimiento"
              title="Eliminar"
              /*
                El MISMO color y el mismo tamaño que el lápiz y la equis: apagar
                uno de tres no dice nada, dice que ese está medio deshabilitado.

                Lo que sí cambia es el HOVER, y es la única excepción: borrar es
                lo único de esta fila que no se puede deshacer, y el rojo al
                pasar por encima es la última señal antes de la confirmación.
              */
              className="hover:bg-destructive/10 hover:text-destructive"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          )}
        </>
      }
      onCerrar={onCerrar}
    />
  );
}
