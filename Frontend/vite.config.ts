import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173, strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_BACKEND_URL || 'https://geospatial-data-analytics-plateform.onrender.com',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
