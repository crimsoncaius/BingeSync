import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: "src/**/*.stories.{tsx,jsx}",
  viteConfig: path.resolve(here, "..", "ladle-vite.config.ts"),
  appendToHead: `<style>
    :root { --ladle-main-padding: 0; --ladle-main-padding-mobile: 0; }
  </style>`,
};
