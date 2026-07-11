const fs = require('node:fs');
const path = require('node:path');

const distDir = path.resolve(__dirname, '../dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  throw new Error(`config-editor 构建产物目录不存在：${assetsDir}`);
}

const cssFiles = fs.readdirSync(assetsDir)
  .filter((name) => name.endsWith('.css'))
  .map((name) => path.join(assetsDir, name));

if (cssFiles.length === 0) {
  throw new Error('config-editor 构建产物缺少 CSS 文件');
}

const missingAssets = [];
let checkedAssetCount = 0;

for (const cssFile of cssFiles) {
  const css = fs.readFileSync(cssFile, 'utf8');
  const urlPattern = /url\(([^)]+)\)/g;
  for (const match of css.matchAll(urlPattern)) {
    const rawUrl = match[1].trim().replace(/^(['"])(.*)\1$/, '$2');
    if (
      !rawUrl
      || rawUrl.startsWith('data:')
      || rawUrl.startsWith('http://')
      || rawUrl.startsWith('https://')
      || rawUrl.startsWith('#')
    ) {
      continue;
    }
    const pathname = rawUrl.split(/[?#]/, 1)[0];
    const resolvedPath = pathname.startsWith('/')
      ? path.join(distDir, pathname.slice(1))
      : path.resolve(path.dirname(cssFile), pathname);
    checkedAssetCount += 1;
    if (!fs.existsSync(resolvedPath)) {
      missingAssets.push(`${path.basename(cssFile)} -> ${rawUrl}`);
    }
  }
}

if (missingAssets.length > 0) {
  throw new Error(`config-editor CSS 引用了缺失的构建资源：\n- ${missingAssets.join('\n- ')}`);
}

console.log(`config-editor CSS 资源完整性检查通过：${checkedAssetCount} 个本地引用`);
