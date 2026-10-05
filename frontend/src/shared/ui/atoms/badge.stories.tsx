import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Badge, Chip, Etiqueta } from './badge';

const TONES = [
  'neutro',
  'apagado',
  'contorno',
  'ingreso',
  'gasto',
  'pendiente',
  'info',
  'error',
] as const;

const meta = {
  title: 'Atoms/Badge',
  component: Etiqueta,
  args: { children: 'Pendiente', tono: 'pendiente' },
  argTypes: { tono: { control: 'select', options: TONES } },
} satisfies Meta<typeof Etiqueta>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const LabelTones: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TONES.map((tono) => (
        <Etiqueta key={tono} tono={tono}>
          {tono}
        </Etiqueta>
      ))}
    </div>
  ),
};

function ToggleChips() {
  const [active, setActive] = useState(true);
  const [filters, setFilters] = useState(['Costos fijos', 'Mercado']);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip activo={active} onClick={() => setActive(!active)}>
        Solo pendientes
      </Chip>
      <Chip>Apagado</Chip>
      <Chip disabled>Deshabilitado</Chip>
      {filters.map((filter) => (
        <Chip
          key={filter}
          etiquetaDeQuitar={`Quitar ${filter}`}
          onQuitar={() => setFilters(filters.filter((f) => f !== filter))}
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
