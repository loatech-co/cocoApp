import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleHelp, Plus } from 'lucide-react';

import { Tag } from './badge';
import { Button } from './button';
import { PageHeader, PAGE_TITLE } from './page-header';

const meta = {
  title: 'Atoms/PageHeader',
  component: PageHeader,
  args: {
    title: 'Centros de costos',
    description: 'Cómo se ordena lo que entra y lo que sale.',
    align: 'top',
  },
  argTypes: { align: { control: 'inline-radio', options: ['top', 'bottom'] } },
} satisfies Meta<typeof PageHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { description: undefined } };

export const WithHelp: Story = {};

/** Rule 10: the header action is always `sm`, and its icon has no size of its own. */
export const WithActions: Story = {
  args: {
    beside: (
      <Button variant="ghost" size="sm-icon" aria-label="Ayuda">
        <CircleHelp />
      </Button>
    ),
    actions: (
      <Button size="sm">
        <Plus />
        Nuevo centro
      </Button>
    ),
  },
};

export const WithStatus: Story = {
  args: { beside: <Tag tone="pending">3 sin clasificar</Tag>, align: 'bottom' },
};

/** For screens without content (404, sign-in): the typography alone. */
export const TitleClass: Story = {
  render: () => <h1 className={PAGE_TITLE}>Página no encontrada</h1>,
};
