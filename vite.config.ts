import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    allowedHosts: ['jolanda-system-product-name.tail40af21.ts.net'],
  },
  preview: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    allowedHosts: ['jolanda-system-product-name.tail40af21.ts.net'],
  },
});
