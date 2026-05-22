/**
 * 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
 *
 * 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
 */
/**
 * 用途：按材料分类生成材料出处文档。
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');
const itemsDir = path.join(repoRoot, 'packages/server/data/content/items');
const sourceCatalogPath = path.join(repoRoot, 'packages/client/src/constants/world/item-sources.generated.json');
const outputDir = path.join(repoRoot, 'docs/开发/设计/技艺');
const indexOutputPath = path.join(outputDir, '材料出处表.md');

const CATEGORY_CONFIG = {
  herb: {
    title: '材料-药材出处表',
    fileName: '材料-药材出处表.md',
    label: '药材',
  },
  exotic: {
    title: '材料-异材出处表',
    fileName: '材料-异材出处表.md',
    label: '异材',
  },
  ore: {
    title: '材料-矿石出处表',
    fileName: '材料-矿石出处表.md',
    label: '矿石',
  },
};

const GRADE_LABELS = {
  mortal: '凡阶',
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
  heaven: '天阶',
  spirit: '灵阶',
  saint: '圣阶',
  emperor: '帝阶',
};

const ELEMENT_LABELS = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

function walkJsonFiles(dirPath) {
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right, 'zh-CN'));
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll('|', '\\|');
}

function loadMaterialItems() {
  return walkJsonFiles(itemsDir)
    .flatMap((filePath) => {
      const stage = path.basename(path.dirname(filePath));
      const entries = readJson(filePath);
      return Array.isArray(entries)
        ? entries
          .filter((item) => item?.type === 'material' && typeof item.itemId === 'string')
          .map((item) => ({ ...item, stage }))
        : [];
    });
}

function formatElementValues(item) {
  const elements = item.materialValues?.elements;
  if (!elements || typeof elements !== 'object') {
    return '-';
  }
  const parts = Object.entries(ELEMENT_LABELS)
    .flatMap(([element, label]) => {
      const value = elements[element];
      return typeof value === 'number' && value > 0 ? [`${label}${Math.trunc(value)}`] : [];
    });
  return parts.length > 0 ? parts.join(' / ') : '-';
}

function formatSourceEntry(entry) {
  switch (entry.kind) {
    case 'monster_drop':
      return `怪物：${entry.mapName}（${entry.monsterName}）`;
    case 'mining':
    case 'search':
      return `采集：${entry.landmarkName}${entry.mapName && entry.mapName !== '运行时资源点' ? `（${entry.mapName}）` : ''}`;
    case 'shop':
      return `商店：${entry.mapName}（${entry.npcName}）`;
    case 'quest':
      return `任务：${entry.chapter ?? entry.line ?? entry.mapName}/${entry.questTitle}`;
    case 'alchemy':
      return `炼丹：${entry.recipeId}`;
    case 'runtime_pvp_reward':
      return `战斗：${entry.sourceLabel}`;
    default:
      return entry.mapName ?? '未知来源';
  }
}

function formatSources(itemId, sourceCatalog) {
  const entries = Array.isArray(sourceCatalog[itemId]) ? sourceCatalog[itemId] : [];
  const labels = [...new Set(entries.map(formatSourceEntry))];
  return labels.length > 0 ? labels.map(escapeMarkdownCell).join('<br>') : '暂无静态来源';
}

function sortMaterialRows(left, right) {
  const leftLevel = Number.isInteger(left.level) ? left.level : 1;
  const rightLevel = Number.isInteger(right.level) ? right.level : 1;
  return leftLevel - rightLevel
    || String(left.grade ?? 'mortal').localeCompare(String(right.grade ?? 'mortal'), 'zh-CN')
    || left.itemId.localeCompare(right.itemId, 'zh-CN');
}

function buildCategoryDocument(category, items, sourceCatalog) {
  const config = CATEGORY_CONFIG[category];
  const rows = items
    .filter((item) => item.materialCategory === category)
    .sort(sortMaterialRows);
  const lines = [
    `# ${config.title}`,
    '',
    `本文档以当前生产主线内容配置为基线，只列出材料主分类为“${config.label}”的材料。材料分类和材料属性值来自 \`packages/server/data/content/items/*/材料.json\`，出处来自客户端物品来源 catalog。`,
    '',
    '| 材料 ID | 名称 | 阶段 | 等级 | 品阶 | 五行数值 | 当前出处 |',
    '|---|---|---|---:|---|---|---|',
    ...rows.map((item) => [
      `\`${item.itemId}\``,
      escapeMarkdownCell(item.name ?? item.itemId),
      escapeMarkdownCell(item.stage),
      Number.isInteger(item.level) ? String(item.level) : '1',
      GRADE_LABELS[item.grade ?? 'mortal'] ?? String(item.grade ?? '凡阶'),
      formatElementValues(item),
      formatSources(item.itemId, sourceCatalog),
    ].join(' | ')).map((row) => `| ${row} |`),
    '',
    `当前共有 ${rows.length} 个${config.label}材料。`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function buildIndexDocument(items) {
  const counts = Object.fromEntries(Object.keys(CATEGORY_CONFIG).map((category) => [
    category,
    items.filter((item) => item.materialCategory === category).length,
  ]));
  return `${[
    '# 材料出处表',
    '',
    '材料出处表已经按材料主分类拆分，分类真源是物品模板上的 `materialCategory`，当前材料属性值通过 `materialValues.elements` 表达五行数值，后续其他材料属性可以继续扩展在 `materialValues` 下。',
    '',
    `- [材料-药材出处表.md](./材料-药材出处表.md)：${counts.herb} 个药材。`,
    `- [材料-异材出处表.md](./材料-异材出处表.md)：${counts.exotic} 个异材。`,
    `- [材料-矿石出处表.md](./材料-矿石出处表.md)：${counts.ore} 个矿石。`,
    '',
    '生成入口：`node scripts/generate-material-source-docs.mjs`。更新物品来源后，应先运行 `pnpm --dir packages/client generate:item-sources` 再重新生成本文档。',
    '',
  ].join('\n')}\n`;
}

function main() {
  const items = loadMaterialItems();
  const sourceCatalog = readJson(sourceCatalogPath);
  fs.mkdirSync(outputDir, { recursive: true });
  for (const category of Object.keys(CATEGORY_CONFIG)) {
    const filePath = path.join(outputDir, CATEGORY_CONFIG[category].fileName);
    fs.writeFileSync(filePath, buildCategoryDocument(category, items, sourceCatalog), 'utf8');
    console.log(`已生成 ${path.relative(repoRoot, filePath)}`);
  }
  fs.writeFileSync(indexOutputPath, buildIndexDocument(items), 'utf8');
  console.log(`已生成 ${path.relative(repoRoot, indexOutputPath)}`);
}

main();
