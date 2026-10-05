import type { Meta, StoryObj } from '@storybook/react-vite';

import { Interruptor } from './interruptor';

const meta = {
  title: 'Atoms/Interruptor',
  component: Interruptor,
  args: { 'aria-label': 'Centro estático' },
} satisfies Meta<typeof Interruptor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = { args: { defaultChecked: true } };

export const Disabled: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Interruptor {...args} disabled />
      <Interruptor {...args} disabled defaultChecked />
    </div>
  ),
};

export const FocusVisible: Story = {
  args: { defaultChecked: true },
  parameters: { pseudo: { focusVisible: true } },
};
