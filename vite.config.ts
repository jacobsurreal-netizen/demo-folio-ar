import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Local HTTPS — required for camera API access during development.
    // The camera permission API only works in secure contexts.
    basicSsl(),
  ],
  server: {
    // Expose to local network for mobile testing via IP address
    host: true,
  },
});
