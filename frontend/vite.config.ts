import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  server: {
    port: 5173,
    // Matches FRONTEND_URL in the backend .env, which is what the API's CORS
    // origin and Stripe's return URLs are built from.
    strictPort: true,
  },
});
