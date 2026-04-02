#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DEFAULT_SOURCE_DIR = path.join(ROOT, 'packages/server/data/content/techniques');

const REALM_FOLDERS = [
  { label: '凡人期', match: (realmLv) => realmLv <= 18 },
  { label: '练气期', match: (realmLv) => realmLv <= 30 },
];

const TYPE_ORDER = ['炼体', '身法', '内功', '术法', '神通', '秘术', '其他'];
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
const GRADE_ORDER = Object.values(GRADE_LABELS);

const BODY_NAME_PATTERNS = [
  /炼体/u,
  /锻体/u,
  /铁骨/u,
  /站桩/u,
  /担石/u,
  /镇骨/u,
  /固元/u,
  /壮身/u,
  /骨功/u,
  /筋/u,
  /凝气成基/u,
];

const MOVEMENT_NAME_PATTERNS = [
  /身法/u,
  /步/u,
  /遁/u,
  /游身/u,
  /轻身/u,
  /踏风/u,
  /折影/u,
  /分光/u,
];

function parseArgs(argv) {
  const options = {
    source: DEFAULT_SOURCE_DIR,
    output: DEFAULT_SOURCE_DIR,
    write: false,
  };
  for (const arg of argv) {
    if (arg === '--write') {
      options.write = true;
      continue;
    }
    if (arg.startsWith('--source=')) {
      options.source = path.resolve(ROOT, arg.slice('--source='.length));
      continue;
    }
    if (arg.startsWith('--output=')) {
      options.output = path.resolve(ROOT, arg.slice('--output='.length));
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
    throw new Error(`不支持的参数：${arg}`);
  }
  return options;
}

function printHelp() {
  process.stdout.write(
    [
      '用法：node scripts/organize-techniques.mjs [--write] [--source=目录] [--output=目录]',
      '',
      '默认只预览分组结果，不写入文件。',
      '加上 --write 后，会把输出目录下现有 json 清空后重写为：',
      '  境界/类型/品阶.json',
    ].join('\n'),
  );
}

function collectJsonFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectJsonFiles(entryPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(entryPath);
    }
  }
  return files;
}

function readTechniques(sourceDir) {
  const techniques = [];
  const seenIds = new Map();
  for (const filePath of collectJsonFiles(sourceDir)) {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(raw)) {
      throw new Error(`功法文件不是数组：${filePath}`);
    }
    for (const entry of raw) {
      if (!entry || typeof entry !== 'object' || typeof entry.id !== 'string') {
        throw new Error(`功法条目缺少 id：${filePath}`);
      }
      if (seenIds.has(entry.id)) {
        throw new Error(`发现重复功法 id：${entry.id}\n- ${seenIds.get(entry.id)}\n- ${filePath}`);
      }
      seenIds.set(entry.id, filePath);
      techniques.push({
        ...entry,
        __sourceFile: filePath,
      });
    }
  }
  return techniques;
}

function resolveRealmFolder(realmLv) {
  const numericRealmLv = Number.isFinite(realmLv) ? Math.max(1, Math.floor(Number(realmLv))) : 1;
  for (const entry of REALM_FOLDERS) {
    if (entry.match(numericRealmLv)) {
      return entry.label;
    }
  }
  return '更高境界';
}

function resolveTypeFolder(technique) {
  const name = typeof technique.name === 'string' ? technique.name : '';
  const sourceFileName = path.basename(technique.__sourceFile ?? '');
  if (BODY_NAME_PATTERNS.some((pattern) => pattern.test(name))) {
    return '炼体';
  }
  if (sourceFileName.includes('炼体') && technique.category !== 'secret') {
    return '炼体';
  }
  if (MOVEMENT_NAME_PATTERNS.some((pattern) => pattern.test(name)) || sourceFileName.includes('身法')) {
    return '身法';
  }
  switch (technique.category) {
    case 'internal':
      return '内功';
    case 'arts':
      return '术法';
    case 'divine':
      return '神通';
    case 'secret':
      return '秘术';
    default:
      return '其他';
  }
}

function resolveGradeFolder(grade) {
  return GRADE_LABELS[grade] ?? '未定阶';
}

function sortTechniques(list) {
  return [...list].sort((left, right) => {
    const realmDiff = (left.realmLv ?? 0) - (right.realmLv ?? 0);
    if (realmDiff !== 0) return realmDiff;
    const gradeDiff = GRADE_ORDER.indexOf(resolveGradeFolder(left.grade)) - GRADE_ORDER.indexOf(resolveGradeFolder(right.grade));
    if (gradeDiff !== 0) return gradeDiff;
    return String(left.name).localeCompare(String(right.name), 'zh-CN');
  });
}

function buildPlan(techniques) {
  const grouped = new Map();
  for (const technique of techniques) {
    const realm = resolveRealmFolder(technique.realmLv);
    const type = resolveTypeFolder(technique);
    const grade = resolveGradeFolder(technique.grade);
    const key = `${realm}///${type}///${grade}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key).push(stripRuntimeFields(technique));
  }

  const plan = [];
  for (const [key, entries] of grouped.entries()) {
    const [realm, type, grade] = key.split('///');
    plan.push({
      realm,
      type,
      grade,
      relativePath: path.join(realm, type, `${grade}.json`),
      entries: sortTechniques(entries),
    });
  }

  return plan.sort((left, right) => {
    const realmDiff = compareWithFallback(left.realm, right.realm, REALM_FOLDERS.map((entry) => entry.label));
    if (realmDiff !== 0) return realmDiff;
    const typeDiff = compareWithFallback(left.type, right.type, TYPE_ORDER);
    if (typeDiff !== 0) return typeDiff;
    return compareWithFallback(left.grade, right.grade, GRADE_ORDER);
  });
}

function compareWithFallback(left, right, order) {
  const leftIndex = order.indexOf(left);
  const rightIndex = order.indexOf(right);
  if (leftIndex !== -1 || rightIndex !== -1) {
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  }
  return String(left).localeCompare(String(right), 'zh-CN');
}

function stripRuntimeFields(technique) {
  const { __sourceFile: _sourceFile, ...rest } = technique;
  return rest;
}

function printPlan(plan) {
  process.stdout.write(`将生成 ${plan.length} 个分组文件：\n`);
  for (const item of plan) {
    process.stdout.write(`- ${item.relativePath}：${item.entries.length} 条\n`);
  }
}

function clearJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    return;
  }
  for (const filePath of collectJsonFiles(dirPath)) {
    fs.unlinkSync(filePath);
  }
  removeEmptyDirs(dirPath, true);
}

function removeEmptyDirs(dirPath, isRoot = false) {
  if (!fs.existsSync(dirPath)) return;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      removeEmptyDirs(path.join(dirPath, entry.name), false);
    }
  }
  const remaining = fs.readdirSync(dirPath);
  if (!isRoot && remaining.length === 0) {
    fs.rmdirSync(dirPath);
  }
}

function writePlan(outputDir, plan) {
  clearJsonFiles(outputDir);
  for (const item of plan) {
    const filePath = path.join(outputDir, item.relativePath);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(item.entries, null, 2)}\n`, 'utf8');
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const techniques = readTechniques(options.source);
  const plan = buildPlan(techniques);
  printPlan(plan);
  if (!options.write) {
    process.stdout.write('\n未写入文件。加上 --write 才会正式重排。\n');
    return;
  }
  writePlan(options.output, plan);
  process.stdout.write(`\n已写入：${options.output}\n`);
}

main();
