#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const clientRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(clientRoot, '../..');
const shared = require(path.join(repoRoot, 'packages/shared/dist/index.js'));

function read(relativePath) {
  return fs.readFileSync(path.join(clientRoot, relativePath), 'utf-8');
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
  new Function('exports', 'module', 'require', compiled)(module.exports, module, require);
  return module.exports;
}

assert.equal(shared.normalizeMailPage(-3), 1);
assert.equal(shared.normalizeMailPageSize(999), 50);
assert.equal(shared.resolveClampedMailResponsePage(4, 12, 5), 3);
assert.equal(shared.normalizeMarketRequestPage(Number.NaN), 1);
assert.equal(shared.normalizeMarketListingsPageSize(999), 100);
assert.equal(shared.normalizeMarketAuctionPageSize(999), 10);
assert.equal(shared.normalizeMarketAuctionQuery(`  ${'问'.repeat(40)}  `).length, 32);
assert.equal(shared.resolveClampedMarketResponsePage(5, 11, 10), 2);

const { resolveWorldDeltaResetContext } = loadTypeScriptModule('src/main-spatial-context.ts');
assert.deepEqual(
  resolveWorldDeltaResetContext({
    full: 1,
    mid: 'time-chamber-template:test',
    iid: 'time-chamber:test',
  }),
  {
    mapId: 'time-chamber-template:test',
    instanceId: 'time-chamber:test',
  },
  '重连全量包必须能在缺少 MapEnter 提示时恢复密室实例上下文',
);
assert.deepEqual(
  resolveWorldDeltaResetContext(
    { reset: 1, mid: 'map:stale', iid: 'instance:stale' },
    'map:hint',
    'instance:hint',
  ),
  { mapId: 'map:hint', instanceId: 'instance:hint' },
  '同一批次的 MapEnter 提示应优先于 full/reset 包内回退上下文',
);
assert.deepEqual(
  resolveWorldDeltaResetContext({ mid: 'map:delta', iid: 'instance:delta' }),
  { mapId: undefined, instanceId: undefined },
  '普通增量不得把可选 mid/iid 误判为实体重置请求',
);

const runtimeDelta = read('src/main-runtime-delta-state-source.ts');
assert.match(runtimeDelta, /resolveWorldDeltaResetContext\(data, mapIdHint, instanceIdHint\)/);
assert.match(runtimeDelta, /const spatialContextChanged = mapChanged \|\| instanceChanged/);
assert.match(runtimeDelta, /options\.clearBuildingFengShuiState\(\)/);
assert.match(runtimeDelta, /options\.setLatestObservedEntities\(\[\]\)[\s\S]*?options\.setLatestObservedEntityMap\(new Map\(\)\)/);
assert.match(runtimeDelta, /options\.setChatPersistenceScope\(buildChatPersistenceScope\(player\)\)/);
const runtimeState = read('src/main-runtime-state-source.ts');
assert.match(runtimeState, /currentPlayer\.mapId === data\.self\.mapId[\s\S]*?currentPlayer\.instanceId/);
assert.match(runtimeState, /options\.clearLootPanel\(\)[\s\S]*?options\.clearBuildingFengShuiState\(\)/);

const mapStore = read('src/game-map/store/map-store.ts');
assert.match(mapStore, /else if \(instanceChanged\)[\s\S]*?this\.clearGroundPiles\(\)[\s\S]*?this\.entityMap\.clear\(\)/);
const terrainStaticSignatureStart = mapStore.indexOf('function buildTerrainTileStaticSignature');
const terrainStaticSignatureEnd = mapStore.indexOf('\nfunction ', terrainStaticSignatureStart + 1);
assert.ok(terrainStaticSignatureStart >= 0 && terrainStaticSignatureEnd > terrainStaticSignatureStart);
const terrainStaticSignatureBody = mapStore.slice(terrainStaticSignatureStart, terrainStaticSignatureEnd);
assert.doesNotMatch(terrainStaticSignatureBody, /tile\.(?:hp|maxHp|hpVisible|aura|resources)/, '动态地块字段不得推进静态地形 revision');

const observe = read('src/main-observe-state-source.ts');
assert.match(observe, /activeObservedTile\.instanceId === \(player\.instanceId \?\? player\.mapId\)/);
const navigation = read('src/main-navigation-state-source.ts');
assert.match(navigation, /pendingAutoInteraction\.instanceId !== \(player\.instanceId \?\? player\.mapId\)/);

const marketPanel = read('src/ui/panels/market-panel.ts');
assert.match(marketPanel, /normalizeMarketAuctionQuery\(this\.auctionSearchQuery\)/);
assert.match(marketPanel, /requestedEpoch !== this\.itemBookCacheEpoch/);
assert.match(marketPanel, /Date\.now\(\) - cached\.cachedAt <= ITEM_BOOK_CACHE_MAX_AGE_MS/);
assert.match(marketPanel, /buildItemBookRevisionSignature\(data\)/);
assert.match(marketPanel, /resolveClampedMarketResponsePage\(request\.page, data\.total, data\.pageSize\)/);

const pixiRenderer = read('src/game-map/renderer/pixi-map-renderer-adapter.ts');
assert.match(pixiRenderer, /generation !== this\.runtimeImageGeneration/);
assert.match(pixiRenderer, /src\.startsWith\('data:'\)[\s\S]*?Assets\.unload\(src\)/);

console.log('client spatial-cache contracts ok');
