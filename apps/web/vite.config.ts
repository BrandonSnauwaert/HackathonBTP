import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Écoute sur toutes les interfaces : le tunnel (conteneur Docker) doit pouvoir joindre Vite.
    host: true,
    // API, doc et WebSocket passent par Vite : même origine que la page (cookie de session, pas de CORS).
    proxy: {
      "/api": "http://localhost:3000",
      "/docs": "http://localhost:3000",
      "/ws": { target: "ws://localhost:3000", ws: true },
    },
  },
});
