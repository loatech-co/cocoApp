import type { Meta, StoryObj } from '@storybook/react-vite';

import { Progress } from './progress';

const meta = {
  title: 'Atoms/Progress',
  component: Progress,
  args: { value: 0.4, label: 'Leyendo el extracto' },
  argTypes: { value: { control: { type: 'range', min: 0, max: 1, step: 0.01 } } },
  decorators: [
    (Story) => (
      <div className="max-w-sm">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Progress>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Start: Story = { args: { value: 0 } };

export const Done: Story = { args: { value: 1 } };

/** Past 1 is clamped: a rounding error never overflows the track. */
export const Overflow: Story = { args: { value: 1.02 } };
