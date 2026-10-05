import type { Meta, StoryObj } from '@storybook/react-vite';

import { BLOQUE, Bloque } from './bloque';
import { Card } from './card';

const meta = {
  title: 'Atoms/Bloque',
  component: Bloque,
  args: { children: 'Un bloque dentro de una tarjeta.' },
  decorators: [
    (Story) => (
      <Card className="max-w-md p-4">
        <Story />
      </Card>
    ),
  ],
} satisfies Meta<typeof Bloque>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** `BLOQUE` is the class, for when the block has to be a `<button>` or a `<label>`. */
export const AsButton: Story = {
  render: () => (
    <button type="button" className={`${BLOQUE} w-full text-left text-sm`}>
      Un bloque que se pulsa
    </button>
  ),
};
