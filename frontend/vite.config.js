import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'API_PROXY_');
  const target = env.API_PROXY_TARGET || 'http://127.0.0.1:8000';
  const proxy = {
    '/api': {
      target,
      ...(env.API_PROXY_KEY && { headers: { 'X-API-Key': env.API_PROXY_KEY } }),
    },
    '/health': { target },
    '/docs': { target },
    '/openapi.json': { target },
  };

  return {
    plugins: [react()],
    build: {
      rolldownOptions: {
        input: {
          app: fileURLToPath(new URL('./index.html', import.meta.url)),
          designs: fileURLToPath(new URL('./designs.html', import.meta.url)),
        },
      },
    },
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy },
    preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  };
});
