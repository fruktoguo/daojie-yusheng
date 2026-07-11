#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(scriptDirectory, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf8');
}

function loadTypeScriptModule(relativePath) {
  const modulePath = path.join(clientRoot, relativePath);
  const compiled = ts.transpileModule(read(relativePath), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: modulePath,
  }).outputText;
  const module = { exports: {} };
  new Function('exports', 'module', compiled)(module.exports, module);
  return module.exports;
}

const { advanceFrameDeadlineAfterRender } = loadTypeScriptModule(
  'src/game-map/runtime/frame-schedule.ts',
);

const frameIntervalMs = 1000 / 60;
const assertNextDeadline = (deadline, now, interval = frameIntervalMs) => {
  const next = advanceFrameDeadlineAfterRender(deadline, now, interval);
  assert.ok(next > now, `下一帧时间 ${next} 必须晚于当前时间 ${now}`);
  assert.ok(next <= now + interval + Number.EPSILON * Math.max(1, now), '下一帧时间不得跨过额外帧区间');
  return next;
};

assert.equal(advanceFrameDeadlineAfterRender(1_000, 1_001, frameIntervalMs), 1_000 + frameIntervalMs);
assertNextDeadline(1_000, 1_000 + frameIntervalMs);
assertNextDeadline(1_000, 1_000 + 60 * 60 * 1_000);
assertNextDeadline(1_000, 1_000 + 24 * 60 * 60 * 1_000);
assert.equal(advanceFrameDeadlineAfterRender(Number.NaN, 5_000, 20), 5_020);
assert.equal(advanceFrameDeadlineAfterRender(5_000, 5_000, 0), 5_000 + frameIntervalMs);

const mapRuntime = read('src/game-map/runtime/map-runtime.ts');
assert.match(mapRuntime, /advanceFrameDeadlineAfterRender\(this\.nextFrameAt, now, minFrameIntervalMs\)/);
assert.doesNotMatch(mapRuntime, /while\s*\(\s*this\.nextFrameAt\s*<=\s*now\s*\)/);

const pixiRenderer = read('src/game-map/renderer/pixi-map-renderer-adapter.ts');
assert.match(pixiRenderer, /private mountGeneration = 0/);
assert.match(pixiRenderer, /generation !== this\.mountGeneration \|\| this\.canvas !== canvas/);
assert.match(pixiRenderer, /this\.app\.renderer\.resize\(this\.width, this\.height, 1\);\s*this\.ready = true/);
assert.match(pixiRenderer, /unmount\(\): void \{\s*this\.mountGeneration \+= 1;\s*this\.ready = false/);
assert.match(pixiRenderer, /this\.rendererInitPromise\.then\(\(\) => \{\s*this\.destroyApplicationResources\(\)/);

console.log('地图渲染调度与异步生命周期证明通过');
