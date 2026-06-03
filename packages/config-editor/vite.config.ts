/**
 * 本文件是配置编辑器工程配置或入口，负责开发构建、样式链路或应用启动。
 *
 * 维护时要保证 Vite、Tailwind/PostCSS 与编辑器源码路径保持一致，避免影响内容生产链路。
 */
import { defineConfig } from 'vite';
import path from 'path';
import react from '@vitejs/plugin-react';

const clientPublicDir = path.resolve(__dirname, '../client/public');

export default defineConfig({
  plugins: [react()],
  publicDir: clientPublicDir,
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
