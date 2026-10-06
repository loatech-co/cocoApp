import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Pager } from './pager';

function Controlled({ total, from = 1 }: { total: number; from?: number }) {
  const [page, setPage] = useState(from);
  return <Pager page={page} total={total} perPage={20} onPageChange={setPage} />;
}

const meta = {
  title: 'Atoms/Pager',
  component: Pager,
  args: { page: 1, total: 200, perPage: 20, onPageChange: () => undefined },
} satisfies Meta<typeof Pager>;

export default meta;
type Story = StoryObj<typeof meta>;

export const FirstPage: Story = { render: () => <Controlled total={200} /> };

export const MiddlePage: Story = { render: () => <Controlled total={400} from={10} /> };

export const LastPage: Story = { render: () => <Controlled total={200} from={10} /> };

export const FewPages: Story = { render: () => <Controlled total={60} /> };

/** With a single page it renders nothing: two dead buttons are just noise. */
export const SinglePage: Story = { args: { total: 10 } };

export const FocusVisible: Story = {
  parameters: { pseudo: { focusVisible: ['button'] } },
  render: () => <Controlled total={200} from={3} />,
};
