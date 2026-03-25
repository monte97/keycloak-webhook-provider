import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    outDir: '../src/main/resources/webhook-ui',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/auth': 'http://localhost:8080',
      '/realms': 'http://localhost:8080',
      '/js': 'http://localhost:8080',
    },
  },
});
