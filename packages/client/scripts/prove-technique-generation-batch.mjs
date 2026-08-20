import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [panelSource, styleSource, senderSource] = await Promise.all([
  readFile(path.join(packageRoot, 'src/react-ui/panels/technique-generation/TechniqueGenerationPanel.tsx'), 'utf8'),
  readFile(path.join(packageRoot, 'src/styles/panels/technique.css'), 'utf8'),
  readFile(path.join(packageRoot, 'src/network/socket-send-technique-generation.ts'), 'utf8'),
]);

assert.match(panelSource, /单部领悟/);
assert.match(panelSource, /批量领悟/);
assert.match(panelSource, /确认批量领悟/);
assert.match(panelSource, /全部采纳并学习/);
assert.match(panelSource, /放弃本批功法/);
assert.match(panelSource, /取消推演/);
assert.match(panelSource, /TECHNIQUE_GENERATION_MANUAL_CANCEL_AFTER_MS/);
assert.match(panelSource, /TECHNIQUE_GENERATION_AUTO_CANCEL_AFTER_MS/);
assert.match(panelSource, /callbacks\.onCancel/);
assert.match(panelSource, /六维权重均衡/);
assert.match(panelSource, /const pageSize = 6/);
assert.match(
  panelSource,
  /功法类型[\s\S]*selectedCategory === 'internal'[\s\S]*参悟方式/,
  '参悟方式必须位于功法类型之后，并且仅在内功类型下显示',
);
assert.doesNotMatch(
  panelSource,
  /disabled=\{selectedCategory !== 'internal'\}/,
  '非内功类型不应保留禁用的批量领悟入口',
);

assert.match(senderSource, /action: 'adoptBatch'/);
assert.match(senderSource, /action: 'discardBatch'/);
assert.match(senderSource, /action: 'cancel'/);
assert.match(senderSource, /sendCancelBatch/);
assert.match(senderSource, /mode: 'single' \| 'batch'/);

const mobileMediaIndex = styleSource.indexOf('@media (max-width: 720px)');
assert.ok(mobileMediaIndex >= 0, '缺少功法领悟手机端断点');
const mobileSource = styleSource.slice(mobileMediaIndex);
assert.match(mobileSource, /\.technique-generation-panel__preview[\s\S]*overflow-y: auto/);
assert.match(mobileSource, /\.technique-generation-panel__batch-grid[\s\S]*grid-template-columns: 1fr/);
assert.match(mobileSource, /\.technique-generation-panel__confirm[\s\S]*max-height: 100%[\s\S]*overflow-y: auto/);

console.log(JSON.stringify({
  ok: true,
  case: 'technique-generation-batch',
  assertions: 23,
}));
