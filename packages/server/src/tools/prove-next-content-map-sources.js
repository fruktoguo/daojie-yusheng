"use strict";

const fs = require("node:fs");
const path = require("node:path");

const packageRoot = path.resolve(__dirname, "..", "..");
const repoRoot = path.resolve(packageRoot, "..", "..");

const CHECKS = [
  {
    id: "content.source",
    file: "packages/server/src/content/content-template.repository.js",
    description: "ContentTemplateRepository 只从 packages/server/data/content 读取 next 内容真源",
    requiredPatterns: [
      /resolveProjectPath\)?\(['"]packages['"], ['"]server['"], ['"]data['"], ['"]content['"], ['"]items['"]\)/,
      /resolveProjectPath\)?\(['"]packages['"], ['"]server['"], ['"]data['"], ['"]content['"], ['"]techniques['"]\)/,
      /resolveProjectPath\)?\(['"]packages['"], ['"]server['"], ['"]data['"], ['"]content['"], ['"]monsters['"]\)/,
    ],
  },
  {
    id: "map.source",
    file: "packages/server/src/runtime/map/map-template.repository.js",
    description: "MapTemplateRepository 只从 packages/server/data/maps 读取 next 地图真源",
    requiredPatterns: [
      /resolveProjectPath\)?\(['"]packages['"], ['"]server['"], ['"]data['"], ['"]maps['"]\)/,
    ],
  },
];

const LEGACY_PATH_TOKENS = [
  "legacy/",
  "legacy\\",
];

function readFile(relativePath) {
  const absolutePath = path.join(repoRoot, relativePath);
  return fs.readFileSync(absolutePath, "utf8");
}

function main() {
  const failures = [];
  const passes = [];

  for (const check of CHECKS) {
    const source = readFile(check.file);
    const missingPattern = check.requiredPatterns.find((pattern) => !pattern.test(source));
    if (missingPattern) {
      failures.push(`${check.id}: 缺少固定真源片段 -> ${missingPattern}`);
      continue;
    }
    const legacyToken = LEGACY_PATH_TOKENS.find((token) => source.includes(token));
    if (legacyToken) {
      failures.push(`${check.id}: 检测到 legacy 路径片段 -> ${legacyToken}`);
      continue;
    }
    passes.push(`${check.id}: ${check.description}`);
  }

  if (failures.length > 0) {
    process.stderr.write("[next content/map source proof] failed\n");
    for (const failure of failures) {
      process.stderr.write(`- ${failure}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write("[next content/map source proof] passed\n");
  for (const pass of passes) {
    process.stdout.write(`- ${pass}\n`);
  }
}

main();
