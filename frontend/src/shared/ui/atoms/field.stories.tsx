import type { Meta, StoryObj } from '@storybook/react-vite';

import { Field } from './field';
import { Input } from './input';
import { Textarea } from './textarea';

const meta = {
  title: 'Atoms/Field',
  component: Field,
  args: { label: 'Nombre', id: 'campo-nombre', children: null },
  render: (args) => (
    <Field {...args} className="max-w-sm">
      <Input id={args.id} placeholder="Ej. Mercado" />
    </Field>
  ),
} satisfies Meta<typeof Field>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 13: the label starts where the placeholder would be. */
export const Empty: Story = {};

export const Filled: Story = {
  render: (args) => (
    <Field {...args} className="max-w-sm">
      <Input id={args.id} defaultValue="Mercado" />
    </Field>
  ),
};

/**
 * The label floats up and takes the ring color only with `:focus-visible`.
 *
 * `focus` too: the placeholder comes back with `:focus` (`input.tsx`), and a
 * real browser never has `:focus-visible` without `:focus`. Simulating only
 * the first left the placeholder transparent under the raised label, which
 * read as a bug of the component; in a browser it shows in both themes.
 */
export const FocusVisible: Story = {
  parameters: { pseudo: { focus: ['input'], focusVisible: ['input'], focusWithin: ['.field'] } },
};

export const WithHelp: Story = {
  args: { description: 'Así se va a ver en la tabla de movimientos.' },
};

export const WithError: Story = {
  render: (args) => (
    <Field {...args} className="max-w-sm" description="El nombre ya existe.">
      <Input id={args.id} defaultValue="Mercado" aria-invalid />
    </Field>
  ),
};

export const Multiline: Story = {
  args: { label: 'Nota', id: 'campo-nota' },
  render: (args) => (
    <Field {...args} className="max-w-sm">
      <Textarea id={args.id} placeholder="Lo que haga falta recordar" />
    </Field>
  ),
};
