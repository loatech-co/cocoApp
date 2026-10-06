import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Combo } from './combo';
import { Field } from '../atoms/field';

const START = [
  { valor: '1', etiqueta: 'Mercado' },
  { valor: '2', etiqueta: 'Aseo' },
  { valor: '3', etiqueta: 'Restaurantes' },
];

function Controlled(props: { start?: string; canCreate?: boolean; disabled?: boolean }) {
  const [value, setValue] = useState(props.start ?? '');
  const [options, setOptions] = useState(START);
  const create = (name: string) => {
    const created = { valor: String(options.length + 1), etiqueta: name };
    setOptions([...options, created]);
    setValue(created.valor);
  };
  return (
    <Field label="Concepto" id="combo-concepto" className="max-w-sm">
      <Combo
        id="combo-concepto"
        etiqueta="Concepto"
        valor={value}
        opciones={options}
        onCambiar={setValue}
        vacio="Sin concepto"
        deshabilitado={props.disabled ?? false}
        {...(props.canCreate ? { onCrear: create } : {})}
      />
    </Field>
  );
}

const meta = {
  title: 'Organisms/Combo',
  component: Combo,
  args: { etiqueta: 'Concepto', valor: '', opciones: START, onCambiar: () => undefined },
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

export const Creating: Story = { args: { creando: true, onCrear: () => undefined } };

export const Disabled: Story = { render: () => <Controlled start="1" disabled /> };

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'], focusWithin: ['.campo'] } },
  render: () => <Controlled start="1" />,
};
