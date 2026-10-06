import type { Meta, StoryObj } from '@storybook/react-vite';
import { Wallet } from 'lucide-react';

import { MovableTile, TileRemove, tileClass } from './tile';

/** A tile of the shortcuts grid. */
const meta: Meta = { title: 'Atoms/Tile' };

export default meta;
type Story = StoryObj;

/** At rest, being arranged (with its minus) and held. */
export const States: Story = {
  render: () => (
    <div className="grid w-80 grid-cols-3 gap-3">
      <div className={tileClass(false, false)}>
        <Wallet className="size-6 shrink-0" aria-hidden="true" />
        <span className="text-2xs font-medium">Cuentas</span>
      </div>
      <div className="relative">
        <MovableTile
          isDragging={false}
          label="Cuentas"
          style={undefined}
          onGrab={() => undefined}
          onMove={() => undefined}
          onRelease={() => undefined}
        >
          <Wallet className="size-6 shrink-0" aria-hidden="true" />
          <span className="text-2xs font-medium">Cuentas</span>
        </MovableTile>
        <TileRemove label="Cuentas" onRemove={() => undefined} />
      </div>
      <div className="relative">
        <MovableTile
          isDragging
          label="Cuentas"
          style={undefined}
          onGrab={() => undefined}
          onMove={() => undefined}
          onRelease={() => undefined}
        >
          <Wallet className="size-6 shrink-0" aria-hidden="true" />
          <span className="text-2xs font-medium">Cuentas</span>
        </MovableTile>
      </div>
    </div>
  ),
};
