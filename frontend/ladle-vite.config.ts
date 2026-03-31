/**
 * Ladle bundles Vite 6. The app uses Vite 8 + @vitejs/plugin-react v6, which
 * relies on APIs that break under Ladle ("Missing field moduleType").
 * Tailwind v4 runs via @tailwindcss/vite; React uses plugin v4 for Ladle's Vite.
 */
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react-for-ladle";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss(), react()],
});
