#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.resolve(scriptDirectory, '../src/gm-mail-broadcast-idempotency.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
  fileName: sourcePath,
}).outputText;
const module = { exports: {} };
new Function('exports', 'module', 'require', compiled)(module.exports, module, () => ({}));

const { GmMailBroadcastIdempotencyState } = module.exports;
const generated = [];
const state = new GmMailBroadcastIdempotencyState(() => {
  const batchId = `batch-${generated.length + 1}`;
  generated.push(batchId);
  return batchId;
});
const firstPayload = { fallbackTitle: '标题', attachments: [{ itemId: 'spirit_stone', count: 1 }] };
const firstBatchId = state.resolve(firstPayload);
assert.equal(firstBatchId, 'batch-1');
assert.equal(state.resolve(structuredClone(firstPayload)), firstBatchId, '失败重试必须复用原 batchId');
assert.equal(state.matches(firstBatchId, structuredClone(firstPayload)), true);

const secondBatchId = state.resolve({ ...firstPayload, fallbackTitle: '已修改标题' });
assert.equal(secondBatchId, 'batch-2', '草稿内容变化必须换用新 batchId');
assert.equal(state.complete(firstBatchId), false, '旧请求迟到成功不得清除新草稿 batchId');
assert.equal(
  state.resolve({ ...firstPayload, fallbackTitle: '已修改标题' }),
  secondBatchId,
  '旧请求迟到成功不得清除新草稿 batchId',
);
assert.equal(
  state.matches(secondBatchId, { ...firstPayload, fallbackTitle: '再次编辑的标题' }),
  false,
  '迟到响应不得清空已经编辑的新草稿',
);
assert.equal(state.complete(secondBatchId), true);
assert.equal(
  state.resolve({ ...firstPayload, fallbackTitle: '已修改标题' }),
  'batch-3',
  '当前批次明确成功后再次发送相同内容必须视为新操作',
);

console.log(JSON.stringify({
  ok: true,
  generatedBatchIds: generated,
  answers: '相同广播草稿失败重试复用 batchId；草稿变化换代；旧响应不清新代且不能重置已编辑草稿；明确成功后相同内容可作为新广播再次发送。',
}, null, 2));
