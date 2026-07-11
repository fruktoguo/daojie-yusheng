/**
 * 秘境生成器 demo 打包：esbuild 把 demo + shared/procgen + client 的 RuntimeImagePack
 * 打成 IIFE，并把游戏运行时图包（manifest + dual-grid 图集）内联为 data URI，
 * 产出零依赖单文件 dist/mijing-procgen-demo.html（双击即可离线打开）。
 *
 * 图包只取 tiles 段（terrain/surface/structure），entities 段（实体贴图）与 demo 无关，
 * 全部剔除以免把体积翻倍。
 *
 * 用法：node tools/procgen-demo/build.mjs
 *   环境变量 PROCGEN_DEMO_NO_SPRITES=1 时跳过贴图内联，产出纯色轻量版（便于快速迭代）。
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');
const packDir = path.join(repoRoot, 'packages/client/public/assets/runtime-image-packs/default');

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
};

/** 把图包 manifest 的 tiles 段 src 全部替换为 data URI；entities 段整体丢弃。 */
function buildInlineManifest() {
  const manifest = JSON.parse(readFileSync(path.join(packDir, 'manifest.json'), 'utf8'));
  const tiles = {};
  let bytes = 0;
  for (const [key, entry] of Object.entries(manifest.tiles ?? {})) {
    const src = String(entry.src ?? '').trim();
    const mime = MIME_BY_EXT[path.extname(src).toLowerCase()];
    if (!src || !mime) {
      throw new Error(`图包条目 ${key} 的 src 无法内联：${src || '(空)'}`);
    }
    const buffer = readFileSync(path.join(packDir, src));
    bytes += buffer.length;
    tiles[key] = { ...entry, src: `data:${mime};base64,${buffer.toString('base64')}` };
  }
  const inlined = {
    version: manifest.version,
    defaults: manifest.defaults,
    tiles,
    legacyTiles: manifest.legacyTiles ?? {},
  };
  return { json: JSON.stringify(inlined), count: Object.keys(tiles).length, bytes };
}

// esbuild 由 config-editor 的 vite 依赖带入 pnpm store，这里直接复用，不新增依赖
const editorRequire = createRequire(path.join(repoRoot, 'packages/config-editor/package.json'));
const vitePackageJson = editorRequire.resolve('vite/package.json');
const viteRequire = createRequire(vitePackageJson);
const esbuild = viteRequire('esbuild');

const withSprites = process.env.PROCGEN_DEMO_NO_SPRITES !== '1';
// data URI 的 base64 与前缀均不含 '<'，直接嵌入 <script type="application/json"> 不会截断标签。
const manifest = withSprites ? buildInlineManifest() : null;

// 两个页面：有界秘境预览 + 无限世界流式生成，共用同一份内联图集与打包配置。
const PAGES = [
  { entry: 'src/demo-main.ts', template: 'template.html', out: 'mijing-procgen-demo.html' },
  { entry: 'src/infinite-main.ts', template: 'infinite.html', out: 'mijing-infinite-demo.html' },
];

mkdirSync(path.join(here, 'dist'), { recursive: true });
for (const page of PAGES) {
  const result = await esbuild.build({
    entryPoints: [path.join(here, page.entry)],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    minify: true,
    write: false,
    charset: 'utf8',
    // demo 直接吃源码：把 client 内部的 '@mud/shared' 也解析到 shared/src，
    // 与 tsconfig paths 保持一致，避免 dist 与 src 的同名 enum 变成两个 declaration。
    alias: { '@mud/shared': path.join(repoRoot, 'packages/shared/src/index.ts') },
  });
  const bundle = result.outputFiles[0].text;
  const template = readFileSync(path.join(here, page.template), 'utf8');
  const html = template
    .replace('/*__IMAGE_PACK_MANIFEST__*/', () => (manifest ? manifest.json : ''))
    .replace('//__BUNDLE__', () => bundle);
  const outFile = path.join(here, 'dist', page.out);
  writeFileSync(outFile, html);
  const sizeKb = (html.length / 1024).toFixed(1);
  const note = manifest
    ? `内联图集 ${manifest.count} 张 / 原始 ${(manifest.bytes / 1024 / 1024).toFixed(1)} MB`
    : '纯色轻量版（未内联贴图）';
  console.log(`已生成：${path.relative(repoRoot, outFile)}（${sizeKb} KB，${note}）`);
}
