import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@mud/shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': 'http://127.0.0.1:3101',
    },
  },
});
