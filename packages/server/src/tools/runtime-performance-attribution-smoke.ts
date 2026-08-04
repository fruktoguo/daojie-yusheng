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
    layers: [],
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

  attributesService.recalculate(player as never);
  attributesService.recalculate(player as never);
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.recalculateMs'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.recalculate.techniques0Ms'), 2);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheMissMs'), 1);
  assert.equal(readCount(metrics, 'attribution.attributes.techniqueResolve.cacheHitMs'), 1);
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
}

function testResetDropsPendingExternalMetrics(): void {
  const metrics = new WorldRuntimeMetricsService();
  metrics.recordExternalSectionDuration('attribution.attributes.deferredRequests', 0, 3);
  metrics.resetCpuPerfCounters();
  flushExternalMetrics(metrics);

  assert.equal(readCount(metrics, 'attribution.attributes.deferredRequests'), 0);
}

function main(): void {
  testAttributeRecalculationAttribution();
  testResetDropsPendingExternalMetrics();
  console.log('runtime performance attribution smoke passed');
}

main();
