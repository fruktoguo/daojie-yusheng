#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const clientRoot = fileURLToPath(new URL('..', import.meta.url));
const vite = await createServer({
  root: clientRoot,
  logLevel: 'error',
  server: { middlewareMode: true },
  appType: 'custom',
});

try {
  const { CraftCatalogCache } = await vite.ssrLoadModule('/src/ui/craft-catalog-cache.ts');
  const cache = new CraftCatalogCache();
  const alchemyCatalog = [createCatalogEntry('alchemy:one', '归元丹')];
  const forgingCatalog = [createCatalogEntry('forging:one', '青锋剑')];

  assert.equal(cache.getKnownVersion('alchemy'), undefined, '未收到目录前不得声明已知版本');
  assert.deepEqual(cache.read('alchemy'), { catalogVersion: 0, catalog: [] });

  const alchemySnapshot = cache.apply('alchemy', 4, alchemyCatalog);
  assert.equal(alchemySnapshot.catalogVersion, 4);
  assert.equal(cache.getKnownVersion('alchemy'), 4);
  alchemyCatalog[0].outputName = '被外部篡改';
  assert.equal(cache.read('alchemy').catalog[0].outputName, '归元丹', '目录缓存必须持有独立快照');

  cache.apply('alchemy', 4, undefined);
  assert.equal(cache.getKnownVersion('alchemy'), 4, '同版本运行态 patch 不得清空目录');

  cache.apply('forging', 4, forgingCatalog);
  assert.equal(cache.read('alchemy').catalog[0].recipeId, 'alchemy:one');
  assert.equal(cache.read('forging').catalog[0].recipeId, 'forging:one');
  assert.equal(cache.getKnownVersion('forging'), 4, '相同版本号的炼丹和炼器目录必须隔离');

  cache.apply('alchemy', 5, undefined);
  assert.equal(cache.getKnownVersion('alchemy'), undefined, '只看到新版本号时必须失效旧目录');
  assert.deepEqual(cache.read('alchemy'), { catalogVersion: 0, catalog: [] });
  assert.equal(cache.getKnownVersion('forging'), 4, '炼丹失效不得影响炼器目录');

  cache.clear();
  assert.equal(cache.getKnownVersion('forging'), undefined, '会话清理必须释放所有目录缓存');

  const modalSource = readFileSync(new URL('../src/ui/craft-workbench-modal.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(
    modalSource,
    /open(?:Alchemy|Forging)\(\): void \{[\s\S]{0,500}?this\.alchemyCatalogVersion = 0;/,
    '打开工坊不得强制清零目录版本',
  );
  assert.match(modalSource, /activateCraftCatalog\('alchemy'\)/, '炼丹入口必须激活独立缓存');
  assert.match(modalSource, /activateCraftCatalog\('forging'\)/, '炼器入口必须激活独立缓存');
  assert.match(modalSource, /craftCatalogCache\.getKnownVersion\('alchemy'\)/, '炼丹请求只能上报真实缓存版本');
  assert.match(modalSource, /craftCatalogCache\.getKnownVersion\('forging'\)/, '炼器请求只能上报真实缓存版本');

  console.log('工坊目录按类型缓存、版本失效与会话清理证明通过');
} finally {
  await vite.close();
}

function createCatalogEntry(recipeId, outputName) {
  return {
    recipeId,
    outputItemId: `${recipeId}:output`,
    outputName,
    outputLevel: 1,
    category: 'special',
    baseBrewTicks: 1,
    mainIngredients: [],
    ingredients: [],
  };
}
