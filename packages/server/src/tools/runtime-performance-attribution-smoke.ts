import assert from 'node:assert/strict';

import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { WorldRuntimeMetricsService } from '../runtime/world/world-runtime-metrics.service';

function createTechnique(index: number) {
  return {
    techId: `technique:perf:${index}`,
    name: `性能功法${index}`,
    grade: 'mortal',
    category: 'internal',
    level: 1,
    exp: 0,
    expToNext: 0,
    realmLv: 1,
    realm: 0,
    skills: [],
    layers: [{
      level: 1,
      attrs: { strength: index + 1 },
      specialStats: { comprehension: index % 2 },
    }],
  };
}

function createPlayer(attributesService: PlayerAttributesService) {
  return {
    playerId: 'player:runtime-performance-attribution',
    selfRevision: 1,
    comprehension: 0,
    luck: 0,
    rootFoundation: 0,
    realm: { realmLv: 1 },
    bodyTraining: { level: 0 },
    hp: 100,
    maxHp: 100,
    qi: 0,
    maxQi: 0,
    attrs: attributesService.createInitialState(),
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    buffs: { revision: 1, buffs: [] },
    runtimeBonuses: [],
  };
}

function flushExternalMetrics(metrics: WorldRuntimeMetricsService): void {
  metrics.recordIdleFrame(performance.now());
}

function readCount(metrics: WorldRuntimeMetricsService, key: string): number {
  return metrics.cumulativeTickSectionSummaries[key]?.count ?? 0;
}

function testAttributeRecalculationAttribution(): void {
  const metrics = new WorldRuntimeMetricsService();
  const attributesService = new PlayerAttributesService(metrics);
  const player = createPlayer(attributesService);

  attributesService.recalculate(player as never, 'world_time');
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.recalculateMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.recalculate.techniques0Ms'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.request.worldTime'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.request.other'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheHitMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheRelevantHitMs'), 0);
  assert.equal(readCount(metrics, 'attribution.attributes.build.sourceSetupMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.baseAttributesMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.equipmentProjectionMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.equipmentResolve.cacheMissMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.equipmentResolve.cacheHitMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.build.buffAttributeProjectionMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.attributeWeightsMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.equipmentStatsMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.buffStatsMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.build.finalModifiersMs'), 2);
  assert.equal(
    readCount(metrics, 'attribution.attributes.recalculate.changed')
      + readCount(metrics, 'attribution.attributes.recalculate.unchanged'),
    2,
  );

  player.techniques = {
    revision: 2,
    techniques: Array.from({ length: 21 }, (_, index) => createTechnique(index)),
    cultivatingTechId: null,
  };
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.recalculate.techniques21PlusMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueEntries'), 21);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 2);

  const attrsAfterInitialResolve = structuredClone(player.attrs);
  player.techniques.techniques[0].exp += 1;
  player.techniques.revision += 1;
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);

  assert.deepEqual(player.attrs, attrsAfterInitialResolve);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheRelevantHitMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 2);

  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheHitMs'), 2);

  player.techniques.techniques[0].level += 1;
  player.techniques.revision += 1;
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 3);

  player.techniques.techniques[0].layers = [{
    level: 1,
    attrs: { strength: 1 },
  }, {
    level: 2,
    attrs: { strength: 100 },
  }];
  player.techniques.revision += 1;
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 4);
  assert.notDeepEqual(player.attrs, attrsAfterInitialResolve);

  player.techniques.techniques.push(createTechnique(21));
  player.techniques.revision += 1;
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 5);

  const equipmentMissesBefore = readCount(metrics, 'attribution.attributes.equipmentResolve.cacheMissMs');
  player.equipment = {
    revision: 2,
    slots: [{
      slot: 'weapon',
      item: {
        itemId: 'equipment:perf',
        name: '性能装备',
        type: 'equipment',
        level: 1,
        count: 1,
        enhanceLevel: 0,
        equipAttrs: { strength: 10 },
      },
    }],
  };
  attributesService.recalculate(player as never, 'equipment');
  flushExternalMetrics(metrics);
  assert.equal(
    readCount(metrics, 'attribution.attributes.equipmentResolve.cacheMissMs'),
    equipmentMissesBefore + 1,
    'expected equipment revision and slot replacement to invalidate the projection cache',
  );
  const strengthAfterEquipment = player.attrs.finalAttrs.strength;

  attributesService.recalculate(player as never, 'buff');
  flushExternalMetrics(metrics);
  assert.equal(player.attrs.finalAttrs.strength, strengthAfterEquipment);
  assert.ok(readCount(metrics, 'attribution.attributes.equipmentResolve.cacheHitMs') >= 2);

  player.realm.realmLv = 2;
  attributesService.recalculate(player as never, 'realm_progression');
  flushExternalMetrics(metrics);
  assert.equal(
    readCount(metrics, 'attribution.attributes.equipmentResolve.cacheMissMs'),
    equipmentMissesBefore + 2,
    'expected realm level changes to invalidate equipment effectiveness projection',
  );
}

