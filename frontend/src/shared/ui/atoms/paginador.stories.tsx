import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';

import { Paginador } from './paginador';

function Controlled({ total, from = 1 }: { total: number; from?: number }) {
  const [page, setPage] = useState(from);
  return <Paginador pagina={page} total={total} porPagina={20} onCambiar={setPage} />;
}

const meta = {
  title: 'Atoms/Paginador',
  component: Paginador,
  args: { pagina: 1, total: 200, porPagina: 20, onCambiar: () => undefined },
} satisfies Meta<typeof Paginador>;

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
