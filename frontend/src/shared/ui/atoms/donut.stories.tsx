import type { Meta, StoryObj } from '@storybook/react-vite';

import { Card } from './card';
import { Donut } from './donut';

/** Made-up slices: the catalog never shows real data. */
const SLICES = [
  { id: 1, name: 'Vivienda', value: 40 },
  { id: 2, name: 'Mercado', value: 25 },
  { id: 3, name: 'Transporte', value: 15 },
  { id: 4, name: 'Salud', value: 12 },
  { id: null, name: 'Sin clasificar', value: 8 },
];

const meta = {
  title: 'Atoms/Donut',
  component: Donut,
  args: { portions: SLICES, total: 100, isListVisible: true },
  decorators: [
    (Story) => (
      <Card className="max-w-lg p-4">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Donut>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithList: Story = {};

export const RingOnly: Story = { args: { isListVisible: false } };

export const Clickable: Story = { args: { onSelect: () => undefined } };

export const Empty: Story = { args: { portions: [], total: 0 } };
