import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { MoneyField } from './money-field';
import { Field } from '../atoms/field';

function Controlled({ start, isInvalid = false }: { start: string; isInvalid?: boolean }) {
  const [value, setValue] = useState(start);
  return (
    <Field label="Valor" id="amount-field" className="max-w-sm">
      <MoneyField
        id="amount-field"
        value={value}
        onValueChange={setValue}
        aria-invalid={isInvalid}
      />
    </Field>
  );
}

const meta = {
  title: 'Molecules/MoneyField',
  component: MoneyField,
  args: { value: '', onValueChange: () => undefined },
} satisfies Meta<typeof MoneyField>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = { render: () => <Controlled start="" /> };

/** Only digits travel to the API; the thousands separator is drawn. */
export const Filled: Story = { render: () => <Controlled start="1250000" /> };

export const Invalid: Story = { render: () => <Controlled start="0" isInvalid /> };

export const Disabled: Story = {
  args: { value: '1250000', disabled: true, 'aria-label': 'Valor' },
};

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['input'], focusWithin: ['.field'] } },
  render: () => <Controlled start="1250000" />,
};
