import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { reactRouterHonoServer } from 'react-router-hono-server/dev';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
    reactRouterHonoServer({ runtime: 'node' }),
    reactRouter(),
  ],
  resolve: {
    alias: {
      '~': '/app',
    },
  },
});
