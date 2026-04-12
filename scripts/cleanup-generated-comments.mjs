#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { detectDeclarationFromLine, isGeneratedComment } from './declaration-detector.mjs';

const files = execSync('rg --files -g "**/*.ts" -g "**/*.tsx"', {
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((file) => !file.includes('/dist/') && !file.includes('/build/') && !file.includes('/node_modules/') && !file.includes('/.turbo/'));

function normalizeText(text) {
  return text.replace(/\r\n/g, '\n');
}

let removed = 0;
let touched = 0;

for (const file of files) {
  const original = normalizeText(fs.readFileSync(file, 'utf8'));
  const lines = original.split('\n');
  const out = [];
  let changed = false;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    if (isGeneratedComment(line) && !detectDeclarationFromLine(next ?? '')) {
      removed += 1;
      changed = true;
      continue;
    }
    out.push(line);
  }

  if (changed) {
    touched += 1;
    fs.writeFileSync(file, out.join('\n'));
  }
}

console.log(`清理了 ${removed} 条自动注释，影响 ${touched} 个文件。`);
