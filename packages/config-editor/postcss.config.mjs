/**
 * 本文件是配置编辑器工程配置或入口，负责开发构建、样式链路或应用启动。
 *
 * 维护时要保证 Vite、Tailwind/PostCSS 与编辑器源码路径保持一致，避免影响内容生产链路。
 */
import tailwindcss from '@tailwindcss/postcss';

export default {
  plugins: [tailwindcss],
};
