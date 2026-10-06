import type { Meta, StoryObj } from '@storybook/react-vite';

import { Logo, CompactLogo } from './logo';

const meta = {
  title: 'Atoms/Logo',
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = { args: { className: 'h-10' } };

export const Compact: Story = { render: () => <CompactLogo className="size-10" /> };
