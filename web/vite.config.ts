import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const daemon = `http://127.0.0.1:${process.env.VILLAGE_PORT ?? 4777}`;

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the demo from /<repo>/ (set by the Pages workflow)
  base: process.env.VILLAGE_BASE ?? '/',
  server: {
    port: 5173,
    proxy: {
      '/api': daemon,
      '/ws': { target: daemon, ws: true },
    },
  },
  build: { outDir: 'dist', emptyOutDir: true, chunkSizeWarningLimit: 2000 },
});
