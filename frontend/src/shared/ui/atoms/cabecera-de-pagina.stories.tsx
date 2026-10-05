import type { Meta, StoryObj } from '@storybook/react-vite';
import { CircleHelp, Plus } from 'lucide-react';

import { Etiqueta } from './badge';
import { Button } from './button';
import { CabeceraDePagina, TITULO_DE_PAGINA } from './cabecera-de-pagina';

const meta = {
  title: 'Atoms/CabeceraDePagina',
  component: CabeceraDePagina,
  args: {
    titulo: 'Centros de costos',
    ayuda: 'Cómo se ordena lo que entra y lo que sale.',
    alineado: 'arriba',
  },
  argTypes: { alineado: { control: 'inline-radio', options: ['arriba', 'abajo'] } },
} satisfies Meta<typeof CabeceraDePagina>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TitleOnly: Story = { args: { ayuda: undefined } };

export const WithHelp: Story = {};

/** Rule 10: the header action is always `sm`, and its icon has no size of its own. */
export const WithActions: Story = {
  args: {
    junto: (
      <Button variant="ghost" size="sm-icon" aria-label="Ayuda">
        <CircleHelp />
      </Button>
    ),
    acciones: (
      <Button size="sm">
        <Plus />
        Nuevo centro
      </Button>
    ),
  },
};

export const WithStatus: Story = {
  args: { junto: <Etiqueta tono="pendiente">3 sin clasificar</Etiqueta>, alineado: 'abajo' },
};

/** For screens without content (404, sign-in): the typography alone. */
export const TitleClass: Story = {
  render: () => <h1 className={TITULO_DE_PAGINA}>Página no encontrada</h1>,
};
