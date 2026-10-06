import type { Meta, StoryObj } from '@storybook/react-vite';

import { Amount, Balance } from './amount';

/** Made-up figures: the catalogue never shows real amounts. */
const meta = {
  title: 'Atoms/Amount',
  component: Amount,
  args: { amount: '123456', direction: 'out', isTextOnly: false },
  argTypes: { direction: { control: 'inline-radio', options: ['in', 'out', 'transfer'] } },
} satisfies Meta<typeof Amount>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The sign, not only the colour, says which way the money went (rule 16). */
export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Amount amount="123456" direction="in" />
      <Amount amount="123456" direction="out" />
      <Amount amount="123456" direction="transfer" />
    </div>
  ),
};

export const TextOnly: Story = { args: { isTextOnly: true } };

export const Balances: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Balance amount="98765" />
      <Balance amount="-98765" />
      <Balance amount="0" />
    </div>
  ),
};
