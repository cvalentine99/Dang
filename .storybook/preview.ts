import type { Preview } from "@storybook/react";
import "../client/src/index.css";

const preview: Preview = {
  parameters: {
    backgrounds: {
      default: "amethyst-dark",
      values: [
        { name: "amethyst-dark", value: "#0c0a14" },
        { name: "panel-dark", value: "#110e1c" },
      ],
    },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
};

export default preview;
