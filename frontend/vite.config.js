import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Konfiguracija Vite dev servera za frontend MedScribe AI aplikacije
export default defineConfig({
  // Relative assets are required when the production renderer is loaded by Electron.
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
  },
});
