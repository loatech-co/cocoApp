import type { Meta, StoryObj } from '@storybook/react-vite';

import { Monto, Saldo } from './monto';

/** Made-up figures: the catalogue never shows real amounts. */
const meta = {
  title: 'Atoms/Monto',
  component: Monto,
  args: { amount: '123456', type: 'expense', soloTexto: false },
  argTypes: { type: { control: 'inline-radio', options: ['income', 'expense', 'transfer'] } },
} satisfies Meta<typeof Monto>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** The sign, not only the colour, says which way the money went (rule 16). */
export const Types: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Monto amount="123456" type="income" />
      <Monto amount="123456" type="expense" />
      <Monto amount="123456" type="transfer" />
    </div>
  ),
};

export const TextOnly: Story = { args: { soloTexto: true } };

export const Balances: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Saldo amount="98765" />
      <Saldo amount="-98765" />
      <Saldo amount="0" />
    </div>
  ),
};
