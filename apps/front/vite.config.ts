import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

/** Serveur de l'API ; API_URL=http://localhost:3001 pour viser un autre serveur (tests). */
const apiUrl = process.env.API_URL ?? "http://localhost:3000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Écoute sur toutes les interfaces : le tunnel (conteneur Docker) doit pouvoir joindre Vite.
    host: true,
    // Port distinct de apps/web (5173) pour pouvoir lancer les deux.
    port: Number(process.env.PORT ?? 5174),
    // API et doc passent par Vite : même origine que la page (cookie de session, pas de CORS).
    proxy: {
      "/api": apiUrl,
      "/docs": apiUrl,
    },
  },
});
