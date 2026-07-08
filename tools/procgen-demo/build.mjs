/**
 * 秘境生成器 demo 打包：esbuild 把 demo + shared/procgen 打成 IIFE，
 * 内联进 template.html，产出零依赖单文件 dist/mijing-procgen-demo.html。
 * 用法：node tools/procgen-demo/build.mjs
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

// esbuild 由 config-editor 的 vite 依赖带入 pnpm store，这里直接复用，不新增依赖
const editorRequire = createRequire(path.join(repoRoot, 'packages/config-editor/package.json'));
const vitePackageJson = editorRequire.resolve('vite/package.json');
const viteRequire = createRequire(vitePackageJson);
const esbuild = viteRequire('esbuild');

const result = await esbuild.build({
  entryPoints: [path.join(here, 'src/demo-main.ts')],
  bundle: true,
  format: 'iife',
  target: 'es2020',
  minify: true,
  write: false,
  charset: 'utf8',
});

const bundle = result.outputFiles[0].text;
const template = readFileSync(path.join(here, 'template.html'), 'utf8');
const html = template.replace('//__BUNDLE__', () => bundle);
mkdirSync(path.join(here, 'dist'), { recursive: true });
const outFile = path.join(here, 'dist/mijing-procgen-demo.html');
writeFileSync(outFile, html);
console.log(`已生成：${path.relative(repoRoot, outFile)}（${(html.length / 1024).toFixed(1)} KB）`);
