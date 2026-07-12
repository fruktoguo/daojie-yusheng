#!/usr/bin/env node
/**
 * 本脚本属于仓库级运维或发布辅助工具，负责把常见检查、环境解析或发布步骤自动化。
 *
 * 维护时要让输入参数、环境变量和退出码含义明确，避免本地脚本在 CI 或生产发布中表现不一致。
 */
'use strict';

/**
 * 文件行数门禁脚本
 * - 超过 WARN_THRESHOLD 行的 .ts 文件报 warning
 * - 超过 ERROR_THRESHOLD 行的 .ts 文件报 error
 * - 已知超标文件（baseline）允许存在但不允许继续膨胀
 */

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

const WARN_THRESHOLD = 1500;
const ERROR_THRESHOLD = 3000;

const SCAN_DIRS = [
  'packages/client/src',
  'packages/server/src',
  'packages/shared/src',
  'packages/config-editor/src',
];

const BASELINE_FILE = path.resolve(__dirname, '..', 'scripts', 'file-size-baseline.json');

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  return content.split('\n').length;
}

function isGeneratedSourceFile(filePath) {
  return /\.generated\.tsx?$/.test(filePath);
}

function walkTs(dir, results = []) {
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walkTs(full, results);
    } else if (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) {
      results.push(full);
    }
  }
  return results;
}

function loadBaseline() {
  if (fs.existsSync(BASELINE_FILE)) {
    return JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8'));
  }
  return {};
}

function resolveNewOversizedFiles(errors, baseline) {
  return errors.filter(({ file }) => baseline[file] == null);
}

function resolveStaleBaselineFiles(errors, baseline) {
  const oversizedFiles = new Set(errors.map(({ file }) => file));
  return Object.keys(baseline).filter((file) => !oversizedFiles.has(file));
}

function hasBlockingViolations({ regressions, newOversized, staleBaselines }) {
  return regressions.length > 0 || newOversized.length > 0 || staleBaselines.length > 0;
}

function runContractProof() {
  const baseline = {
    'legacy.ts': 3200,
    'resolved.ts': 3100,
  };
  const errors = [
    { file: 'legacy.ts', lines: 3190 },
    { file: 'new.ts', lines: 3001 },
  ];
  const newOversized = resolveNewOversizedFiles(errors, baseline);
  const staleBaselines = resolveStaleBaselineFiles(errors, baseline);

  assert.deepEqual(newOversized, [{ file: 'new.ts', lines: 3001 }]);
  assert.deepEqual(staleBaselines, ['resolved.ts']);
  assert.equal(isGeneratedSourceFile('src/constants/ui/i18n.generated.ts'), true);
  assert.equal(isGeneratedSourceFile('src/catalog.generated.tsx'), true);
  assert.equal(isGeneratedSourceFile('src/generated/i18n.ts'), false);
  assert.equal(hasBlockingViolations({ regressions: [], newOversized, staleBaselines }), true);
  assert.equal(hasBlockingViolations({ regressions: [], newOversized: [], staleBaselines: [] }), false);
  console.log('file size gate contract check passed');
}

function main() {
  const repoRoot = path.resolve(__dirname, '..');
  const baseline = loadBaseline();
  const warnings = [];
  const errors = [];
  const regressions = [];

  for (const scanDir of SCAN_DIRS) {
    const absDir = path.join(repoRoot, scanDir);
    const files = walkTs(absDir);
    for (const file of files) {
      // 生成数据的行数随内容规模增长，不代表手写模块职责膨胀。
      if (isGeneratedSourceFile(file)) {
        continue;
      }
      const lines = countLines(file);
      const rel = path.relative(repoRoot, file);

      if (lines > ERROR_THRESHOLD) {
        const baselineLines = baseline[rel];
        if (baselineLines != null && lines > baselineLines) {
          regressions.push({ file: rel, lines, baseline: baselineLines });
        }
        errors.push({ file: rel, lines });
      } else if (lines > WARN_THRESHOLD) {
        warnings.push({ file: rel, lines });
      }
    }
  }

  if (warnings.length > 0) {
    console.log(`\n⚠️  ${warnings.length} file(s) exceed ${WARN_THRESHOLD} lines (warning):`);
    for (const { file, lines } of warnings.sort((a, b) => b.lines - a.lines)) {
      console.log(`  ${lines.toString().padStart(5)} lines  ${file}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\n🚨 ${errors.length} file(s) exceed ${ERROR_THRESHOLD} lines (error):`);
    for (const { file, lines } of errors.sort((a, b) => b.lines - a.lines)) {
      const bl = baseline[file];
      const tag = bl != null ? ` (baseline: ${bl})` : ' [NEW - needs baseline or split]';
      console.log(`  ${lines.toString().padStart(5)} lines  ${file}${tag}`);
    }
  }

  const newOversized = resolveNewOversizedFiles(errors, baseline);
  const staleBaselines = resolveStaleBaselineFiles(errors, baseline);

  if (newOversized.length > 0) {
    console.log(`\n❌ ${newOversized.length} new file(s) exceed ${ERROR_THRESHOLD} lines without a baseline:`);
    for (const { file, lines } of newOversized) {
      console.log(`  ${file}: ${lines} lines`);
    }
  }

  if (regressions.length > 0) {
    console.log(`\n❌ ${regressions.length} file(s) grew beyond their baseline:`);
    for (const { file, lines, baseline: bl } of regressions) {
      console.log(`  ${file}: ${bl} → ${lines} (+${lines - bl})`);
    }
  }

  if (staleBaselines.length > 0) {
    console.log(`\n❌ ${staleBaselines.length} stale baseline entr${staleBaselines.length === 1 ? 'y' : 'ies'} no longer point to an oversized file:`);
    for (const file of staleBaselines) {
      console.log(`  ${file}`);
    }
  }

  if (hasBlockingViolations({ regressions, newOversized, staleBaselines })) {
    process.exitCode = 1;
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ All .ts files within size limits.');
  }

  // --update-baseline flag: snapshot current oversized files
  if (process.argv.includes('--update-baseline')) {
    const newBaseline = {};
    for (const { file, lines } of errors) {
      newBaseline[file] = lines;
    }
    fs.writeFileSync(BASELINE_FILE, JSON.stringify(newBaseline, null, 2) + '\n');
    console.log(`\n📝 Baseline updated: ${BASELINE_FILE}`);
  }
}

if (process.argv.includes('--contract-proof')) {
  runContractProof();
} else {
  main();
}
