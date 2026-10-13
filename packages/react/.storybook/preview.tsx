import type { Decorator, Preview } from '@storybook/react-vite';
import '../../core/src/styles/index.css';
import './preview.css';

/** Page background follows the toolbar so light stories are readable. */
const withSurface: Decorator = (Story, context) => (
  <div className="sb-surface" data-sb-theme={String(context.globals.theme ?? 'dark')}>
    <Story />
  </div>
);

const preview: Preview = {
  parameters: {
    layout: 'fullscreen',
    controls: { expanded: true, sort: 'requiredFirst' },
    options: { storySort: { order: ['Widget', 'States', 'Headless'] } },
    a11y: { test: 'todo' },
  },
  globalTypes: {
    theme: {
      description: 'Theme applied to the widget and the story background',
      toolbar: {
        title: 'Theme',
        icon: 'mirror',
        items: [
          { value: 'dark', title: 'Dark' },
          { value: 'light', title: 'Light' },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: { theme: 'dark' },
  decorators: [withSurface],
};

export default preview;
