#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const clientRoot = path.resolve(scriptDirectory, '..');
const repoRoot = path.resolve(clientRoot, '../..');
const nodeRequire = createRequire(import.meta.url);

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
  const localRequire = (specifier) => specifier === '@mud/shared'
    ? nodeRequire(path.join(repoRoot, 'packages/shared/dist/index.js'))
    : nodeRequire(specifier);
  new Function('exports', 'module', 'require', compiled)(module.exports, module, localRequire);
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
const {
  buildPixiTerrainChunkOverlaySignature,
  buildPixiTerrainChunkStaticSignature,
} = loadTypeScriptModule('src/game-map/renderer/pixi-terrain-cache-signatures.ts');
const combatEffectLayout = loadTypeScriptModule('src/renderer/combat-effect-layout.ts');
const shared = nodeRequire(path.join(repoRoot, 'packages/shared/dist/index.js'));

assert.deepEqual(
  shared.resolveSenseQiOverlaySignal(2_250, [], 1_000),
  { family: 'aura', value: 3 },
  '地块灵气绝对值必须先换算为等级，不能直接把 2250 当作颜色等级',
);
assert.deepEqual(
  shared.resolveSenseQiOverlaySignal(2_250, [{ key: 'sha.refined.neutral', value: 9_999, level: 4 }], 1_000),
  { family: 'sha', value: 4 },
  '更强的资源等级必须覆盖基础灵气家族与等级',
);
assert.deepEqual(
  shared.resolveSenseQiOverlaySignal(2_250, [{ key: 'demonic.refined.neutral', value: 3_375 }], 1_000),
  { family: 'demonic', value: 4 },
  '缺少显式等级时必须按有效资源值换算等级',
);

const baseTile = {
  type: 'floor',
  walkable: true,
  blocksSight: false,
  aura: 1_000,
  resources: [{ key: 'aura.refined.neutral', label: '灵气', value: 1_000, level: 1 }],
  occupiedBy: null,
  modifiedAt: null,
};
const buildStaticSignature = (tile) => buildPixiTerrainChunkStaticSignature(
  new Map([['0,0', tile]]),
  0,
  0,
  32,
  true,
  false,
  1,
);
const baseStaticSignature = buildStaticSignature(baseTile);
assert.equal(buildStaticSignature({
  ...baseTile,
  hp: 5,
  maxHp: 10,
  hpVisible: true,
  aura: 3_375,
  resources: [{ key: 'sha.refined.neutral', label: '煞气', value: 3_375, level: 4 }],
}), baseStaticSignature, '动态生命与气机变化不得让静态地形缓存失效');
assert.notEqual(
  buildStaticSignature({ ...baseTile, surfaceType: 'mud' }),
  baseStaticSignature,
  '地形贴图输入变化必须让静态地形缓存失效',
);

