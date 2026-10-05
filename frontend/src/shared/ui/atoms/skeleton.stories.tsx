import type { Meta, StoryObj } from '@storybook/react-vite';

import { Skeleton } from './skeleton';

const meta = {
  title: 'Atoms/Skeleton',
  component: Skeleton,
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Lines: Story = {
  render: () => (
    <div className="flex max-w-sm flex-col gap-2">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};
