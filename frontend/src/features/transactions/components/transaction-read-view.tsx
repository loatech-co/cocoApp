import { ArrowUpRight } from 'lucide-react';

import { type TransactionType } from '@/shared/api/generated/model';
import { longDay, longMonth, formatMoney } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { cn } from '@/shared/lib/utils';
import { Card } from '@/shared/ui/atoms/card';
import { Section } from '@/shared/ui/molecules/section';

interface ReadViewProps {
  type: TransactionType;
  name: string;
  value: string;
  /** ISO 4217 code of the movement being read. */
  currency: string;
  date: string;
  /** `YYYY-MM-DD` of day 1 of the month the expense BELONGS to. */
  period?: string | undefined;
  path: string[];
}

/**
 * The data column when you are only looking: the transaction and, if
 * there are any, its notes.
 *
 * The notes go with what the data says and not under the receipts: the
 * receipt is the proof of what happened and the note is someone's comment
 * about it, so it goes on the side where what happened is told.
 */
export function TransactionReadColumn({ notes, ...reading }: ReadViewProps & { notes: string }) {
  return (
    <div className="flex flex-col gap-4">
      <ReadView {...reading} />

      {notes.trim() !== '' && (
        <Section title={t('transactions.fields.notes')}>
          {/* `whitespace-pre-line`: notes are written with line breaks
              and flattening them turns a list into a paragraph. */}
          <p className="whitespace-pre-line text-sm">{notes}</p>
        </Section>
      )}
    </div>
  );
}

/**
 * The transaction when you are only looking.
 *
 * ── Why these are not the same fields, disabled ─────────────────────────────
 * Because a disabled field is still a field: it has its frame, its label
 * above and its control height, and it takes the place of a box where you could
 * type even though you cannot. Eight of those, one under another, are a
 * form that will not let itself be filled —which reads as a fault— when what
 * you came to do is READ a piece of data: how much, when, for what.
 *
 * ── Where the hierarchy comes from ──────────────────────────────────────────
 * From not everything weighing the same. The amount rules: it goes big, in its color. Below,
 * its two inseparable facts —what it is for and when it was paid— in the same box,
 * because they are read together.
 *
 * ── Split in two: HOW MUCH on top, what for below ───────────────────────────
 * Together, the amount had four lines stuck under it and the block read like
 * a paragraph that starts with a big number. The line splits them into two
 * registers: the fact you came to see, and the context that explains it.
 *
 * And it is a real CARD: `Card` is the surface the app already uses
 * for "this is one thing", and here it says the same: the transaction is an object, and
 * what is below is its attachments.
 */
function ReadView({ type, name, value, currency, date, period, path }: ReadViewProps) {
  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <div className="px-4 py-5">
          {/*
            NO `tabular`: there is no column here, there is a single big number, and
            the fixed width of tabular figures spreads the digits apart as if
            someone had added letter-spacing.

            An arrow, not a sign. A minus in front of an amount is a
            TABLE convention; here the whole sheet is an expense, and the
            title says so. The arrow says the same thing better: up and out, down and in.

            36px and the same on every screen: it is the main fact, not
            the only one.
          */}
          <p className="flex items-center gap-2 font-display text-4xl font-bold leading-none text-accent-ink">
            <ArrowUpRight
              className={cn('size-8 shrink-0 sm:size-10', type === 'income' && 'rotate-180')}
              strokeWidth={2.75}
              aria-hidden="true"
            />
            {formatMoney(value || '0', currency)}
          </p>
        </div>

        <ReadDetails name={name} date={date} period={period} path={path} />
      </Card>

      {path.length === 0 && (
        <p className="text-sm text-muted-foreground">{t('transactions.readView.unclassified')}</p>
      )}
    </div>
  );
}

/** What it is for and when it was paid, under the amount. */
function ReadDetails({
  name,
  date,
  period,
  path,
}: Pick<ReadViewProps, 'name' | 'date' | 'period' | 'path'>) {
  // The period is only named when it is NOT the month of the payment. Repeating
  // "septiembre" twice in a row says nothing; saying it when the August bill
  // was paid in September does —it is what throws off the totals of whoever
  // does not notice—.
  const paymentMonth = date.slice(0, 7);
  const isStale = period !== undefined && period !== '' && period.slice(0, 7) !== paymentMonth;

  return (
    <div className="flex flex-col gap-1 border-t border-border px-4 py-3">
      <p className="truncate text-base font-medium">{name || t('transactions.noConcept')}</p>

      {/* The path, with no label and no chips. With chips they looked like tabs
          —something you tap that changes what is below— and nothing is tapped here: it is
          where this transaction lives, which reads as a path. */}
      {path.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          {path.map((segment, i) => (
            <span key={segment} className="flex items-center gap-1.5">
              {i > 0 && <span aria-hidden="true">›</span>}
              <span className={cn(i === path.length - 1 && 'font-medium text-foreground')}>
                {segment}
              </span>
            </span>
          ))}
        </p>
      )}

      <p className="mt-1 text-xs text-muted-foreground">
        {t('transactions.readView.paidOn', { day: longDay(date) })}
      </p>

      {isStale && (
        <p className="text-xs font-medium text-warning">
          {t('transactions.readView.belongsTo', { month: longMonth(period.slice(0, 7)) })}
        </p>
      )}
    </div>
  );
}
