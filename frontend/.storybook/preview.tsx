import { withThemeByClassName } from '@storybook/addon-themes';
import type { Decorator, Preview } from '@storybook/react-vite';
import { MemoryRouter } from 'react-router-dom';

import '../src/index.css';

/**
 * The page behind every story is the app's well (`bg-background`), so a card
 * reads as material resting on it exactly as it does in the app.
 *
 * `MemoryRouter` because a few rows are links; it never touches the URL bar.
 */
const onThePage: Decorator = (Story) => (
  <MemoryRouter>
    <div className="min-h-screen bg-background p-6 text-foreground">
      <Story />
    </div>
  </MemoryRouter>
);

const preview: Preview = {
  decorators: [
    onThePage,
    // The app toggles `.dark` on <html> (see `src/main.tsx`); same switch here.
    withThemeByClassName({
      themes: { Light: '', Dark: 'dark' },
      defaultTheme: 'Light',
      parentSelector: 'html',
    }),
  ],
  parameters: {
    layout: 'fullscreen',
    // The background comes from the theme tokens, not from Storybook's picker.
    backgrounds: { disable: true },
    controls: { expanded: true },
    options: {
      storySort: { order: ['Atoms', 'Molecules', 'Organisms', 'Templates'] },
    },
  },
};

export default preview;
