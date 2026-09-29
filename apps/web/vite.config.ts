import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Le WebSocket passe par Vite : même origine que la page, pas de souci de CORS ni d'URL en dur.
    proxy: {
      '/ws': { target: 'ws://localhost:3000', ws: true },
    },
  },
})
