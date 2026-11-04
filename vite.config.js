import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // Send API calls to the Express server (server/) during development.
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});
