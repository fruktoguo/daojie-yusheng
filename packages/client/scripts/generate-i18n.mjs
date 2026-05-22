/**
 * 本脚本属于客户端构建或内容生成链路，负责把共享配置、语言包或展示索引整理成前端可消费产物。
 *
 * 维护时要检查输入文件、输出路径和生成结果是否稳定，避免构建期产物与运行时展示口径分叉。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientDir, '..', '..');
const sourcePath = path.join(clientDir, 'src/content/i18n/zh-CN.csv');
const targetPath = path.join(clientDir, 'src/constants/ui/i18n.generated.ts');
const COLUMNS = ['key', 'category', 'zh-CN', 'note'];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        index += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = false;
        continue;
      }
      cell += char;
      continue;
    }
    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(cell);
      cell = '';
      continue;
    }
    if (char === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      continue;
    }
    if (char === '\r') {
      continue;
    }
    cell += char;
  }

  if (inQuotes) {
    throw new Error('CSV 解析失败：存在未闭合的双引号。');
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cellValue) => cellValue.length > 0));
}

function validateKey(key) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(key)) {
    throw new Error(`非法 i18n key：${key}`);
  }
}

function readRecords() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`缺少语言包 CSV：${path.relative(repoRoot, sourcePath)}`);
  }
  const rows = parseCsv(fs.readFileSync(sourcePath, 'utf8'));
  if (rows.length === 0) {
    return [];
  }
  const [header, ...bodyRows] = rows;
  const missingColumns = COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`语言包 CSV 缺少列：${missingColumns.join(', ')}`);
  }

  const records = bodyRows.map((row, rowIndex) => {
    const record = {};
    for (const column of COLUMNS) {
      record[column] = row[header.indexOf(column)] ?? '';
    }
    const source = `${path.relative(repoRoot, sourcePath)}:${rowIndex + 2}`;
    if (!record.key.trim()) {
      throw new Error(`${source} 缺少 key。`);
    }
    validateKey(record.key);
    if (!record.category.trim()) {
      throw new Error(`${source} 缺少 category。`);
    }
    if (!record['zh-CN'].trim()) {
      throw new Error(`${source} 缺少 zh-CN 文案。`);
    }
    return {
      key: record.key.trim(),
      category: record.category.trim(),
      text: record['zh-CN'],
      note: record.note.trim(),
    };
  });

  const seen = new Set();
  for (const record of records) {
    if (seen.has(record.key)) {
      throw new Error(`语言包 CSV 存在重复 key：${record.key}`);
    }
    seen.add(record.key);
  }
  return records.sort((left, right) => (
    left.category.localeCompare(right.category, 'zh-CN')
    || left.key.localeCompare(right.key, 'zh-CN')
  ));
}

function toTsObject(records, valueSelector) {
  if (records.length === 0) {
    return '{}';
  }
  return `{\n${records.map((record) => `  ${JSON.stringify(record.key)}: ${JSON.stringify(valueSelector(record))},`).join('\n')}\n}`;
}

function buildOutput(records) {
  const categories = Object.fromEntries(records.map((record) => [record.key, record.category]));
  const notes = Object.fromEntries(records.filter((record) => record.note).map((record) => [record.key, record.note]));
  return `/**\n * 本文件负责承载自动生成的前端语言包常量，来源固定为 packages/client/src/content/i18n/zh-CN.csv。\n *\n * 维护时要通过生成脚本更新文案，保持 CSV、类型导出和客户端渲染口径一致，避免手写本文件造成覆盖丢失。\n */\n\nexport const CLIENT_I18N_MESSAGES = ${toTsObject(records, (record) => record.text)} as const;\n\nexport const CLIENT_I18N_CATEGORIES = ${JSON.stringify(categories, null, 2)} as const;\n\nexport const CLIENT_I18N_NOTES = ${JSON.stringify(notes, null, 2)} as const;\n\nexport type ClientI18nKey = keyof typeof CLIENT_I18N_MESSAGES;\n`;
}

const records = readRecords();
const output = buildOutput(records);
fs.mkdirSync(path.dirname(targetPath), { recursive: true });
if (!fs.existsSync(targetPath) || fs.readFileSync(targetPath, 'utf8') !== output) {
  fs.writeFileSync(targetPath, output);
  console.log(`已生成 ${path.relative(repoRoot, targetPath)}（${records.length} 条）`);
} else {
  console.log(`i18n.generated.ts 无变更（${records.length} 条）`);
}