function testAttributeRecalculationReasonDimensions(): void {
  const metrics = new WorldRuntimeMetricsService();
  const attributesService = new PlayerAttributesService(metrics);
  const player = createPlayer(attributesService);
  const dimensions = [
    ['feng_shui_luck', 'attribution.attributes.request.fengShuiLuck'],
    ['realm_progression', 'attribution.attributes.request.realmProgression'],
    ['technique_progression', 'attribution.attributes.request.techniqueProgression'],
    ['body_training', 'attribution.attributes.request.bodyTraining'],
    ['buff', 'attribution.attributes.request.buff'],
    ['cultivation_state', 'attribution.attributes.request.cultivationState'],
    ['initialization', 'attribution.attributes.request.initialization'],
    ['leaderboard_projection', 'attribution.attributes.request.leaderboardProjection'],
    ['equipment', 'attribution.attributes.request.equipment'],
    ['technique_mutation', 'attribution.attributes.request.techniqueMutation'],
    ['fortune', 'attribution.attributes.request.fortune'],
    ['respawn', 'attribution.attributes.request.respawn'],
    ['craft_settlement', 'attribution.attributes.request.craftSettlement'],
  ] as const;

  for (const [reason] of dimensions) {
    attributesService.recalculate(player as never, reason);
  }
  flushExternalMetrics(metrics);

  for (const [, metricKey] of dimensions) {
    assert.equal(readCount(metrics, metricKey), 1, `expected fixed attribute reason metric: ${metricKey}`);
  }
}

function testResetDropsPendingExternalMetrics(): void {
  const metrics = new WorldRuntimeMetricsService();
  metrics.recordExternalSectionDuration('attribution.attributes.deferredRequests', 0, 3);
  metrics.resetCpuPerfCounters();
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.deferredRequests'), 0);
}

function testDeferredAttributeRecalculationMetrics(): void {
  const metrics = new WorldRuntimeMetricsService();
  const attributesService = new PlayerAttributesService(metrics);
  const player = createPlayer(attributesService);

  attributesService.withDeferredRecalculation(player as never, () => {
    attributesService.recalculate(player as never, 'buff');
    attributesService.recalculate(player as never, 'buff');
    attributesService.ensureFresh(player as never);
    attributesService.recalculate(player as never, 'buff');
  });
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.deferredRequests'), 3);
  assert.equal(readCount(metrics, 'attribution.attributes.coalescedRequests'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.ensureFreshFlushes'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.batchFlushes'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.recalculateMs'), 2);
}

function main(): void {
  testAttributeRecalculationAttribution();
  testAttributeRecalculationReasonDimensions();
  testDeferredAttributeRecalculationMetrics();
  testResetDropsPendingExternalMetrics();
  console.log('runtime performance attribution smoke passed');
}

main();
