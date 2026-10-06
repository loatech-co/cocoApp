import type { Meta, StoryObj } from '@storybook/react-vite';

import { CATEGORY_ICONS, CategoryIcon } from './icons';

const meta = {
  title: 'Atoms/CategoryIcon',
  component: CategoryIcon,
  args: { name: CATEGORY_ICONS[0]?.name ?? null },
  argTypes: {
    name: { control: 'select', options: CATEGORY_ICONS.map((i) => i.name) },
  },
} satisfies Meta<typeof CategoryIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Every icon a category can choose. */
export const All: Story = {
  render: () => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
      {CATEGORY_ICONS.map(({ name, label }) => (
        <li key={name} className="flex items-center gap-2 text-sm">
          <CategoryIcon name={name} />
          {label}
        </li>
      ))}
    </ul>
  ),
};

/** An unknown name paints nothing rather than a wrong icon. */
export const Unknown: Story = { args: { name: 'no-existe' } };
