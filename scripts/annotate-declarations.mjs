#!/usr/bin/env node

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import { detectDeclarationFromLine } from './declaration-detector.mjs';

const ARG_DRY_RUN = process.argv.includes('--dry-run');

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

function commentLine(kind, name) {
  switch (kind) {
    case 'type':
      return `/** ${name}：定义该类型的结构与数据语义。 */`;
    case 'interface':
      return `/** ${name}：定义该接口的能力与字段约束。 */`;
    case 'class':
      return `/** ${name}：封装相关状态与行为。 */`;
    case 'enum':
      return `/** ${name}：枚举可选项及其取值含义。 */`;
    case 'function':
      return `/** ${name}：执行对应的业务逻辑。 */`;
    case 'method':
      return `/** ${name}：处理当前场景中的对应操作。 */`;
    case 'fieldFunction':
      return `/** ${name}：将函数作为字段暴露，承接调用行为。 */`;
    case 'constFunction':
      return `/** ${name}：通过常量导出可复用函数行为。 */`;
    default:
      return `/** ${name}：用于描述该声明用途。 */`;
  }
}

const detectDeclaration = detectDeclarationFromLine;

let changed = 0;
let touchedFiles = 0;
for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  const lines = original.split(/\r?\n/);
  const result = [];
  let fileChanged = false;
  let inserted = 0;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const decl = detectDeclaration(line);
    if (decl && !hasDocCommentAbove(lines, i)) {
      const comment = commentLine(decl.kind, decl.name);
      result.push(comment);
      fileChanged = true;
      inserted += 1;
      changed += 1;
    }
    result.push(line);
  }

  if (fileChanged) {
    touchedFiles += 1;
    if (ARG_DRY_RUN) {
      console.log(`[dry-run] ${file} +${inserted} 注释`);
    } else {
      fs.writeFileSync(file, `${result.join('\n')}\n`);
      console.log(`[written] ${file} +${inserted} 注释`);
    }
  }
}

console.log(`共检测到 ${changed} 处可加注释，影响 ${touchedFiles} 个文件。`);
