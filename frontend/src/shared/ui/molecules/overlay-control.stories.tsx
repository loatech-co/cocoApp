import type { Meta, StoryObj } from '@storybook/react-vite';
import { Minus, Plus } from 'lucide-react';

import { OverlayButton, ControlReadout, ControlSeparator } from './overlay-control';

/** Controls over a document or the dark veil of a viewer. */
const meta: Meta = { title: 'Molecules/OverlayControl' };

export default meta;
type Story = StoryObj;

/** The zoom of a preview: two buttons and the reading between them. */
export const Zoom: Story = {
  render: () => (
    <div className="flex w-fit items-center gap-0.5 rounded-full bg-sala/75 p-0.5">
      <OverlayButton label="Alejar" onClick={() => undefined}>
        <Minus className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlReadout width="preview" title="Volver al tamaño normal" onClick={() => undefined}>
        100 %
      </ControlReadout>
      <OverlayButton label="Acercar" onClick={() => undefined}>
        <Plus className="size-4" aria-hidden="true" />
      </OverlayButton>
      <ControlSeparator />
      <ControlReadout width="pages">Pág. 1 / 3</ControlReadout>
    </div>
  ),
};
