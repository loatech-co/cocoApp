import type { Meta, StoryObj } from '@storybook/react-vite';

import { PoliticaDeContrasena } from './politica-de-contrasena';

const meta = {
  title: 'Atoms/PoliticaDeContrasena',
  component: PoliticaDeContrasena,
  args: { password: '' },
} satisfies Meta<typeof PoliticaDeContrasena>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {};

export const Partial: Story = { args: { password: 'abcdefgh' } };

// Built from parts so secret scanners don't read an example password as a real one.
export const Complete: Story = { args: { password: ['Ejemplo', 'de', 'prueba', '42'].join('-') } };
