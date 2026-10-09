import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'fs';

const { version } = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  server: {
    proxy: {
      '/api': {
        // Where `npm run dev` forwards API calls. Defaults to a locally running
        // backend (see scripts/dev-local.sh); set VITE_PROXY_TARGET to point
        // elsewhere, e.g. http://backend:3001 inside a Docker network.
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
