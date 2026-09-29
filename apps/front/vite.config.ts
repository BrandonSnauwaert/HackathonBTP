import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Port distinct de apps/web (5173) pour pouvoir lancer les deux.
    port: 5174,
    // API et doc passent par Vite : même origine que la page (cookie de session, pas de CORS).
    proxy: {
      "/api": "http://localhost:3000",
      "/docs": "http://localhost:3000",
    },
  },
});
