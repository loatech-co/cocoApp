import { Repeat } from 'lucide-react';
import { useState } from 'react';

import { PERIODICITIES, type Periodicity } from '@/features/cost-centers/model/periodicity';
import { capitalize, LONG_MONTHS } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { useOnChange } from '@/shared/lib/on-change';
import { cn } from '@/shared/lib/utils';
import { Field } from '@/shared/ui/atoms/field';
import { Input } from '@/shared/ui/atoms/input';
import { Switch } from '@/shared/ui/atoms/switch';
import { MoneyField } from '@/shared/ui/molecules/money-field';
import { Select } from '@/shared/ui/organisms/select';

const LABELS: Record<Periodicity, string> = {
  monthly: t('centers.recurrence.periodicity.monthly'),
  bimonthly: t('centers.recurrence.periodicity.bimonthly'),
  quarterly: t('centers.recurrence.periodicity.quarterly'),
  semiannual: t('centers.recurrence.periodicity.semiannual'),
  annual: t('centers.recurrence.periodicity.annual'),
};

export interface Recurrence {
  isRecurring: boolean;
  periodicity: Periodicity;
  paymentDay: number;
  /** The month of the cycle. Only used —and only asked— if it is not monthly. */
  paymentMonth: number;
  /**
   * What it is expected to cost each time. Digits only, no dots; empty is
   * «I don't know, estimate it».
   */
  budget: string;
  /** Whether the transaction is created on its own when the payment day arrives. */
  isAutoPay: boolean;
  /**
   * Whether the concept is covered in pieces: the groceries in four trips, the gas
   * in six fill-ups. It stays in pending payments until what was paid
   * reaches what was expected, instead of leaving at the first transaction.
   *
   * Incompatible with `isAutoPay`: see the reason next to the switch.
   */
  isMultiPayment: boolean;
}

const MONTHS = LONG_MONTHS.map(capitalize);

/**
 * Marking a concept as a payment that comes back.
 *
 * ── Why it belongs to the CONCEPT and not to the transaction ────────────────
 * What repeats is "the rent", not the September payment. Set on each
 * transaction it would have to be repeated twelve times a year and kept in agreement
 * with each other; and in an unpaid month there would be no transaction to read it from,
 * which is exactly when one needs to know that it is missing.
 *
 * That is why the warning: touching it here changes the whole concept, not this row.
 */
export function RecurrenceFields({
  value,
  onChange,
  /** The name of the concept, so the warning says what it affects. */
  concept,
  className,
}: {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
  concept?: string;
  className?: string;
}) {
  return (
    /*
      A block, not a `fieldset` with its `legend`.

      The legend is drawn ON TOP of the border, splitting it, and with the title in
      small caps the whole thing read like a label stuck to a box. Here
      what there is is a switch with its explanation, and what shows up below
      only exists if it is on: that reads better as a row with a
      control on the right.
    */
    /*
      WITHOUT `overflow-hidden`, and with `relative z-10`.

      The clipping was there so the background of the row below would respect
      the corners, but it also clipped the periodicity dropdown,
      which opens outside the block. The corners are now rounded by that
      row on its own; the `z-10` puts it above whatever comes
      after, which otherwise covered it because of paint order.
    */
    <div className={cn('relative z-10 rounded-lg border border-border', className)}>
      <label className="flex cursor-pointer items-center gap-3 p-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
          <Repeat className="size-4" aria-hidden="true" />
        </span>

        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{t('centers.recurrence.title')}</span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {concept
              ? t('centers.recurrence.scopeConcept', { concept })
              : t('centers.recurrence.scopePending')}
          </span>
        </span>

        <Switch
          checked={value.isRecurring}
          onChange={(e) => onChange({ ...value, isRecurring: e.target.checked })}
        />
      </label>

      {/*
        The fields only exist if it is on, and WHICH ones depends on how
        often it comes back. "Every three months" with a single day of the month says nothing:
        three months counted from when? That is why, as soon as it stops being
        monthly, the month of the cycle shows up.
      */}
      {value.isRecurring && <RecurrenceDetails value={value} onChange={onChange} />}
    </div>
  );
}

/**
 * The typed day, clamped between 1 and 31.
 *
 * Empty counts as 1 instead of staying blank: a numeric field with no value
 * leaves the form in a state that cannot be saved and does not say so.
 */
