import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Ellipsis, Filter, Pencil, Trash2 } from 'lucide-react';

import { Menu, MenuOpcion, MenuSeparador, MenuTitulo } from './menu';

const options = (close: () => void) => (
  <>
    <MenuTitulo>Movimiento</MenuTitulo>
    <MenuOpcion Icono={Pencil} elegida onClick={close}>
      Editar
    </MenuOpcion>
    <MenuOpcion Icono={Copy} nota="Ctrl D" onClick={close}>
      Duplicar
    </MenuOpcion>
    <MenuOpcion deshabilitada onClick={close}>
      Mover (no disponible)
    </MenuOpcion>
    <MenuSeparador />
    <MenuOpcion Icono={Trash2} peligro onClick={close}>
      Eliminar
    </MenuOpcion>
  </>
);

const meta = {
  title: 'Molecules/Menu',
  component: Menu,
  args: { etiqueta: 'Acciones', Icono: Filter, alineado: 'izquierda', children: options },
  argTypes: {
    variante: { control: 'inline-radio', options: ['herramienta', 'ghost', 'default'] },
    alineado: { control: 'inline-radio', options: ['izquierda', 'derecha'] },
    direccion: { control: 'inline-radio', options: ['abajo', 'arriba'] },
  },
  decorators: [
    (Story) => (
      <div className="min-h-80">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Menu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Open it: chosen is `muted`, the hovered option is `accent` (rule 8). */
export const Toolbar: Story = {};

/** A toolbar button switched on: the roles invert (rule 8, the exception). */
export const ToolbarActive: Story = { args: { activo: true } };

export const IconOnly: Story = { args: { Icono: Ellipsis, soloIcono: true } };

export const Ghost: Story = { args: { variante: 'ghost' } };

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: true } } };
