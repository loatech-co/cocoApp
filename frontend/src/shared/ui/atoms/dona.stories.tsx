import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card } from './card';
import { Dona } from './dona';

/** Made-up slices: the catalogue never shows real data. */
const SLICES = [
  { id: 1, nombre: 'Vivienda', valor: 40 },
  { id: 2, nombre: 'Mercado', valor: 25 },
  { id: 3, nombre: 'Transporte', valor: 15 },
  { id: 4, nombre: 'Salud', valor: 12 },
  { id: null, nombre: 'Sin clasificar', valor: 8 },
];

const meta = {
  title: 'Atoms/Dona',
  component: Dona,
  args: { porciones: SLICES, total: 100, mostrarLista: true },
  decorators: [
    (Story) => (
      <Card className="max-w-lg p-4">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Dona>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithList: Story = {};

export const RingOnly: Story = { args: { mostrarLista: false } };

export const Clickable: Story = { args: { onElegir: () => undefined } };

export const Empty: Story = { args: { porciones: [], total: 0 } };
