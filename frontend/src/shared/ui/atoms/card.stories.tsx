import type { Meta, StoryObj } from '@storybook/react-vite';

import { Bloque } from './bloque';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

const meta = {
  title: 'Atoms/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Rule 6: no border; the step between material and well is what separates it. */
export const Default: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Costos fijos</CardTitle>
        <CardDescription>Lo que se paga todos los meses.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm">El contenido de la tarjeta.</p>
      </CardContent>
    </Card>
  ),
};

export const WithBlock: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>Con un bloque dentro</CardTitle>
      </CardHeader>
      <CardContent>
        <Bloque className="text-sm">Lo elegido va en `muted`.</Bloque>
      </CardContent>
    </Card>
  ),
};