/**
 * The day of the month, which can be DELETED while typing.
 *
 * ── The bug ─────────────────────────────────────────────────────────────────
 * The field painted the number of the value directly and clamped every keystroke with
 * `clampDay`. And `clampDay('')` returns 1 —there is no number, it falls to the minimum—,
 * so when the content was deleted the field rewrote itself in the same
 * frame: the delete key did nothing visible and to change the day
 * one had to select and overwrite.
 *
 * ── Why a draft is needed ───────────────────────────────────────────────────
 * Because a text field has states the data does not have. «Empty» is one
 * of them: it is not a valid day, but it is what one goes through to type another.
 * Tying what is shown to the clamped number, those intermediate states cannot
 * exist.
 *
 * So what is typed lives here and the number comes out of it: while there is something
 * typed it is reported upward, and empty is not reported —the last
 * valid day is kept—. On leaving the field, what is shown goes back to being that day: nobody
 * is left with a blank field and a value that does not match.
 *
 * ── What does NOT change ────────────────────────────────────────────────────
 * The clamping still happens while typing and not on save: a 45 that stays on
 * screen until someone presses «Guardar» is an error nobody sees until
 * they are no longer looking at the field.
 */
function DayField({ day, onChange }: { day: number; onChange: (day: number) => void }) {
  const [draft, setDraft] = useState(String(day));

  // The day can change from outside —when opening another concept's form— and what
  // is shown has to follow it.
  useOnChange([day], () => setDraft(String(day)));

  return (
    <Field label={t('centers.recurrence.dayOfMonth')} id="dia-de-pago">
      <Input
        id="dia-de-pago"
        // `text` and not `number`: a numeric field returns the empty string
        // when its content is not a valid number —«3e», «--»—, so what is
        // typed and what is read stop matching right while typing.
        // The function itself filters the digits.
        type="text"
        inputMode="numeric"
        maxLength={2}
        value={draft}
        onChange={(e) => {
          const digits = e.target.value.replace(/\D/g, '').slice(0, 2);
          setDraft(digits);
          if (digits !== '') onChange(clampDay(digits));
        }}
        // On leaving, what is shown goes back to being the saved day: a blank
        // field with a value behind it is a lie that is only discovered when
        // opening the form again.
        onBlur={() => setDraft(String(day))}
      />
    </Field>
  );
}

export function clampDay(draft: string): number {
  const depth = Number.parseInt(draft, 10);
  if (!Number.isFinite(depth)) return 1;
  return Math.min(31, Math.max(1, depth));
}

/**
 * When the payment comes back, said in full.
 *
 * ── Why it is needed ────────────────────────────────────────────────────────
 * A "day of the month" field on its own is consistent with "every month" and with nothing else:
 * in "every year", that day of which month? The answer is that the month is set by the
 * LAST PAYMENT —a yearly one comes back twelve months after the previous one— and the day is
 * this one. That cannot be guessed by looking at a loose number, so it is written out.
 *
 * The alternative was to also ask for the month, but it would be a piece of data the system
 * already has: it would force declaring the same thing twice and keeping them in
 * agreement.
 */
export function whenItRecurs(periodicity: Periodicity, day: number, month: number): string {
  if (periodicity === 'monthly') return t('centers.recurrence.summary.monthly', { day });
  if (periodicity === 'annual')
    return t('centers.recurrence.summary.annual', {
      day,
      month: (MONTHS[month - 1] ?? '').toLowerCase(),
    });

  const step = { bimonthly: 2, quarterly: 3, semiannual: 6 }[periodicity];

  // The specific months, not "every three months": that is what has to be
  // checkable at a glance before saving.
  const months: string[] = [];
  for (let m = (month - 1) % step; m < 12; m += step) months.push((MONTHS[m] ?? '').toLowerCase());

  return t('centers.recurrence.summary.everyFew', { day, months: months.join(', ') });
}

/**
 * What is going to happen in the months that do not reach that day.
 *
 * It is said BEFORE it happens, and with the specific months. "Se ajusta en los
 * meses cortos" forces you to imagine which ones; "en febrero será el 28" does not.
 */
export function shortMonthNotice(day: number): string {
  if (day <= 28) return '';

  if (day === 29) {
    return t('centers.recurrence.february28');
  }

  const thirtyDays = day === 31 ? t('centers.recurrence.also30') : '';
  return t('centers.recurrence.february2829', { thirtyDays });
}

function InstallmentsSwitch({ value, onChange }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex items-center gap-3 rounded-lg border border-border bg-card p-3',
        value.isAutoPay ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('centers.recurrence.inInstalments')}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {value.isAutoPay
            ? t('centers.recurrence.instalmentsNoAuto')
            : value.budget.trim() === ''
              ? t('centers.recurrence.instalmentsAverage')
              : t('centers.recurrence.instalmentsBudget')}
        </span>
      </span>

      <Switch
        checked={value.isMultiPayment}
        disabled={value.isAutoPay}
        onChange={(e) => onChange({ ...value, isMultiPayment: e.target.checked })}
      />
    </label>
  );
}