const buildOverlaySignature = (tile, senseQiLevelBaseValue = 1_000) => buildPixiTerrainChunkOverlaySignature(
  new Map([['0,0', tile]]),
  new Set(['0,0']),
  0,
  0,
  32,
  senseQiLevelBaseValue === null ? 'sense:null' : `sense:${senseQiLevelBaseValue}`,
  senseQiLevelBaseValue,
);
assert.equal(
  buildOverlaySignature(baseTile),
  buildOverlaySignature({ ...baseTile, aura: 1_200 }),
  '同一灵气等级内的半衰期数值波动不应重建望气覆盖层',
);
assert.notEqual(
  buildOverlaySignature(baseTile),
  buildOverlaySignature({ ...baseTile, aura: 1_500 }),
  '基础灵气等级变化必须重建望气覆盖层',
);
assert.notEqual(
  buildOverlaySignature(baseTile),
  buildOverlaySignature({
    ...baseTile,
    resources: [{ key: 'sha.refined.neutral', label: '煞气', value: 1_000, level: 3 }],
  }),
  '资源条数不变时，家族或等级变化仍必须重建望气覆盖层',
);
assert.notEqual(
  buildOverlaySignature({ ...baseTile, hp: 10, maxHp: 10 }),
  buildOverlaySignature({ ...baseTile, hp: 10, maxHp: 10, hpVisible: true }),
  'hpVisible 的未指定与显式 true 语义不同，必须分别失效',
);
assert.equal(
  buildOverlaySignature(baseTile, null),
  buildOverlaySignature({ ...baseTile, aura: 3_375, resources: [] }, null),
  '望气关闭时气机变化不应重建动态覆盖层',
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

assert.equal(combatEffectLayout.resolveFloatingTextDuration('action', 'chant', undefined), 1240, '吟唱浮字默认时长必须与 Canvas 规则一致');
assert.equal(combatEffectLayout.resolveFloatingTextDuration('damage', undefined, 0), 1, '显式异常时长必须收敛为可推进的正数');
assert.equal(combatEffectLayout.normalizeTimedEffectDuration(Number.NaN, 1240), 1240, '非有限时长不得让特效永久残留');
assert.equal(combatEffectLayout.buildVerticalFloatingText(' 天 道 '), '天\n道', '动作文字必须投影为非空字符纵排');
assert.deepEqual(
  combatEffectLayout.resolveWarningZoneOrigin([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]),
  { x: 5, y: 5 },
  '缺少权威原点时两种渲染器必须使用同一包围盒中心',
);
const burstEntries = [
  { x: -1, y: 2, variant: 'damage', burstOffsetX: 0, burstOffsetY: 0 },
  { x: -1, y: 2, variant: 'damage', burstOffsetX: 0, burstOffsetY: 0 },
  { x: -1, y: 2, variant: 'action', burstOffsetX: 0, burstOffsetY: 0 },
];
const burstLayout = new combatEffectLayout.FloatingTextBurstLayout();
burstLayout.apply(burstEntries, 100);
assert.deepEqual(
  burstEntries.map((entry) => [entry.burstOffsetX, entry.burstOffsetY]),
  [[-15, 6], [15, 6], [0, 0]],
  '同格同类浮字必须按创建顺序爆散，不同 variant 不得互相挤压',
);
burstLayout.reset();
const timedEffects = [
  { id: 1, createdAt: 0, duration: 100 },
  { id: 2, createdAt: 80, duration: 100 },
  { id: 3, createdAt: 90, duration: 100 },
];
const timedEffectsIdentity = timedEffects;
combatEffectLayout.pruneExpiredTimedEffectsInPlace(timedEffects, 150);
assert.equal(timedEffects, timedEffectsIdentity, '过期回收不得替换特效数组身份');
assert.deepEqual(timedEffects.map((entry) => entry.id), [2, 3], '原地压缩必须保持幸存特效创建顺序');

const mapRuntime = read('src/game-map/runtime/map-runtime.ts');
assert.match(mapRuntime, /advanceFrameDeadlineAfterRender\(this\.nextFrameAt, now, minFrameIntervalMs\)/);
assert.doesNotMatch(mapRuntime, /while\s*\(\s*this\.nextFrameAt\s*<=\s*now\s*\)/);

const pixiRenderer = read('src/game-map/renderer/pixi-map-renderer-adapter.ts');
const pixiCombatEffects = read('src/game-map/renderer/pixi-combat-effect-runtime.ts');
assert.match(pixiRenderer, /private mountGeneration = 0/);
assert.match(pixiRenderer, /generation !== this\.mountGeneration \|\| this\.canvas !== canvas/);
assert.match(pixiRenderer, /this\.app\.renderer\.resize\(this\.width, this\.height, 1\);\s*this\.ready = true/);
assert.match(pixiRenderer, /unmount\(\): void \{\s*this\.mountGeneration \+= 1;\s*this\.ready = false/);
assert.match(pixiRenderer, /this\.rendererInitPromise\.then\(\(\) => \{\s*this\.destroyApplicationResources\(\)/);
assert.match(pixiRenderer, /destroy\(\): void \{[\s\S]*?this\.profiler\.destroy\(\)/);
assert.doesNotMatch(pixiRenderer, /profileMeasure|this\.profiler\.[A-Za-z]+\([^\n]*\(\) =>/, '正常帧路径不得为 profiler 创建测量闭包');
assert.match(pixiRenderer, /if \(profileActive\) \{[\s\S]*?this\.profiler\.recordFrame\(frameAtMs, activeSchedule\)/, '关闭 profiler 时不得构造帧诊断快照');
assert.match(pixiRenderer, /from '\.\/pixi-runtime-image-manifest'/);
assert.match(pixiRenderer, /from '\.\/pixi-render-primitives'/);
assert.match(pixiRenderer, /this\.renderThreatArrows\(player\.id\)/, '威胁箭头必须以本地玩家身份区分自有与他人关系');
assert.match(pixiRenderer, /const self = arrow\.ownerId === localPlayerId/, '不能把所有玩家发起的威胁关系都渲染为自己的颜色');
assert.match(pixiRenderer, /if \(!from\?\.root\.visible \|\| !to\?\.root\.visible\) continue/, '离开当前视口的实体不得继续绘制穿屏威胁箭头');
assert.match(pixiRenderer, /this\.patchEntityMotion\(view, motionProgress, frameNow\)/, '同一帧的实体动画必须复用统一时钟');
assert.match(pixiRenderer, /return this\.entities\.get\(id\);/, '威胁实体必须直接复用权威实体索引');
assert.doesNotMatch(pixiRenderer, /view\.root\.visible && anim\.kind === 'crowd'/, '拥挤判定不得读取上一帧可见性');
assert.doesNotMatch(pixiRenderer, /\[\.\.\.this\.entities\.values\(\)\]\.find/, '每帧威胁箭头不得退化为实体数组分配与线性查找');
assert.match(pixiRenderer, /new PixiCombatEffectRuntime\(this\.effectLayer\)/, 'adapter 必须把 Pixi 特效对象生命周期交给窄拥有者');
assert.doesNotMatch(pixiRenderer, /private (?:floatingTexts|attackTrails|warningZones)\b/, 'adapter 不得重新吸收战斗特效数组');
assert.doesNotMatch(pixiCombatEffects, /\.filter\(/, 'Pixi 特效逐帧回收不得重建数组');
assert.match(pixiCombatEffects, /entry\.text\.parent\?\.removeChild\(entry\.text\);\s*entry\.text\.destroy\(\)/, '浮字移除必须同步释放 Pixi 节点');
assert.match(pixiCombatEffects, /zone\.graphics\.parent\?\.removeChild\(zone\.graphics\);\s*zone\.graphics\.destroy\(\)/, '预警区移除必须同步释放 Pixi 节点');
assert.doesNotMatch(pixiRenderer, /^function (?:normalizePixiTileSpriteMap|buildFormationRangeSignature|parseColor)\b/m, 'adapter 不得重新吸收图包解析和纯视觉规则');

const storage = new MemoryStorage();
const dispatchedEvents = [];
globalThis.window = {
  localStorage: storage,
  setInterval: globalThis.setInterval,
  clearInterval: globalThis.clearInterval,
  setTimeout: globalThis.setTimeout,
  clearTimeout: globalThis.clearTimeout,
  dispatchEvent(event) {
    dispatchedEvents.push(event);
  },
};
globalThis.requestAnimationFrame = (callback) => {
  callback(performance.now());
  return 1;
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

const vite = await createServer({
  root: clientRoot,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});
try {
  const { PixiRenderProfiler } = await vite.ssrLoadModule('/src/game-map/renderer/pixi-render-profiler.ts');
  const runtimeImageManifest = await vite.ssrLoadModule('/src/game-map/renderer/pixi-runtime-image-manifest.ts');
  const renderPrimitives = await vite.ssrLoadModule('/src/game-map/renderer/pixi-render-primitives.ts');
  const frameSpatialIndex = await vite.ssrLoadModule('/src/game-map/renderer/pixi-frame-spatial-index.ts');
  const spriteMap = runtimeImageManifest.normalizePixiTileSpriteMap({
    'terrain:floor': {
      src: './floor.png',
      cols: 4,
      rows: 2,
      meta: { zIndex: 123, dualGrid: true },
    },
  }, '/assets/runtime-image-packs/default/manifest.json', 'test-version');
  const floorSprite = spriteMap.get('terrain:floor');
  assert.equal(floorSprite?.cols, 4, '图包清单归一化必须保留合法 atlas 列数');
  assert.equal(floorSprite?.zIndex, 123, '图包 meta 层级必须进入 Pixi 引用');
  assert.equal(floorSprite?.dualGrid, true, '图包 dual-grid 元数据必须进入 Pixi 引用');
  assert.equal(runtimeImageManifest.resolveTopTileSpriteKey({
    type: 'floor',
    walkable: true,
    blocksSight: false,
    aura: 0,
    occupiedBy: null,
    modifiedAt: null,
    terrainType: 'stone',
    surfaceType: 'grass',
    structureType: 'gate',
  }, new Map([['floor', 'terrain:floor']])), 'structure:gate', '图层选择必须保持 structure 优先级');
  assert.equal(renderPrimitives.parseColor('rgba(12, 34, 56, 0.5)'), 0x0c2238, '颜色投影拆分后必须保持 RGB 语义');
  assert.equal(renderPrimitives.buildGridPointSignature([{ x: 1, y: 2 }, { x: 3, y: 4 }]), '2|1,2|3,4');
  const crowdedTiles = new frameSpatialIndex.PixiFrameGridPointSet();
  crowdedTiles.add(-4, 8);
  crowdedTiles.add(-4, 9);
  assert.equal(crowdedTiles.has(-4, 8), true, '拥挤格点索引必须支持负坐标');
  assert.equal(crowdedTiles.has(8, -4), false, '二维格点索引不得交换坐标后误命中');
  crowdedTiles.reset();
  assert.equal(crowdedTiles.has(-4, 8), false, '每帧重置后不得保留上一帧拥挤状态');
  crowdedTiles.add(12, 6);
  assert.equal(crowdedTiles.has(12, 6), true, '重置后的行容器必须可以安全复用');
  assert.equal(
    frameSpatialIndex.isPixiEntityInViewport(95, 20, 10, 0, 0, 100, 100),
    true,
    '实体边缘进入视口时必须算作当前帧可见',
  );
  assert.equal(
    frameSpatialIndex.isPixiEntityInViewport(111, 20, 10, 0, 0, 100, 100),
    false,
    '实体完全离开视口时不得污染当前帧拥挤索引',
  );

  const profiler = new PixiRenderProfiler(() => ({
    terrainChunks: 0,
    cachedTerrainChunks: 0,
    terrainCachedContainers: 0,
    terrainChunkChildren: 0,
    entities: 0,
    groundChildren: 0,
    entityChildren: 0,
    effectChildren: 0,
    screenChildren: 0,
    pathChildren: 0,
    floatingTexts: 0,
    attackTrails: 0,
    warningZones: 0,
    runtimeTileTextures: 0,
    runtimeAtlasTextures: 0,
    runtimeEntityTextures: 0,
    runtimeTileTextureRequests: 0,
    runtimeEntityTextureRequests: 0,
    runtimeTileManifestState: 'idle',
    backbufferWidth: 1,
    backbufferHeight: 1,
    backbufferPixels: 1,
  }));
  assert.equal(profiler.isActive(), false, 'profiler 默认不得进入正常渲染热路径');
  profiler.setEnabled(true);
  assert.equal(profiler.isActive(), true, '显式启用后才允许采集帧数据');
  assert.equal(typeof window.__mudPixiProfileReset, 'function', '启用 profiler 必须注册显式重置入口');
  const startedAt = profiler.start();
  profiler.end('renderFrame', startedAt);
  profiler.count('frames');
  profiler.publish(true);
  assert.equal(window.__mudPixiProfile?.enabled, true, '启用状态必须发布诊断快照');
  window.__mudPixiProfileReset();
  assert.equal(window.__mudPixiProfile?.counters.frames, 0, '全局重置入口必须重置累计计数');
  profiler.destroy();
  assert.equal(profiler.isActive(), false, '销毁后必须停止采集');
  assert.equal('__mudPixiProfile' in window, false, '销毁后不得保留诊断快照');
  assert.equal('__mudPixiProfileReset' in window, false, '销毁后不得保留捕获渲染器的重置闭包');
  assert.equal('__mudRuntimeProfilerEnabled' in window, false, '销毁后必须同步关闭运行时 profiler');
} finally {
  await vite.close();
}

console.log('地图渲染调度与异步生命周期证明通过');
