import type { Meta, StoryObj } from '@storybook/react-vite';
import { Info } from 'lucide-react';

import { WithTooltip } from './tooltip';

const meta = {
  title: 'Atoms/WithTooltip',
  component: WithTooltip,
  args: {
    text: 'Lo que falta por clasificar',
    children: <Info className="size-4" aria-label="Más información" />,
  },
  decorators: [
    (Story) => (
      <div className="pt-16">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof WithTooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Hover the icon to see the floating hint (rule 9). */
export const Default: Story = {};
