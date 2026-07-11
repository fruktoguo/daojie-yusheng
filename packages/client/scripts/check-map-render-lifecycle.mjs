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

class MemoryStorage {
  values = new Map();
  failWrites = false;

  getItem(key) {
    return this.values.get(String(key)) ?? null;
  }

  setItem(key, value) {
    if (this.failWrites) throw new Error('quota');
    this.values.set(String(key), String(value));
  }
}

class ControlledFileReader {
  static pending = [];
  result = null;
  onerror = null;
  onload = null;

  readAsDataURL(file) {
    ControlledFileReader.pending.push({ reader: this, file });
  }
}

async function settlePromise() {
  await Promise.resolve();
  await Promise.resolve();
}

function completeReader(job, dataUrl) {
  assert.ok(job, '必须存在待完成的 FileReader');
  job.reader.result = dataUrl;
  job.reader.onload?.();
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

const storage = new MemoryStorage();
const dispatchedEvents = [];
globalThis.window = {
  localStorage: storage,
  dispatchEvent(event) {
    dispatchedEvents.push(event);
  },
};
globalThis.CustomEvent = class CustomEvent {
  constructor(type, init) {
    this.type = type;
    this.detail = init?.detail;
  }
};
globalThis.FileReader = ControlledFileReader;
const imageOverrides = loadTypeScriptModule('src/renderer/local-runtime-image-overrides.ts');
const resource = { key: 'terrain:floor', kind: 'tile', label: '平地', src: '/floor.png' };

storage.failWrites = true;
const failedSave = imageOverrides.saveRuntimeImageOverrideEntryFromFile(
  resource,
  { type: 'image/png', name: 'quota.png' },
);
completeReader(ControlledFileReader.pending.shift(), 'data:image/png;base64,quota');
await assert.rejects(failedSave, /local_runtime_image_override_storage_failed/);
assert.deepEqual(imageOverrides.getRuntimeImageOverrides(), [], '持久化失败不得污染内存覆盖快照');
assert.equal(dispatchedEvents.length, 0, '持久化失败不得通知渲染器刷新');

storage.failWrites = false;
const slowSave = imageOverrides.saveRuntimeImageOverrideEntryFromFile(
  resource,
  { type: 'image/png', name: 'slow-old.png' },
);
const fastSave = imageOverrides.saveRuntimeImageOverrideEntryFromFile(
  resource,
  { type: 'image/png', name: 'fast-new.png' },
);
const [slowReader, fastReader] = ControlledFileReader.pending.splice(0);
completeReader(fastReader, 'data:image/png;base64,new');
await fastSave;
completeReader(slowReader, 'data:image/png;base64,old');
await assert.rejects(slowSave, /local_runtime_image_override_superseded/);
assert.equal(imageOverrides.getRuntimeImageOverride(resource.key)?.fileName, 'fast-new.png', '较慢的旧选图不得覆盖最后一次选择');
assert.equal(dispatchedEvents.length, 1, '只有最新选图可发布刷新事件');

const saveBeforeReset = imageOverrides.saveRuntimeImageOverrideEntryFromFile(
  resource,
  { type: 'image/png', name: 'late-after-reset.png' },
);
const readerBeforeReset = ControlledFileReader.pending.shift();
imageOverrides.removeRuntimeImageOverride(resource.key);
completeReader(readerBeforeReset, 'data:image/png;base64,late');
await assert.rejects(saveBeforeReset, /local_runtime_image_override_superseded/);
assert.equal(imageOverrides.getRuntimeImageOverride(resource.key), null, '恢复默认后旧读图不得重新写回覆盖');
assert.equal(dispatchedEvents.length, 2, '恢复默认应只发布一次新快照');
await settlePromise();

console.log('地图渲染调度与异步生命周期证明通过');
