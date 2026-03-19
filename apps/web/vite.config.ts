import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: resolve(__dirname, '../..'),
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        /**
         * Split heavy third-party dependencies into stable chunks.
         */
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return;
          }

          const nodeModulesPath = id.split('node_modules/').at(-1);
          if (!nodeModulesPath) {
            return;
          }

          const packageParts = nodeModulesPath.split('/');
          const packageName = packageParts[0].startsWith('@')
            ? `${packageParts[0]}/${packageParts[1] ?? ''}`
            : packageParts[0];

          if (packageName === '@uiw/react-md-editor' || packageName === 'react-markdown' || packageName === 'remark-gfm') {
            return 'markdown';
          }

          if (packageName === 'react' || packageName === 'react-dom' || packageName === 'scheduler') {
            return 'react-vendor';
          }

          return;
        }
      }
    }
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
