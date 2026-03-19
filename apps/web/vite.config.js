import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
var __dirname = dirname(fileURLToPath(import.meta.url));
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
                manualChunks: function (id) {
                    var _a;
                    if (!id.includes('node_modules')) {
                        return;
                    }
                    var nodeModulesPath = id.split('node_modules/').at(-1);
                    if (!nodeModulesPath) {
                        return;
                    }
                    var packageParts = nodeModulesPath.split('/');
                    var packageName = packageParts[0].startsWith('@')
                        ? "".concat(packageParts[0], "/").concat((_a = packageParts[1]) !== null && _a !== void 0 ? _a : '')
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
