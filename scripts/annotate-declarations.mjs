#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { detectDeclarationFromLine } from './declaration-detector.mjs';

const ARG_DRY_RUN = process.argv.includes('--dry-run');
const ARG_ALLOW_PLACEHOLDER = process.argv.includes('--allow-placeholder-comments');

const files = execSync('rg --files -g "**/*.ts" -g "**/*.tsx"', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.includes('/dist/') && !file.includes('/build/') && !file.includes('/node_modules/') && !file.includes('/.turbo/'));

function hasDocCommentAbove(lines, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const trimmed = lines[i].trim();
    if (!trimmed) {
      continue;
    }
    if (trimmed.endsWith('*/')) {
      return true;
    }
    if (trimmed === '*' || trimmed.startsWith('*/') || trimmed.startsWith('*') || trimmed.startsWith('//') || trimmed.startsWith('/**') || trimmed.startsWith('/*')) {
      return true;
    }
    return false;
  }
  return false;
}

const detectDeclaration = detectDeclarationFromLine;

let changed = 0;
let touchedFiles = 0;

if (!ARG_DRY_RUN && !ARG_ALLOW_PLACEHOLDER) {
  console.error('annotate-declarations.mjs 已默认禁用占位注释写入。');
  console.error('如需审计缺失声明注释，请使用 --dry-run；如确有必要写入占位注释，需显式传入 --allow-placeholder-comments。');
  process.exit(1);
}

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split(/\r?\n/);
  let fileChanged = false;
  let inserted = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const decl = detectDeclaration(line);
    if (decl && !hasDocCommentAbove(lines, i)) {
      inserted += 1;
      changed += 1;
      if (!ARG_DRY_RUN) {
        fileChanged = true;
      }
    }
  }

  if (inserted > 0) {
    touchedFiles += 1;
    if (ARG_DRY_RUN) {
      console.log(`[dry-run] ${file} +${inserted} 注释`);
    } else {
      console.log(`[blocked] ${file} 检测到 ${inserted} 处缺失声明注释，请人工补充业务语义注释。`);
    }
  }
}

console.log(`共检测到 ${changed} 处缺失声明注释，影响 ${touchedFiles} 个文件。`);
