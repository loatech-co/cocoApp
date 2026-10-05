import type { Meta, StoryObj } from '@storybook/react-vite';

import { Logo, LogoCompacto } from './logo';

const meta = {
  title: 'Atoms/Logo',
  component: Logo,
} satisfies Meta<typeof Logo>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = { args: { className: 'h-10' } };

export const Compact: Story = { render: () => <LogoCompacto className="size-10" /> };
