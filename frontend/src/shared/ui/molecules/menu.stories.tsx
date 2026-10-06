import type { Meta, StoryObj } from '@storybook/react-vite';
import { Copy, Ellipsis, Filter, Pencil, Trash2 } from 'lucide-react';

import { Menu, MenuOption, MenuSeparator, MenuTitle } from './menu';

const options = (close: () => void) => (
  <>
    <MenuTitle>Movimiento</MenuTitle>
    <MenuOption Icon={Pencil} isSelected onClick={close}>
      Editar
    </MenuOption>
    <MenuOption Icon={Copy} note="Ctrl D" onClick={close}>
      Duplicar
    </MenuOption>
    <MenuOption disabled onClick={close}>
      Mover (no disponible)
    </MenuOption>
    <MenuSeparator />
    <MenuOption Icon={Trash2} isDestructive onClick={close}>
      Eliminar
    </MenuOption>
  </>
);

const meta = {
  title: 'Molecules/Menu',
  component: Menu,
  args: { label: 'Acciones', Icon: Filter, align: 'left', children: options },
  argTypes: {
    variant: { control: 'inline-radio', options: ['tool', 'ghost', 'default'] },
    align: { control: 'inline-radio', options: ['left', 'right'] },
    direction: { control: 'inline-radio', options: ['down', 'up'] },
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
export const ToolbarActive: Story = { args: { isActive: true } };

export const IconOnly: Story = { args: { Icon: Ellipsis, isIconOnly: true } };

export const Ghost: Story = { args: { variant: 'ghost' } };

export const FocusVisible: Story = { parameters: { pseudo: { focusVisible: ['button'] } } };
