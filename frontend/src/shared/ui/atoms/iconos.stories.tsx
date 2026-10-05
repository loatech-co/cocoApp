import type { Meta, StoryObj } from '@storybook/react-vite';

import { ICONOS_DE_CATEGORIA, IconoDeCategoria } from './iconos';

const meta = {
  title: 'Atoms/IconoDeCategoria',
  component: IconoDeCategoria,
  args: { nombre: ICONOS_DE_CATEGORIA[0]?.nombre ?? null },
  argTypes: {
    nombre: { control: 'select', options: ICONOS_DE_CATEGORIA.map((i) => i.nombre) },
  },
} satisfies Meta<typeof IconoDeCategoria>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Every icon a category can choose. */
export const All: Story = {
  render: () => (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(8rem,1fr))] gap-3">
      {ICONOS_DE_CATEGORIA.map(({ nombre, etiqueta }) => (
        <li key={nombre} className="flex items-center gap-2 text-sm">
          <IconoDeCategoria nombre={nombre} />
          {etiqueta}
        </li>
      ))}
    </ul>
  ),
};

/** An unknown name paints nothing rather than a wrong icon. */
export const Unknown: Story = { args: { nombre: 'no-existe' } };
