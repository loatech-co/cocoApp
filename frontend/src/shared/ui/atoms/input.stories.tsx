import type { Meta, StoryObj } from '@storybook/react-vite';
import { Eye, Mail, Search, X } from 'lucide-react';

import { Button } from './button';
import { Input } from './input';

const meta = {
  title: 'Atoms/Input',
  component: Input,
  args: { placeholder: 'Ej. Mercado', tamano: 'md', 'aria-label': 'Nombre' },
  argTypes: { tamano: { control: 'inline-radio', options: ['sm', 'md'] } },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Rule 4: the same 36 and 44px as the button. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-col gap-3">
      <Input {...args} tamano="sm" />
      <Input {...args} tamano="md" />
    </div>
  ),
};

export const Filled: Story = { args: { defaultValue: 'Mercado' } };

/** Left: informative. Right: up to two actions. */
export const WithIcons: Story = {
  args: {
    icono: Mail,
    type: 'email',
    defaultValue: 'nombre@ejemplo.com',
    acciones: [
      <Button key="borrar" variant="ghost" size="sm-icon" aria-label="Borrar">
        <X />
      </Button>,
      <Button key="ver" variant="ghost" size="sm-icon" aria-label="Ver">
        <Eye />
      </Button>,
    ],
  },
};

export const SearchField: Story = { args: { icono: Search, placeholder: 'Buscar' } };

export const Disabled: Story = { args: { disabled: true, defaultValue: 'No se puede cambiar' } };

export const Invalid: Story = { args: { 'aria-invalid': true, defaultValue: 'Mercado' } };

/** Rule 18: one pixel of ring colour, only with `:focus-visible`. */
export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: ['input'] } } };
