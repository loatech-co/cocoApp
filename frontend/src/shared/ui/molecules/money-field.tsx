import { type ComponentProps } from 'react';

import { groupThousands, cn, digitsOnly } from '@/shared/lib/utils';
import { Input } from '@/shared/ui/atoms/input';

/**
 * A field where money is typed.
 *
 * ── Thousands are grouped WHILE typing ──────────────────────────────────────
 * «453132» cannot be read: one has to count the digits in threes with a finger
 * to know whether it is four hundred thousand or four million. It is the most
 * important piece of data in any modal that talks about money and it was the
 * only one that could not be read at a glance.
 *
 * It is STORED without dots and SHOWN with them: the value that travels to
 * the API is the one typed, not the one seen.
 *
 * ── And the caret stays where it was ────────────────────────────────────────
 * It is the hard half, and that is why this is a component and not two similar
 * call sites. On regrouping, the painted string changes length, and if the
 * caret is left where the browser left it, it jumps to the end as soon as a
 * new dot appears: correcting a figure in the middle becomes impossible.
 *
 * What is kept is not the position but HOW MANY DIGITS there are before the
 * caret, which is the only thing that does not change on regrouping.
 *
 * ── Why it is not `type="number"` ───────────────────────────────────────────
 * It would bring little arrows nobody uses and would reject the decimal comma
 * written in Colombia. `inputMode="decimal"` opens the phone's numeric
 * keyboard with neither of the two.
 */
export function MoneyField({
  value,
  onValueChange,
  className,
  ...rest
}: {
  /** Digits only, no dots. It is what travels to the API. */
  value: string;
  onValueChange: (raw: string) => void;
} & Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type' | 'icono'>) {
  return (
    <Input
      inputMode="decimal"
      icon={PesoSign}
      value={groupThousands(value)}
      className={cn(className)}
      onChange={(e) => {
        const digits = digitsOnly(e.target.value);
        const input = e.target;
        const digitsBefore = (input.value.slice(0, input.selectionStart ?? 0).match(/[\d,]/g) ?? [])
          .length;

        onValueChange(digits);

        requestAnimationFrame(() => {
          const formatted = groupThousands(digits);
          let seen = 0;
          let caret = formatted.length;
          for (let i = 0; i < formatted.length; i += 1) {
            if (/[\d,]/.test(formatted.charAt(i))) seen += 1;
            if (seen === digitsBefore) {
              caret = i + 1;
              break;
            }
          }
          input.setSelectionRange(caret, caret);
        });
      }}
      {...rest}
    />
  );
}

/**
 * The peso sign, on the left.
 *
 * ── Why a sign and not the word ─────────────────────────────────────────────
 * Because «Valor» is already in the field's label, and what is needed to the
 * left of the number is to say that THIS is money: next to it there may be
 * another number —the day of the month of a recurrence— that is typed the
 * same way.
 *
 * It is the field's `icon`, so it is not part of the value: what is typed
 * and what is stored do not carry it.
 */
function PesoSign({ className }: { className?: string }) {
  return (
    <span
      className={cn(className, 'grid place-items-center text-sm font-medium')}
      aria-hidden="true"
    >
      $
    </span>
  );
}
