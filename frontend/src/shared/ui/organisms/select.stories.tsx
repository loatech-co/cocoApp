import type { Meta, StoryObj } from '@storybook/react-vite';
import { Landmark } from 'lucide-react';
import { useState } from 'react';

import { Select } from './select';
import { Field } from '../atoms/field';

const OPTIONS = [
  { valor: 'hogar', etiqueta: 'Hogar' },
  { valor: 'costos-fijos', etiqueta: 'Costos fijos' },
  { valor: 'transporte', etiqueta: 'Transporte' },
];

function Controlled(props: { start?: string; tamano?: 'sm' | 'md'; disabled?: boolean }) {
  const [value, setValue] = useState(props.start ?? '');
  return (
    <Field label="Centro de costos" id="select-centro" className="max-w-sm">
      <Select
        id="select-centro"
        etiqueta="Centro de costos"
        valor={value}
        onCambiar={setValue}
        opciones={OPTIONS}
        vacio="Sin centro"
        tamano={props.tamano ?? 'md'}
        deshabilitado={props.disabled}
      />
    </Field>
  );
}

const meta = {
  title: 'Organisms/Select',
  component: Select,
  args: { valor: '', onCambiar: () => undefined, opciones: OPTIONS, etiqueta: 'Centro' },
  decorators: [
    (Story) => (
      <div className="min-h-64">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 1: replaces the native `<select>`. */
export const Empty: Story = { render: () => <Controlled /> };

export const Chosen: Story = { render: () => <Controlled start="hogar" /> };

export const Small: Story = { render: () => <Controlled start="hogar" tamano="sm" /> };

export const Disabled: Story = { render: () => <Controlled start="hogar" disabled /> };

export const WithIcon: Story = {
  args: { icono: Landmark, valor: 'hogar', className: 'max-w-sm' },
};

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'], focusWithin: ['.campo'] } },
  render: () => <Controlled start="hogar" />,
};
