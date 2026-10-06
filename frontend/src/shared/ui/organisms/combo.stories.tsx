import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Combo } from './combo';
import { Field } from '../atoms/field';

const START = [
  { value: '1', label: 'Mercado' },
  { value: '2', label: 'Aseo' },
  { value: '3', label: 'Restaurantes' },
];

function Controlled(props: { start?: string; canCreate?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState(props.start ?? '');
  const [options, setOptions] = useState(START);
  const create = (name: string) => {
    const created = { value: String(options.length + 1), label: name };
    setOptions([...options, created]);
    setValue(created.value);
  };
  return (
    <Field label="Concepto" id="combo-concepto" className="max-w-sm">
      <Combo
        id="combo-concepto"
        label="Concepto"
        value={value}
        options={options}
        onChange={setValue}
        emptyLabel="Sin concepto"
        disabled={props.disabled ?? false}
        {...(props.canCreate ? { onCreate: create } : {})}
      />
    </Field>
  );
}

const meta = {
  title: 'Organisms/Combo',
  component: Combo,
  args: { label: 'Concepto', value: '', options: START, onChange: () => undefined },
  decorators: [
    (Story) => (
      <div className="min-h-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Combo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A dropdown with a filter. */
export const Filter: Story = { render: () => <Controlled /> };

export const Chosen: Story = { render: () => <Controlled start="2" /> };

/** With `onCrear`, writing a missing name offers to create it (never rename, rule 15). */
export const CanCreate: Story = { render: () => <Controlled canCreate /> };

export const Creating: Story = { args: { isCreating: true, onCreate: () => undefined } };

export const Disabled: Story = { render: () => <Controlled start="1" disabled /> };

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'], focusWithin: ['.campo'] } },
  render: () => <Controlled start="1" />,
};
