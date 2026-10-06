import { LEVELS, MAX_DEPTH } from '../../common/categories/categories.tree';
import type { CodeWithStatus } from '../../common/errors/domain-error';

/** A refusal: its stable code (v2) and the sentence for the person. */
export interface MultiPaymentRejection {
  code: CodeWithStatus<422>;
  message: string;
}

/**
 * Whether a concept may carry the "paid in several installments" flag.
 *
 * ── Why the RESULTING state is checked and not the request ──────────────────
 * Because the two rules below are about how the row ends up, not about what
 * the request brought. Looking only at the request, turning `isAutoPaid` on
 * for a concept that ALREADY has `isMultiPayment` would just pass: that
 * request does not carry `isMultiPayment`, so there would be nothing to check
 * against, and the row would end up with both flags on —which is exactly what
 * cannot happen—.
 *
 * The caller first merges what was there with what comes, and asks about the
 * result. That is why this is a plain function and not a DTO decorator:
 * class-validator validates an object against itself, and two are needed
 * here.
 *
 * ── And why it returns the reason instead of a boolean ──────────────────────
 * Because they are three different refusals and each is fixed another way. A
 * bare "not allowed" leaves whoever gets it guessing which of the three it
 * was. And each one carries its code, so a client does not have to read the
 * sentence to know which one it was.
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
  // Turned off it restricts nothing: what is not flagged does not have to meet
  // the conditions of being flagged. Otherwise, archiving an old cost center
  // would fail because of a flag nobody turned on.
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

/** The sentence of the refusal, or `null` if the flag fits. */
export function whyNotMultiPayment(
  state: Parameters<typeof multiPaymentRejection>[0],
): string | null {
  return multiPaymentRejection(state)?.message ?? null;
}
