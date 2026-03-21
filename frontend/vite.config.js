import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:8000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
  build: {
    // Emit into backend so a single backend folder can be deployed standalone (see README)
    outDir: '../backend/web',
    emptyOutDir: true,
    // Omit maps so backend/web stays small when committed for fast deploy (use sourcemap: true locally to debug)
    sourcemap: false,
  },
});

