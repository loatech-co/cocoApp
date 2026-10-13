import { Loader2 } from 'lucide-react';
import { useState } from 'react';

import { yearOptions } from '@/features/cost-centers/model/renewal-pause';
import { capitalize, LONG_MONTHS } from '@/shared/lib/format';
import { t } from '@/shared/lib/i18n';
import { Button } from '@/shared/ui/atoms/button';
import { Field } from '@/shared/ui/atoms/field';
import { Select } from '@/shared/ui/organisms/select';

const MONTH_OPTIONS = LONG_MONTHS.map((name, i) => ({
  value: String(i + 1).padStart(2, '0'),
  label: capitalize(name),
}));

interface MonthQuestionProps {
  /** The question, as the person reads it: «¿Desde qué mes queda en pausa?». */
  question: string;
  /** Where the picker starts, `YYYY-MM`. */
  initial: string;
  today: string;
  confirmLabel: string;
  isBusy: boolean;
  onConfirm: (month: string) => void;
  onCancel: () => void;
}

/**
 * Asks for a MONTH: the unit a pause is measured in (ADR 0036).
 *
 * Two selects —month and year— and not the calendar: the calendar picks a
 * day, and offering days here would suggest a pause can start on the 15th. It
 * opens in place, inside the concept's form, instead of in a dialog on top
 * of it: the question is about the concept being looked at, and a second
 * layer would cover it.
 */
export function MonthQuestion({
  question,
  initial,
  today,
  confirmLabel,
  isBusy,
  onConfirm,
  onCancel,
}: MonthQuestionProps) {
  const [year, setYear] = useState(initial.slice(0, 4));
  const [month, setMonth] = useState(initial.slice(5, 7));
  const years = yearOptions(today, initial).map((y) => ({ value: y, label: y }));

  return (
    <div role="group" aria-label={question} className="flex flex-col gap-3">
      <p className="text-sm font-medium">{question}</p>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t('centers.pause.month')} id="pause-month">
          <Select
            id="pause-month"
            label={t('centers.pause.month')}
            value={month}
            options={MONTH_OPTIONS}
            onChange={setMonth}
          />
        </Field>
        <Field label={t('centers.pause.year')} id="pause-year">
          <Select
            id="pause-year"
            label={t('centers.pause.year')}
            value={year}
            options={years}
            onChange={setYear}
          />
        </Field>
      </div>
      <QuestionActions
        confirmLabel={confirmLabel}
        isBusy={isBusy}
        onConfirm={() => onConfirm(`${year}-${month}`)}
        onCancel={onCancel}
      />
    </div>
  );
}

function QuestionActions({
  confirmLabel,
  isBusy,
  onConfirm,
  onCancel,
}: {
  confirmLabel: string;
  isBusy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onCancel}>
        {t('common.cancel')}
      </Button>
      <Button type="button" size="sm" disabled={isBusy} onClick={onConfirm}>
        {isBusy && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
        {confirmLabel}
      </Button>
    </div>
  );
}
