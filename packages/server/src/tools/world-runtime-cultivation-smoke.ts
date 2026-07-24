import assert from 'node:assert/strict';

import { WorldRuntimeCultivationService } from '../runtime/world/world-runtime-cultivation.service';

type CultivationLogEntry =
  | ['cultivateTechnique', string, string | null]
  | ['queuePlayerNotice', string, string, string];

function createPlayerRuntimeService(log: CultivationLogEntry[], techniqueName: string | null) {
  return {
    cultivateTechnique(playerId: string, techniqueId: string | null): void {
      log.push(['cultivateTechnique', playerId, techniqueId]);
    },
    forgetTechnique(): never {
      throw new Error('本 smoke 不应调用 forgetTechnique');
    },
    discardPendingTechniqueComprehension(): never {
      throw new Error('本 smoke 不应调用 discardPendingTechniqueComprehension');
    },
    getTechniqueName(): string | null {
      return techniqueName;
    },
  };
}

function createDeps(log: CultivationLogEntry[]) {
  return {
    activeTechniqueJob: {
      kind: 'enhancement',
      remainingTicks: 21,
    },
    queuePlayerNotice(playerId: string, message: string, tone: string): void {
      log.push(['queuePlayerNotice', playerId, message, tone]);
    },
  };
}

function testClearMainTechnique(): void {
  const log: CultivationLogEntry[] = [];
  const service = new WorldRuntimeCultivationService(createPlayerRuntimeService(log, null));

  service.dispatchCultivateTechnique('player:1', null, createDeps(log));

  assert.deepEqual(log, [
    ['cultivateTechnique', 'player:1', null],
    ['queuePlayerNotice', 'player:1', '已取消主修功法', 'info'],
  ]);
}

function testSetMainTechniqueWhileTechniqueJobActive(): void {
  const log: CultivationLogEntry[] = [];
  const service = new WorldRuntimeCultivationService(createPlayerRuntimeService(log, '青木剑诀'));

  service.dispatchCultivateTechnique('player:1', 'qingmu_sword', createDeps(log));

  assert.deepEqual(log, [
    ['cultivateTechnique', 'player:1', 'qingmu_sword'],
    ['queuePlayerNotice', 'player:1', '已设为主修 青木剑诀', 'success'],
  ]);
}

testClearMainTechnique();
testSetMainTechniqueWhileTechniqueJobActive();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-cultivation' }, null, 2));
