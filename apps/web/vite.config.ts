import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  const isProd = mode === 'production' || process.env.NODE_ENV === 'production';
  const debugEnv = process.env.VITE_ADSGRAM_DEBUG;
  if (isProd && (debugEnv === 'true' || debugEnv === '1')) {
    throw new Error('Build error: VITE_ADSGRAM_DEBUG cannot be true in production build');
  }

  return {
    plugins: [react()],
    resolve: {
      alias: {
        '@flagora/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      port: 5173,
    },
  };
});

