import { LEVELS, MAX_DEPTH } from '../../common/categories/categories.tree';
import type { CodeWithStatus } from '../../common/errors/domain-error';

/** Una negativa: su código estable (v2) y la frase para la persona. */
export interface MultiPaymentRejection {
  code: CodeWithStatus<422>;
  message: string;
}

/**
 * Si un concepto puede llevar la marca de «se paga en varias veces».
 *
 * ── Por qué se comprueba el estado RESULTANTE y no el DTO ───────────────────
 * Porque las dos reglas de abajo hablan de cómo queda la fila, no de lo que
 * trajo la petición. Mirando solo el DTO, encender `pago_automatico` sobre un
 * concepto que YA tiene `varios_pagos` pasaría sin más: en esa petición no
 * viene `varios_pagos`, así que no habría nada que contrastar, y la fila
 * quedaría con las dos marcas encendidas —que es justo lo que no puede pasar—.
 *
 * Quien llama mezcla primero lo que había con lo que viene, y pregunta por el
 * resultado. Por eso esto es una función suelta y no un decorador del DTO:
 * class-validator valida un objeto contra sí mismo, y aquí hacen falta dos.
 *
 * ── Y por qué devuelve el motivo en vez de un booleano ──────────────────────
 * Porque son tres negativas distintas y cada una se arregla de otra forma. Un
 * «no se puede» a secas deja a quien lo recibe adivinando cuál de las tres le
 * tocó. Y cada una lleva su código, para que un cliente no tenga que leer la
 * frase para saber cuál fue.
 */
export function multiPaymentRejection({
  isMultiPayment,
  isAutoPaid,
  isRecurring,
  depth,
}: {
  isMultiPayment: boolean;
  isAutoPaid: boolean;
  isRecurring: boolean;
  depth: number;
}): MultiPaymentRejection | null {
  // Apagada no restringe nada: lo que no está marcado no tiene por qué cumplir
  // las condiciones de estarlo. Si no, archivar un centro de costos viejo
  // fallaría por una marca que nadie encendió.
  if (!isMultiPayment) return null;

  if (depth !== MAX_DEPTH) {
    return {
      code: 'multi_payment_requires_concept',
      message:
        `«Se paga en varias veces» es de un ${LEVELS[MAX_DEPTH - 1]}, y esto es ` +
        `un ${LEVELS[Math.max(0, Math.min(depth, MAX_DEPTH) - 1)]}. ` +
        `Un centro de costos y una categoría son sumas de lo que cuelga de ellos: ` +
        `no se pagan, ni de una vez ni de varias.`,
    };
  }

  if (!isRecurring) {
    return {
      code: 'multi_payment_requires_recurring',
      message:
        '«Se paga en varias veces» solo significa algo en un concepto recurrente. ' +
        'Sin algo que vuelva cada mes no hay un total al que llegar, y sin total ' +
        'no existe «lo que falta».',
    };
  }

  if (isAutoPaid) {
    return {
      code: 'multi_payment_excludes_auto_paid',
      message:
        'Un concepto no puede tener «pago automático» y «se paga en varias veces» a la vez. ' +
        'El primero dice que esto se cobra solo, entero, el día que vence; el segundo, que ' +
        'se cubre a pedazos y no se sabe cuántos. Encendidos juntos, el cobro automático ' +
        'escribiría el importe completo el día del vencimiento y el concepto saldría de la ' +
        'lista sin que nadie hubiera ido al mercado.',
    };
  }

  return null;
}

/** La frase de la negativa, o `null` si la marca cabe. */
export function whyNotMultiPayment(
  state: Parameters<typeof multiPaymentRejection>[0],
): string | null {
  return multiPaymentRejection(state)?.message ?? null;
}
