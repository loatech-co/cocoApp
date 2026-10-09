import { type Dashboard, type CategorySpend } from '@/shared/api/generated/model';
import { longRange, formatCOP } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Tag } from '@/shared/ui/atoms/badge';
import { Card, CardContent } from '@/shared/ui/atoms/card';

/** The four dashboard indicators. */
export function DashboardKpis({ data, isUpToDate }: { data: Dashboard; isUpToDate: boolean }) {
  /*
      Four indicators: TWO at a time from the phone and four at a time on a
      wide screen. In three columns, the fourth was left alone in a
      row of its own.

      Two at a time and not one, which is what there was below 640: four
      stacked cards are four screenfuls of scrolling before
      reaching the chart, and the figures that have to be compared —what you need
      to have against what has been spent so far— were never seen at once.
      In two columns all four fit at a glance.
  */
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-5 xl:grid-cols-4">
      {/*
        It goes FIRST, before what was spent, because it is read first: how much you need
        to have and then how much has been spent so far.

        In a CLOSED period the necessary budget was exactly what
        it cost: it is no longer a forecast, it is a fact. Showing the
        current month's forecast there would be answering with another
        month's data, and leaving the slot empty would suggest that in 2024 there were no
        fixed costs.
      */}
      <Kpi
        label={t('transactions.kpis.budgetNeeded')}
        value={formatCOP(isUpToDate ? data.requiredBudget : data.range.expense)}
        detail={
          isUpToDate
            ? t('transactions.kpis.fixedCostsThisMonth')
            : t('transactions.kpis.periodCost')
        }
      />
      <Kpi
        label={t('transactions.kpis.periodExpenses')}
        value={formatCOP(data.range.expense)}
        // How much was fixed and how much variable. The names are the ones of the
        // cost centers, so if tomorrow they are called something else,
        // the indicator says so by itself.
        breakdown={data.expenseByCostCenter}
        accent="expense"
      />
      {/* Disabled, not hidden: income exists in the model —the
          dashboard already adds it up— and removing the card would suggest the
          app does not know about it. Disabled says it will, and the zero
          stays because it is today's fact: there is no income
          recorded. It is the same treatment as the «Ingreso» option of the
          new-transaction menu. */}
      <Kpi
        label={t('transactions.kpis.periodIncome')}
        value={formatCOP(data.range.income)}
        isSoon
      />
      <Kpi
        label={t('transactions.kpis.movements')}
        value={String(data.range.count)}
        detail={longRange(data.period.from, data.period.to)}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  detail,
  breakdown,
  accent,
  isSoon = false,
}: {
  label: string;
  value: string;
  detail?: string;
  /** How the figure is split. Written below, with its name and its amount. */
  breakdown?: CategorySpend[];
  accent?: 'income' | 'expense';
  /**
   * The figure is real but the section is not there yet: it is dimmed and labeled.
   *
   * Dimmed and not hidden, which is this app's rule for what is
   * coming: removing it would suggest the app does not know about it. And the value
   * stays in sight —an indicator without a figure is not an indicator— only
   * without a data color, because painting it like the others would say it is already live.
   */
  isSoon?: boolean;
}) {
  return (
    <Card>
      {/*
        ── No icon ───────────────────────────────────────────────────────────
        It carried a colored pastel with a glyph inside, and it said nothing the
        label did not already say: a wallet next to «Presupuesto necesario», a
        receipt next to «Movimientos». An icon that repeats the word next
        to it does not help find anything; it only takes 40px of width from the
        figure, which is the only thing you come to read here.

        Different is the icon that replaces a word —the one on a button with no
        text— or the one that tells apart things of the same kind. Neither of the
        two was the case.
      */}
      {/* 12 of padding on the phone and not 16: with two cards per row, each
          one measures about 170px, and 16 per side takes almost a
          fifth of the width left to the figure. */}
      {/* Dimmed with the theme's ink and not with opacity: at 60 % the label
          and the tag dropped to 2.6:1 and 2.3:1. The label, the figure and the
          tag already use `muted-foreground`, which gives more than 5:1. */}
      <CardContent className="p-3 sm:p-6">
        <div className="min-w-0">
          {/* No sustained capitals and no open letter-spacing. It was the
              small-caps label of the classic admin panel, and with the
              theme's typeface —which declares letter-spacing at zero— it reads
              as if it came from another product. A lowercase label reads
              at a glance; in sustained capitals it has to be deciphered letter by letter. */}
          <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className="min-w-0 truncate">{label}</span>
            {/* The same tag as in the rest of the app, not a hand-made
                label: `Tag` already decides its rounding, its padding and its
                font size. */}
            {isSoon && (
              <Tag tone="muted" className="shrink-0">
                {t('transactions.kpis.soon')}
              </Tag>
            )}
          </p>
          <p className={figureClassName(isSoon, accent)}>{value}</p>
          {detail && <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>}

          {/* Wraps instead of truncating: a split cut in half —"Costos fij…"—
              does not say less, it says something else. Each part stays whole and
              moves to the next line if the card is narrow. */}
          {breakdown && breakdown.length > 0 && <Breakdown partes={breakdown} />}
        </div>
      </CardContent>
    </Card>
  );
}

// `sm:text-3xl` and not some 28px by hand: 30 is the step that
// follows 24 on the scale, and the difference from 28 nobody
// notices —the one of having a size off the scale, they do—.
//
// And 20 on the phone, one step below the 24 it had.
// Since the cards go two at a time, each one measures half
// the screen: «$1.234.567» at 24px did not fit and got cut, and an
// indicator with its figure truncated indicates nothing.
function figureClassName(isSoon: boolean, accent: 'income' | 'expense' | undefined): string {
  return (
    'tabular mt-1 truncate text-xl font-semibold leading-tight sm:text-3xl ' +
    (isSoon
      ? 'text-muted-foreground'
      : accent === 'income'
        ? 'text-income'
        : accent === 'expense'
          ? 'text-expense'
          : '')
  );
}

/* Wraps instead of truncating: a split cut in half —"Costos fij…"—
   does not say less, it says something else. Each part stays whole and
   moves to the next line if the card is narrow. */
function Breakdown({ partes }: { partes: CategorySpend[] }) {
  return (
    <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
      {partes.map((part) => (
        <span key={part.categoryId ?? part.name} className="whitespace-nowrap">
          {part.name}{' '}
          <strong className="tabular font-semibold text-foreground">{formatCOP(part.total)}</strong>
        </span>
      ))}
    </p>
  );
}
