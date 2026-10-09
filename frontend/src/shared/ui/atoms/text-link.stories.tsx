import type { Meta, StoryObj } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';

import { TextLink } from './text-link';

/** A link inside a sentence, underlined at rest. */
const meta: Meta = {
  title: 'Atoms/TextLink',
  decorators: [
    (Story) => (
      <MemoryRouter>
        <Story />
      </MemoryRouter>
    ),
  ],
};

export default meta;
type Story = StoryObj;

/** The sign-in screen's way to the sign-up one. */
export const InASentence: Story = {
  render: () => (
    <p className="text-sm text-muted-foreground">
      ¿No tienes cuenta? <TextLink to="/sign-up">Solicitar acceso</TextLink>
    </p>
  ),
};
