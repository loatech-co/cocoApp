import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progreso } from './progreso';

const meta = {
  title: 'Atoms/Progreso',
  component: Progreso,
  args: { avance: 0.4, etiqueta: 'Leyendo el extracto' },
  argTypes: { avance: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progreso>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Start: Story = { args: { avance: 0 } };

export const Done: Story = { args: { avance: 1 } };

/** Past 1 is clamped: a rounding error never overflows the track. */
export const Overflow: Story = { args: { avance: 1.02 } };
