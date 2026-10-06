import type { Meta, StoryObj } from '@storybook/react-vite';

import { Alert, AlertDescription, AlertTitle, ErrorAlert } from './alert';

const TONES = ['default', 'destructive', 'warning', 'success', 'info'] as const;

const meta = {
  title: 'Atoms/Alert',
  component: Alert,
  args: { variant: 'default' },
  argTypes: { variant: { control: 'select', options: TONES } },
  render: (args) => (
    <Alert {...args}>
      <AlertTitle>No se pudo guardar</AlertTitle>
      <AlertDescription>Revisa la conexión y vuelve a intentarlo.</AlertDescription>
    </Alert>
  ),
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Rule 16: red only for what failed; pending is `warning`. */
export const Tones: Story = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-3">
      {TONES.map((tone) => (
        <Alert key={tone} variant={tone}>
          <AlertTitle>Tono {tone}</AlertTitle>
          <AlertDescription>Una línea que explica qué pasó.</AlertDescription>
        </Alert>
      ))}
    </div>
  ),
};

export const WithoutTitle: Story = {
  args: { variant: 'info' },
  render: (args) => (
    <Alert {...args}>
      <AlertDescription>Solo el detalle, sin titular.</AlertDescription>
    </Alert>
  ),
};

/** What failed and, under it, each thing that explains it. */
export const ErrorWithDetails: Story = {
  render: () => (
    <ErrorAlert
      message="La contraseña no cumple la política."
      details={['Al menos 12 caracteres.', 'Al menos un número.']}
    />
  ),
};
