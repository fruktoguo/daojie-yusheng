import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldSyncEnvelopeService } from '../network/world-sync-envelope.service';

async function main(): Promise<void> {
  const noEventsProof = runNoEventsProof();
  const sharedVisibleSetProof = runSharedVisibleSetProof();
  const clearCacheProof = runClearCacheProof();

  console.log(JSON.stringify({
    ok: true,
    noEventsProof,
    sharedVisibleSetProof,
    clearCacheProof,
    answers:
      'WorldDelta 组包在没有实例表现事件时不再构造玩家可见 tile Set；战斗特效和 AOI 表现同时存在时只构造一次可见 Set；玩家同步缓存清理会同步丢弃 EventBus 玩家队列。',
    excludes:
      '不证明正式服真实 RSS 曲线，只证明 envelope 热路径避免了无事件时的可见格子 Set 分配和双重构造。',
  }, null, 2));
}

function runNoEventsProof(): { visibleSetBuilds: number; returnedSameEnvelope: boolean } {
  const counters = { visibleSetBuilds: 0, templateReads: 0 };
  const envelope = { worldDelta: { existing: true } };
  const service = createService(counters, [], []);

  const result = service.appendEventBusPayload('player_1', envelope, createView(), createPlayer(), { drainPlayer: true });

  assert.equal(counters.visibleSetBuilds, 0);
  assert.equal(counters.templateReads, 0);
  assert.equal(result, envelope);
  return { visibleSetBuilds: counters.visibleSetBuilds, returnedSameEnvelope: result === envelope };
}

function runSharedVisibleSetProof(): { visibleSetBuilds: number; combatEffects: number; aoiEffects: number; mirroredCombatEffects: number } {
  const counters = { visibleSetBuilds: 0, templateReads: 0 };
  const service = createService(
    counters,
    [{ type: 'attack', fromX: 0, fromY: 0, toX: 5, toY: 5 }],
    [{ entityId: 'monster_1', type: 'hit', x: 1, y: 1 }],
  );

  const result = service.appendEventBusPayload('player_1', {}, createView(), createPlayer(), { drainPlayer: true });
  const combatEffects = result?.worldDelta?.fx ?? [];
  const aoiEffects = result?.worldDelta?.eventBus?.aoiEffects ?? [];
  const mirroredCombatEffects = result?.worldDelta?.eventBus?.combatEffects ?? [];

  assert.equal(counters.visibleSetBuilds, 1);
  assert.equal(counters.templateReads, 1);
  assert.equal(combatEffects.length, 1);
  assert.equal(mirroredCombatEffects.length, 0);
  assert.equal(aoiEffects.length, 1);
  return {
    visibleSetBuilds: counters.visibleSetBuilds,
    combatEffects: combatEffects.length,
    aoiEffects: aoiEffects.length,
    mirroredCombatEffects: mirroredCombatEffects.length,
  };
}

function runClearCacheProof(): { projectorClears: number; eventBusDiscards: string[] } {
  const counters = { visibleSetBuilds: 0, templateReads: 0, projectorClears: 0 };
  const eventBusDiscards: string[] = [];
  const service = createService(counters, [], [], eventBusDiscards);

  service.clearPlayerCache('player_1');

  assert.equal(counters.projectorClears, 1);
  assert.deepEqual(eventBusDiscards, ['player_1']);
  return { projectorClears: counters.projectorClears, eventBusDiscards };
}

function createService(
  counters: { visibleSetBuilds: number; templateReads: number; projectorClears?: number },
  combatEffects: unknown[],
  aoiEffects: unknown[],
  eventBusDiscards: string[] = [],
): WorldSyncEnvelopeService {
  return new WorldSyncEnvelopeService(
    {
      createDeltaEnvelope: () => ({}),
      createInitialEnvelope: () => ({}),
      clear: () => {
        counters.projectorClears = (counters.projectorClears ?? 0) + 1;
      },
    } as never,
    {
      getCombatEffects: () => combatEffects,
    } as never,
    {
      getOrThrow: () => {
        counters.templateReads += 1;
        return { width: 10, height: 10 };
      },
    } as never,
    {
      buildVisibleTileKeySet: () => {
        counters.visibleSetBuilds += 1;
        return new Set(['0,0', '1,1']);
      },
    } as never,
    {
      drainPlayerEventBusPayload: () => ({ payload: null, gmStatePush: false }),
      getAoiPresentations: () => aoiEffects,
      discardPlayer: (playerId: string) => {
        eventBusDiscards.push(playerId);
      },
    } as never,
  );
}

function createView(): Record<string, unknown> {
  return {
    tick: 1,
    worldRevision: 2,
    selfRevision: 3,
    instance: {
      instanceId: 'instance_1',
      templateId: 'map_1',
    },
    self: { x: 0, y: 0 },
  };
}

function createPlayer(): Record<string, unknown> {
  return {
    playerId: 'player_1',
    attrs: { finalAttrs: {} },
  };
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
