import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // SECURITY: never bake the Gemini key into the production bundle — it would be publicly
  // readable in the browser. In prod the key is injected server-side by nginx (see
  // nginx.conf / Dockerfile). In dev we keep it so the vite same-origin proxy works.
  const geminiKey = mode === 'production' ? '' : (env.GEMINI_API_KEY || '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(geminiKey),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Dev mirror of the prod nginx proxy: forward same-origin /v1beta/ calls to Gemini.
      proxy: {
        '/v1beta': {
          target: 'https://generativelanguage.googleapis.com',
          changeOrigin: true,
          secure: true,
        },
      },
    },
  };
});
