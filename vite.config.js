import { defineConfig } from 'vite';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  plugins: [tailwind()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3005',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const auth = req.headers.authorization;
            if (auth) proxyReq.setHeader('Authorization', auth);
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      input: './index.html',
    },
  },
});