function AutoPaySwitch({ value, onChange }: RecurrenceFieldProps) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-card p-3',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">{t('centers.recurrence.autoPay')}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">
          {value.budget.trim() === ''
            ? t('centers.recurrence.autoPayAverage')
            : t('centers.recurrence.autoPayBudget')}
        </span>
      </span>

      <Switch
        checked={value.isAutoPay}
        disabled={value.isMultiPayment}
        onChange={(e) => onChange({ ...value, isAutoPay: e.target.checked })}
      />
    </label>
  );
}

function BudgetField({ value, onChange }: RecurrenceFieldProps) {
  return (
    <Field
      label={t('centers.recurrence.budget')}
      id="presupuesto"
      description={
        value.budget.trim() === ''
          ? t('centers.recurrence.budgetEmptyHelp')
          : t('centers.recurrence.budgetHelp')
      }
      className={value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3'}
    >
      <MoneyField
        id="presupuesto"
        value={value.budget}
        onValueChange={(budget) => onChange({ ...value, budget })}
        placeholder={t('centers.recurrence.optional')}
      />
    </Field>
  );
}

/** Once a year it is THE month; every few months, the month the cycle starts on. */
const monthLabel = (periodicity: Periodicity): string =>
  periodicity === 'annual' ? t('centers.recurrence.month') : t('centers.recurrence.cycleMonth');

/** What shows up below the switch when the payment is recurring. */
function RecurrenceDetails({ value, onChange }: RecurrenceFieldProps) {
  return (
    <div
      className={cn(
        'grid gap-3 rounded-b-lg border-t border-border bg-muted/40 p-3',
        // As many columns as there are fields: with two fixed columns, the
        // third field was left alone on a row at half width, and the
        // row looked cut in half.
        value.periodicity === 'monthly' ? 'sm:grid-cols-2' : 'sm:grid-cols-3',
      )}
    >
      <Field label={t('centers.recurrence.howOften')} id="periodicidad">
        <Select
          id="periodicidad"
          label={t('centers.recurrence.periodicity.label')}
          value={value.periodicity}
          options={PERIODICITIES.map((p) => ({ value: p, label: LABELS[p] }))}
          onChange={(v) => onChange({ ...value, periodicity: v as Periodicity })}
        />
      </Field>

      {value.periodicity !== 'monthly' && (
        <Field label={monthLabel(value.periodicity)} id="mes-de-pago">
          <Select
            id="mes-de-pago"
            label={t('centers.recurrence.month')}
            value={String(value.paymentMonth)}
            options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))}
            onChange={(v) => onChange({ ...value, paymentMonth: Number(v) })}
          />
        </Field>
      )}

      <DayField
        day={value.paymentDay}
        onChange={(paymentDay) => onChange({ ...value, paymentDay })}
      />

      {/*
        ── How much, below when ────────────────────────────────────────
        Full width and on its own row, not as one more column of
        the grid above. That one answers WHEN it comes back —how often,
        which month, which day—, which are three forms of the same question; this
        is another one, and on the same row it would read as a fourth setting of the
        calendar.
      */}
      <BudgetField value={value} onChange={onChange} />

      {/*
        ── Charged on its own ──────────────────────────────────────────
        Below the budget and not above, because it depends on it to be
        a good idea: without a budget, the transaction is created with the
        average of the previous months, which is an estimate. It is allowed
        anyway —there are expenses that vary and are still set up as direct debits— and that is why the
        transaction that gets created SAYS so in its notes.

        A whole row with its explanation, like the switch above,
        and not one more field of the grid: it switches on a behavior, it does not
        save a piece of data.
      */}
      <AutoPaySwitch value={value} onChange={onChange} />

      {/*
        ── Covered in pieces ───────────────────────────────────────────
        Below automatic payment because they are the two sides of the same
        question —«how is this settled?»— and because they exclude each other: the one
        above says it is charged on its own, in full, on the day it is due; this one says
        it is covered in several trips and nobody knows how many.

        They EXCLUDE each other on the screen, and not only on the server. Leaving both
        switchable so that the API answers 422 is making the rule be
        discovered by failing; switching the other off when one is switched on would be changing
        a setting someone did not touch. What is left is to say it: the one that
        cannot be used is off and explains why.
      */}
      <InstallmentsSwitch value={value} onChange={onChange} />

      <WhenItReturns value={value} />
    </div>
  );
}

interface RecurrenceFieldProps {
  value: Recurrence;
  onChange: (next: Recurrence) => void;
}

/** When it comes back, said in words. */
function WhenItReturns({ value }: { value: Recurrence }) {
  return (
    <p
      className={cn(
        'text-xs text-muted-foreground',
        value.periodicity === 'monthly' ? 'sm:col-span-2' : 'sm:col-span-3',
      )}
    >
      {whenItRecurs(value.periodicity, value.paymentDay, value.paymentMonth)}{' '}
      {shortMonthNotice(value.paymentDay)}
    </p>
  );
}
