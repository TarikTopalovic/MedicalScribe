import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Konfiguracija Vite dev servera za frontend MedScribe AI aplikacije
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
});
