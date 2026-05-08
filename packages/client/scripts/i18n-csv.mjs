import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDir = path.resolve(__dirname, '..');
const defaultCsvPath = path.join(clientDir, 'src/content/i18n/zh-CN.csv');

const COLUMNS = ['key', 'category', 'zh-CN', 'note'];
const WRITE_LOCK_TIMEOUT_MS = 30_000;
const WRITE_LOCK_RETRY_MS = 80;

function printUsage() {
  console.log(`用法：
  pnpm --filter @mud/client i18n:csv query [--key KEY] [--category 分类] [--text 文案] [--contains 片段] [--json]
  pnpm --filter @mud/client i18n:csv add --key KEY --category 分类 --text 文案 [--note 说明]
  pnpm --filter @mud/client i18n:csv update --key KEY [--category 分类] [--text 文案] [--note 说明]

说明：
  - CSV 默认路径：src/content/i18n/zh-CN.csv
  - key 必须唯一，建议使用 login.submit.login 这类稳定语义命名。
  - category 用于按业务区域分组，例如 个人信息、属性总览、强化、坊市、GM。
  - text 会写入 zh-CN 列，动态文本使用 {name} 命名占位符。
  - 写操作会使用文件锁和原子替换，供多个 AI 并行调用。

示例：
  pnpm --filter @mud/client i18n:csv add --key attr.overview.title --category 属性总览 --text 属性总览
  pnpm --filter @mud/client i18n:csv add --key enhance.cost.summary --category 强化 --text "消耗 {count} 个{itemName}"
  pnpm --filter @mud/client i18n:csv query --category 个人信息
  pnpm --filter @mud/client i18n:csv update --key attr.overview.title --text 修行卷`);
}

function parseArgs(argv) {
  const args = {
    _: [],
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const eqIndex = token.indexOf('=');
    if (eqIndex >= 0) {
      args[token.slice(2, eqIndex)] = token.slice(eqIndex + 1);
      continue;
    }
    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) {
      args[name] = true;
      continue;
    }
    args[name] = next;
    index += 1;
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withWriteLock(csvPath, action) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const lockPath = `${csvPath}.lock`;
  const startedAt = Date.now();
  let lockHandle = null;
  while (!lockHandle) {
    try {
      lockHandle = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(lockHandle, `${process.pid}\n${new Date().toISOString()}\n`);
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error;
      }
      if (Date.now() - startedAt > WRITE_LOCK_TIMEOUT_MS) {
        throw new Error(`等待 CSV 写锁超时：${path.relative(clientDir, lockPath)}`);
      }
      await sleep(WRITE_LOCK_RETRY_MS);
    }
  }

  try {
    return await action();
  } finally {
    fs.closeSync(lockHandle);
    fs.rmSync(lockPath, { force: true });
  }
}

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

