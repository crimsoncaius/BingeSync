/**
 * Ladle bundles Vite 6. The app uses Vite 8 + @vitejs/plugin-react v6, which
 * relies on APIs that break under Ladle ("Missing field moduleType").
 * This config keeps PostCSS/Tailwind (via postcss.config.js) and uses React
 * plugin v4, which matches Ladle's Vite.
 */
import react from "@vitejs/plugin-react-for-ladle";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
});
