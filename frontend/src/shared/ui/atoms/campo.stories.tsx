import type { Meta, StoryObj } from '@storybook/react-vite';

import { Campo } from './campo';
import { Input } from './input';
import { Textarea } from './textarea';

const meta = {
  title: 'Atoms/Campo',
  component: Campo,
  args: { etiqueta: 'Nombre', id: 'campo-nombre', children: null },
  render: (args) => (
    <Campo {...args} className="max-w-sm">
      <Input id={args.id} placeholder="Ej. Mercado" />
    </Campo>
  ),
} satisfies Meta<typeof Campo>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 13: the label starts where the placeholder would be. */
export const Empty: Story = {};

export const Filled: Story = {
  render: (args) => (
    <Campo {...args} className="max-w-sm">
      <Input id={args.id} defaultValue="Mercado" />
    </Campo>
  ),
};

/** The label floats up and takes the ring colour only with `:focus-visible`. */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['input'], focusWithin: ['.campo'] } },
};

export const WithHelp: Story = {
  args: { ayuda: 'Así se va a ver en la tabla de movimientos.' },
};

export const WithError: Story = {
  render: (args) => (
    <Campo {...args} className="max-w-sm" ayuda="El nombre ya existe.">
      <Input id={args.id} defaultValue="Mercado" aria-invalid />
    </Campo>
  ),
};

export const Multiline: Story = {
  args: { etiqueta: 'Nota', id: 'campo-nota' },
  render: (args) => (
    <Campo {...args} className="max-w-sm">
      <Textarea id={args.id} placeholder="Lo que haga falta recordar" />
    </Campo>
  ),
};
