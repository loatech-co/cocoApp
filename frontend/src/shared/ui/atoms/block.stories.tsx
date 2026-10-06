import type { Meta, StoryObj } from '@storybook/react-vite';

import { BLOCK, Block } from './block';
import { Card } from './card';

const meta = {
  title: 'Atoms/Block',
  component: Block,
  args: { children: 'Un bloque dentro de una tarjeta.' },
  decorators: [
    (Story) => (
      <Card className="max-w-md p-4">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Block>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `BLOQUE` is the class, for when the block has to be a `<button>` or a `<label>`. */
export const AsButton: Story = {
  render: () => (
    <button type="button" className={`${BLOCK} w-full text-left text-sm`}>
      Un bloque que se pulsa
    </button>
  ),
};
