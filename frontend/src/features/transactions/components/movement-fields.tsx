import type { ComponentProps } from 'react';

import { t } from '@/shared/lib/i18n';
import { Field } from '@/shared/ui/atoms/field';
import { Textarea } from '@/shared/ui/atoms/textarea';
import { MoneyField } from '@/shared/ui/molecules/money-field';

import { DateSelector } from './date-selector';
import { MovementClassification } from './movement-classification';
import { WhatWasRead, CouldNotRead } from './reading-notices';

/**
 * The column of fields, when the sheet can be edited.
 *
 * The order is the question's: which center, which category, which
 * concept. And then how much and when, which are the two facts copied from the
 * paper. No section label: three fields with their name on them do not need
 * someone announcing that they are three fields.
 */
export function MovementFields(props: ComponentProps<typeof MovementClassification>) {
  const { sheet } = props;

  return (
    <div className="flex flex-col gap-3">
      {/*
        The notice of what was read, INSIDE the fields column.

        It was above the grid, at full width, and what it says —«verifica
        esto antes de guardar»— has nothing to do with the receipt on the
        left: it talks about the fields on the right, which are the ones that
        filled themselves in. Heading its column, it is the label of what is
        below; across the whole sheet, it was a billboard.
      */}
      {sheet.reading && <WhatWasRead />}
      {sheet.unreadNotice && <CouldNotRead text={sheet.unreadNotice} />}

      <MovementClassification {...props} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={t('transactions.fields.amount')} id="mov-valor">
          {/* Groups the thousands while typing and keeps the cursor. The long why
              is in the component. */}
          <MoneyField
            id="mov-valor"
            value={sheet.amount}
            onValueChange={sheet.setAmount}
            placeholder="0"
            required
          />
        </Field>

        <Field label={t('transactions.fields.date')} id="mov-fecha">
          <DateSelector id="mov-fecha" value={sheet.date} onSelect={sheet.setDate} required />
        </Field>
      </div>

      {/*
        The notes, inside the fields column and right next to the others.

        They were under the grid and at full width: a box a thousand
        pixels wide for three lines that are almost never written. And with no `mt-auto`:
        a note about this transaction is one more field of the ones filled in
        when recording it, and it goes where the next one goes, not where there is room to spare.
      */}
      <Field label={t('transactions.fields.notes')} id="mov-notas">
        {/* No placeholder. It said «Opcional», which is not an example of what goes
            there but a note about validation: this field has no
            `required`, and that is already known because the form is submitted without it. */}
        <Textarea
          id="mov-notas"
          value={sheet.notes}
          onChange={(e) => sheet.setNotes(e.target.value)}
          rows={3}
        />
      </Field>
    </div>
  );
}
