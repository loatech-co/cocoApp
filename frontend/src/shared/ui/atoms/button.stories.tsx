import type { Meta, StoryObj } from '@storybook/react-vite';
import { Plus, Trash2 } from 'lucide-react';

import { Button, type ButtonProps } from './button';

const VARIANTS = [
  'default',
  'acento',
  'secondary',
  'outline',
  'ghost',
  'link',
  'destructive',
] as const;

const meta = {
  title: 'Atoms/Button',
  component: Button,
  args: { children: 'Registrar', variant: 'default', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: {
      control: 'select',
      options: ['sm', 'md', 'sm-icon', 'md-icon', 'sm-icon-redondo'],
    },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

const renderVariants = (args: ButtonProps) => (
  <div className="flex flex-wrap gap-3">
    {VARIANTS.map((variant) => (
      <Button key={variant} {...args} variant={variant}>
        {variant}
      </Button>
    ))}
  </div>
);

export const Variants: Story = { render: renderVariants };

/** Rule 4: `sm` 36px and `md` 44px; the icon sizes are the same heights, square. */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-3">
      <Button {...args} size="sm">
        <Plus />
        Nuevo
      </Button>
      <Button {...args} size="md">
        <Plus />
        Nuevo
      </Button>
      <Button {...args} size="sm-icon" aria-label="Eliminar">
        <Trash2 />
      </Button>
      <Button {...args} size="md-icon" aria-label="Eliminar">
        <Trash2 />
      </Button>
      <Button {...args} size="sm-icon-redondo" aria-label="Nuevo">
        <Plus />
      </Button>
    </div>
  ),
};

export const Disabled: Story = {
  args: { disabled: true },
  render: renderVariants,
};

export const Hover: Story = {
  parameters: { pseudo: { hover: true } },
  render: renderVariants,
};

/** Rule 18: a button draws no focus ring, not even with the keyboard. */
export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: true } },
  render: renderVariants,
};
