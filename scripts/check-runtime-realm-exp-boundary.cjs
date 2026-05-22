#!/usr/bin/env node
/**
 * 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
 *
 * 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

const allowedRealmConfigReaders = new Set([
  normalizePath('packages/server/src/runtime/player/realm-runtime-exp.helpers.ts'),
  normalizePath('packages/server/src/runtime/player/player-progression.service.ts'),
  normalizePath('packages/server/src/runtime/combat/monster-combat-exp-equivalent.helper.ts'),
  normalizePath('scripts/generate-editor-catalog.mjs'),
  normalizePath('scripts/check-runtime-realm-exp-boundary.cjs'),
]);

const scanRoots = [
  'packages/server/src',
  'scripts',
].map((entry) => path.join(repoRoot, entry));

const violations = [];

for (const root of scanRoots) {
  walk(root, (filePath) => {
    if (!/\.(?:ts|js|mjs|cjs)$/.test(filePath)) {
      return;
    }
    const rel = normalizePath(path.relative(repoRoot, filePath));
    const text = fs.readFileSync(filePath, 'utf8');
    if (!allowedRealmConfigReaders.has(rel) && text.includes('realm-levels.json')) {
      violations.push({
        file: rel,
        reason: 'direct realm-levels.json access outside approved runtime config loaders',
      });
    }
    if (!allowedRealmConfigReaders.has(rel) && /expMultiplier[\s\S]{0,240}expToNext|expToNext[\s\S]{0,240}expMultiplier/.test(text)) {
      violations.push({
        file: rel,
        reason: 'manual expMultiplier/expToNext expansion; use PlayerProgressionService.getRealmRuntimeExpToNext or realm-runtime-exp.helpers',
      });
    }
    if (rel !== normalizePath('packages/server/src/runtime/player/player-progression.service.ts') && /\bgetRealmLevelEntry\s*\(/.test(text)) {
      violations.push({
        file: rel,
        reason: 'getRealmLevelEntry exposes mixed realm metadata; runtime exp callers must use getRealmRuntimeExpToNext',
      });
    }
  });
}

if (violations.length > 0) {
  console.error('runtime realm exp boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.reason}`);
  }
  process.exit(1);
}

console.log('runtime realm exp boundary check passed');

function walk(root, visitor) {
  if (!fs.existsSync(root)) {
    return;
  }
  const stat = fs.statSync(root);
  if (stat.isFile()) {
    visitor(root);
    return;
  }
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (entry.name === 'dist' || entry.name === 'node_modules') {
      continue;
    }
    const child = path.join(root, entry.name);
    if (entry.isDirectory()) {
      walk(child, visitor);
    } else if (entry.isFile()) {
      visitor(child);
    }
  }
}

function normalizePath(value) {
  return value.split(path.sep).join('/');
}
