#!/usr/bin/env node
'use strict';

/**
 * 文件行数门禁脚本
 * - 超过 WARN_THRESHOLD 行的 .ts 文件报 warning
 * - 超过 ERROR_THRESHOLD 行的 .ts 文件报 error
 * - 已知超标文件（baseline）允许存在但不允许继续膨胀
 */

const fs = require('node:fs');
const path = require('node:path');

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

  if (regressions.length > 0) {
    console.log(`\n❌ ${regressions.length} file(s) grew beyond their baseline:`);
    for (const { file, lines, baseline: bl } of regressions) {
      console.log(`  ${file}: ${bl} → ${lines} (+${lines - bl})`);
    }
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

main();
