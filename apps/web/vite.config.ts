import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // The slim gateway (services/gateway) listens on 8080 in local dev.
      // All browser calls stay gateway-relative ('/api/...') so the same
      // bundle works behind CloudFront in AWS and behind this proxy locally.
      '/api': 'http://localhost:8080',
    },
  },
});
