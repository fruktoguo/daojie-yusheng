import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const monstersDir = path.join(repoRoot, 'packages/server/data/content/monsters');
const baselinesPath = path.join(repoRoot, 'packages/server/data/content/realm-attr-baselines.json');
const outputPath = path.join(repoRoot, 'packages/server/data/generated/monster-runtime-stats.json');
const sharedEntry = path.join(repoRoot, 'packages/shared/dist/index.js');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

function writeJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function collectJsonFiles(dirPath) {
  return fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'))
    .flatMap((entry) => {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) return collectJsonFiles(entryPath);
      return entry.isFile() && entry.name.endsWith('.json') ? [entryPath] : [];
    });
}

if (!fs.existsSync(sharedEntry)) {
  throw new Error('缺少 packages/shared/dist/index.js，请先运行 pnpm --filter @mud/shared build。');
}

const shared = require(sharedEntry);
const baselines = readJson(baselinesPath);
const records = {};
let monsterCount = 0;

for (const filePath of collectJsonFiles(monstersDir)) {
  const monsters = readJson(filePath);
  if (!Array.isArray(monsters)) continue;
  const sourceFile = path.relative(repoRoot, filePath).replaceAll(path.sep, '/');
  for (const monster of monsters) {
    const resolved = shared.resolveMonsterTemplateRecord(monster, undefined, baselines);
    if (!resolved.id) continue;
    monsterCount += 1;
    records[resolved.id] = {
      id: resolved.id,
      name: resolved.name,
      sourceFile,
      level: resolved.level ?? 1,
      grade: resolved.grade,
      tier: resolved.tier,
      attrs: resolved.resolvedAttrs,
      numericStats: resolved.computedStats,
    };
  }
}

writeJson(outputPath, {
  version: 1,
  source: {
    monstersDir: path.relative(repoRoot, monstersDir).replaceAll(path.sep, '/'),
    baselines: path.relative(repoRoot, baselinesPath).replaceAll(path.sep, '/'),
  },
  count: monsterCount,
  records,
});

console.log(`已编译 ${monsterCount} 个怪物倾向数值 -> ${path.relative(repoRoot, outputPath)}`);
