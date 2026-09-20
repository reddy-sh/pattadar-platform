import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const port = Number(process.env.UNIVERSITY_PORT || 5181);
const apiTarget = process.env.VITE_API_PROXY_TARGET || 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  server: {
    port,
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
  preview: {
    port: Number(process.env.PORT || 5182),
    strictPort: true,
    proxy: { '/api': apiTarget },
  },
});
