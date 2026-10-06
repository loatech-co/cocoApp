import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Badge, Chip, Tag } from './badge';

const TONES = [
  'neutral',
  'muted',
  'outline',
  'income',
  'expense',
  'pending',
  'info',
  'error',
] as const;

const meta = {
  title: 'Atoms/Badge',
  component: Tag,
  args: { children: 'Pendiente', tone: 'pending' },
  argTypes: { tone: { control: 'select', options: TONES } },
} satisfies Meta<typeof Tag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LabelTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((tone) => (
        <Tag key={tone} tone={tone}>
          {tone}
        </Tag>
      ))}
    </div>
  ),
};

function ToggleChips() {
  const [isActive, setIsActive] = useState(true);
  const [filters, setFilters] = useState(['Costos fijos', 'Mercado']);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip isActive={isActive} onClick={() => setIsActive(!isActive)}>
        Solo pendientes
      </Chip>
      <Chip>Apagado</Chip>
      <Chip disabled>Deshabilitado</Chip>
      {filters.map((filter) => (
        <Chip
          key={filter}
          removeLabel={`Quitar ${filter}`}
          onRemove={() => setFilters(filters.filter((f) => f !== filter))}
        >
          {filter}
        </Chip>
      ))}
    </div>
  );
}

/** A chip is pressed: on/off with `aria-pressed`, or a filter with its own ×. */
export const Chips: Story = { render: () => <ToggleChips /> };

export const ChipsFocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'] } },
  render: () => <ToggleChips />,
};

/** The old shadcn name, kept until the screens that use it migrate. */
export const LegacyBadge: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {(['default', 'outline', 'income', 'expense', 'warning', 'info'] as const).map((v) => (
        <Badge key={v} variant={v}>
          {v}
        </Badge>
      ))}
    </div>
  ),
};
