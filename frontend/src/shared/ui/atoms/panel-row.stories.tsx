import type { Meta, StoryObj } from '@storybook/react-vite';
import { LogOut, Plus } from 'lucide-react';

import { PanelRow } from './panel-row';

/** A 48px row of a sheet: the whole row is the target. */
const meta: Meta = { title: 'Atoms/PanelRow' };

export default meta;
type Story = StoryObj;

/** Normal, and `peligro` for what cannot be undone. */
export const Tones: Story = {
  render: () => (
    <div className="flex w-80 flex-col gap-1">
      <PanelRow onClick={() => undefined}>
        <span className="min-w-0 flex-1 truncate">Agregar atajo</span>
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </PanelRow>
      <PanelRow tone="danger" onClick={() => undefined}>
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">Cerrar sesión</span>
      </PanelRow>
    </div>
  ),
};
