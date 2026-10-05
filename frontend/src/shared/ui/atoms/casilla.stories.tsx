import type { Meta, StoryObj } from '@storybook/react-vite';

import { Casilla } from './casilla';

const meta = {
  title: 'Atoms/Casilla',
  component: Casilla,
  args: { 'aria-label': 'Elegir' },
} satisfies Meta<typeof Casilla>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Unchecked: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

/** A parent with only some children checked. */
export const Indeterminate: Story = { args: { indeterminado: true } };

export const Disabled: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Casilla {...args} disabled />
      <Casilla {...args} disabled defaultChecked />
    </div>
  ),
};

export const FocusVisible: Story = {
  args: { defaultChecked: true },
  parameters: { pseudo: { focusVisible: ['input'] } },
};