function escapeCsvCell(value) {
  const text = String(value ?? '');
  if (!/[",\r\n]/.test(text)) {
    return text;
  }
  return `"${text.replaceAll('"', '""')}"`;
}

function serializeCsv(records) {
  const lines = [COLUMNS.join(',')];
  for (const record of records) {
    lines.push(COLUMNS.map((column) => escapeCsvCell(record[column] ?? '')).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function readRecords(csvPath) {
  if (!fs.existsSync(csvPath)) {
    return [];
  }
  const rows = parseCsv(fs.readFileSync(csvPath, 'utf8'));
  if (rows.length === 0) {
    return [];
  }
  const [header, ...bodyRows] = rows;
  const missingColumns = COLUMNS.filter((column) => !header.includes(column));
  if (missingColumns.length > 0) {
    throw new Error(`CSV 缺少列：${missingColumns.join(', ')}`);
  }
  return bodyRows.map((row, rowIndex) => {
    const record = {};
    for (const column of COLUMNS) {
      record[column] = row[header.indexOf(column)] ?? '';
    }
    validateRecord(record, `第 ${rowIndex + 2} 行`);
    return record;
  });
}

function sortRecords(records) {
  return [...records].sort((left, right) => (
    left.category.localeCompare(right.category, 'zh-CN')
    || left.key.localeCompare(right.key, 'zh-CN')
  ));
}

function writeRecords(csvPath, records) {
  fs.mkdirSync(path.dirname(csvPath), { recursive: true });
  const sorted = sortRecords(records);
  const tmpPath = `${csvPath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, serializeCsv(sorted));
  fs.renameSync(tmpPath, csvPath);
}

function validateKey(key) {
  if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/.test(key)) {
    throw new Error(`非法 key：${key}。建议使用小写语义路径，例如 attr.overview.title。`);
  }
}

function validateRecord(record, source) {
  if (!record.key?.trim()) {
    throw new Error(`${source} 缺少 key。`);
  }
  validateKey(record.key);
  if (!record.category?.trim()) {
    throw new Error(`${source} 缺少 category。`);
  }
  if (!record['zh-CN']?.trim()) {
    throw new Error(`${source} 缺少 zh-CN 文案。`);
  }
}

function findDuplicates(records) {
  const seen = new Set();
  const duplicates = [];
  for (const record of records) {
    if (seen.has(record.key)) {
      duplicates.push(record.key);
      continue;
    }
    seen.add(record.key);
  }
  return duplicates;
}

function normalizeInputRecord(args, existing = {}) {
  const record = {
    key: String(args.key ?? existing.key ?? '').trim(),
    category: String(args.category ?? existing.category ?? '').trim(),
    'zh-CN': String(args.text ?? args['zh-CN'] ?? existing['zh-CN'] ?? '').trim(),
    note: String(args.note ?? existing.note ?? '').trim(),
  };
  validateRecord(record, `key=${record.key || '<empty>'}`);
  return record;
}

function resolveCsvPath(args) {
  return path.resolve(clientDir, args.csv ? String(args.csv) : defaultCsvPath);
}

function matchRecord(record, args) {
  const key = args.key ? String(args.key).trim() : '';
  const category = args.category ? String(args.category).trim() : '';
  const text = args.text ? String(args.text).trim() : '';
  const contains = args.contains ? String(args.contains).trim() : '';
  if (key && record.key !== key) {
    return false;
  }
  if (category && record.category !== category) {
    return false;
  }
  if (text && record['zh-CN'] !== text) {
    return false;
  }
  if (contains) {
    const haystack = `${record.key}\n${record.category}\n${record['zh-CN']}\n${record.note}`;
    if (!haystack.includes(contains)) {
      return false;
    }
  }
  return true;
}

function printRecords(records, args) {
  if (args.json) {
    console.log(JSON.stringify(records, null, 2));
    return;
  }
  if (records.length === 0) {
    console.log('未找到匹配文案。');
    return;
  }
  for (const record of records) {
    const note = record.note ? ` | ${record.note}` : '';
    console.log(`${record.key} | ${record.category} | ${record['zh-CN']}${note}`);
  }
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return;
  }

  const csvPath = resolveCsvPath(args);

  if (command === 'query' || command === '查') {
    const records = readRecords(csvPath).filter((record) => matchRecord(record, args));
    printRecords(records, args);
    return;
  }

  if (command === 'add' || command === '增') {
    await withWriteLock(csvPath, () => {
      const records = readRecords(csvPath);
      const record = normalizeInputRecord(args);
      if (records.some((entry) => entry.key === record.key)) {
        throw new Error(`key 已存在：${record.key}。如需修改请使用 update。`);
      }
      const nextRecords = [...records, record];
      const duplicates = findDuplicates(nextRecords);
      if (duplicates.length > 0) {
        throw new Error(`CSV 存在重复 key：${duplicates.join(', ')}`);
      }
      writeRecords(csvPath, nextRecords);
      console.log(`已新增：${record.key} | ${record.category} | ${record['zh-CN']}`);
    });
    return;
  }

  if (command === 'update' || command === '改') {
    await withWriteLock(csvPath, () => {
      const records = readRecords(csvPath);
      const key = String(args.key ?? '').trim();
      if (!key) {
        throw new Error('update 必须提供 --key。');
      }
      validateKey(key);
      const index = records.findIndex((entry) => entry.key === key);
      if (index < 0) {
        throw new Error(`key 不存在：${key}。如需新增请使用 add。`);
      }
      const record = normalizeInputRecord(args, records[index]);
      const nextRecords = [...records];
      nextRecords[index] = record;
      const duplicates = findDuplicates(nextRecords);
      if (duplicates.length > 0) {
        throw new Error(`CSV 存在重复 key：${duplicates.join(', ')}`);
      }
      writeRecords(csvPath, nextRecords);
      console.log(`已修改：${record.key} | ${record.category} | ${record['zh-CN']}`);
    });
    return;
  }

  throw new Error(`未知命令：${command}`);
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
