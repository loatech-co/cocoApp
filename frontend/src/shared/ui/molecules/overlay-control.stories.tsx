import type { Meta, StoryObj } from '@storybook/react-vite';
import { Minus, Plus } from 'lucide-react';

import { BotonOscuro, LecturaDeMandos, SeparadorDeMandos } from './overlay-control';

/** Controls over a document or the dark veil of a viewer. */
const meta: Meta = { title: 'Molecules/OverlayControl' };

export default meta;
type Story = StoryObj;

/** The zoom of a preview: two buttons and the reading between them. */
export const Zoom: Story = {
  render: () => (
    <div className="flex w-fit items-center gap-0.5 rounded-full bg-sala/75 p-0.5">
      <BotonOscuro etiqueta="Alejar" onClick={() => undefined}>
        <Minus className="size-4" aria-hidden="true" />
      </BotonOscuro>
      <LecturaDeMandos ancho="previa" titulo="Volver al tamaño normal" onClick={() => undefined}>
        100 %
      </LecturaDeMandos>
      <BotonOscuro etiqueta="Acercar" onClick={() => undefined}>
        <Plus className="size-4" aria-hidden="true" />
      </BotonOscuro>
      <SeparadorDeMandos />
      <LecturaDeMandos ancho="paginas">Pág. 1 / 3</LecturaDeMandos>
    </div>
  ),
};
