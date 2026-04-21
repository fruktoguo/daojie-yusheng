import assert from 'node:assert/strict';

import { WorldSyncAuxStateService } from '../network/world-sync-aux-state.service';

function createService(log: unknown[] = []) {
  let lootWindow = {
    tileX: 4,
    tileY: 5,
    title: '初始拾取',
    sources: [],
  };

  const service = new WorldSyncAuxStateService(
    {
      getOrThrow(mapId: string) {
        log.push(['getTemplate', mapId]);
        return { id: mapId };
      },
    },
    {
      buildRenderEntitiesSnapshot() {
        return new Map([['player:1', { id: 'player:1', x: 3, y: 4 }]]);
      },
      buildMinimapLibrarySync() {
        return [{ mapId: 'map.a' }];
      },
      buildGameTimeState() {
        return {
          totalTicks: 10,
          localTicks: 10,
          dayLength: 120,
          timeScale: 1,
          phase: 'day',
          phaseLabel: '白昼',
          darknessStacks: 0,
          visionMultiplier: 1,
          lightPercent: 100,
          effectiveViewRange: 2,
          tint: null,
          overlayAlpha: 0,
        };
      },
      buildMapMetaSync(template: { id: string }) {
        return {
          id: template.id,
          name: template.id,
          width: 1,
          height: 1,
          routeDomain: null,
          parentMapId: null,
          parentOriginX: null,
          parentOriginY: null,
          floorLevel: null,
          floorName: null,
          spaceVisionMode: null,
          dangerLevel: null,
          recommendedRealm: null,
          description: null,
        };
      },
    },
    {
      buildInitialMapStaticState() {
        const visibleTiles = new Map([['3,4', { type: 'floor' }]]);
        const visibleMinimapMarkers = [{ id: 'marker.a', kind: 'npc', x: 3, y: 4, label: '甲', detail: '乙' }];
        return {
          visibleTiles: { matrix: [[{ type: 'floor' }]], byKey: visibleTiles },
          visibleMinimapMarkers,
          cacheState: {
            mapId: 'map.a',
            instanceId: 'inst.a',
            visibleTiles,
            visibleMinimapMarkers,
            phase: 'initial',
          },
        };
      },
      buildDeltaMapStaticPlan() {
        const visibleTiles = new Map([['3,4', { type: 'floor' }]]);
        const visibleMinimapMarkers = [{ id: 'marker.a', kind: 'npc', x: 3, y: 4, label: '甲', detail: '乙' }];
        return {
          mapChanged: false,
          visibleTiles: { matrix: [[{ type: 'floor' }]], byKey: visibleTiles },
          visibleMinimapMarkers,
          tilePatches: [{ x: 3, y: 4, tile: { type: 'wall' } }],
          visibleMinimapMarkerAdds: [{ id: 'marker.b', kind: 'npc', x: 4, y: 4, label: '丙', detail: '丁' }],
          visibleMinimapMarkerRemoves: ['marker.a'],
          cacheState: {
            mapId: 'map.a',
            instanceId: 'inst.a',
            visibleTiles,
            visibleMinimapMarkers,
            phase: 'delta',
          },
        };
      },
      commitPlayerCache(playerId: string, cacheState: { phase: string }) {
        log.push(['commitPlayerCache', playerId, cacheState.phase]);
      },
      clearPlayerCache(playerId: string) {
        log.push(['clearPlayerCache', playerId]);
      },
    },
    {
      buildMinimapSnapshotSync(template: { id: string }) {
        return {
          mapId: template.id,
          width: 1,
          height: 1,
          terrainRows: ['.'],
          markers: [],
        };
      },
    },
    {
      sendBootstrap(socket: { id: string }, payload: { self: { unlockedMinimapIds: string[] } }) {
        log.push(['sendBootstrap', socket.id, payload.self.unlockedMinimapIds]);
      },
      sendMapStatic(socket: { id: string }, payload: { tiles?: unknown }) {
        log.push(['sendMapStatic', socket.id, Boolean(payload.tiles)]);
      },
      sendWorldDelta(socket: { id: string }, payload: { tp?: unknown; vma?: unknown; vmr?: unknown }) {
        log.push(['sendWorldDelta', socket.id, Boolean(payload.tp), Boolean(payload.vma), Boolean(payload.vmr)]);
      },
      sendRealm(socket: { id: string }, payload: { realm?: { stage?: string | null } | null }) {
        log.push(['sendRealm', socket.id, payload.realm?.stage ?? null]);
      },
      sendLootWindow(socket: { id: string }, payload: { window?: { title?: string | null } | null }) {
        log.push(['sendLootWindow', socket.id, payload.window?.title ?? null]);
      },
    },
    {
      buildLootWindowSyncState() {
        return lootWindow;
      },
    },
    {
      buildThreatArrows() {
        return [['monster:1', 'player:1']];
      },
      emitInitialThreatSync(socket: { id: string }, view: { tick: number }, threatArrows: unknown[]) {
        log.push(['emitInitialThreatSync', socket.id, view.tick, threatArrows.length]);
        return threatArrows;
      },
      emitDeltaThreatSync(
        socket: { id: string },
        view: { tick: number },
        previousThreatArrows: unknown[] | null,
        mapChanged: boolean,
      ) {
        log.push(['emitDeltaThreatSync', socket.id, view.tick, previousThreatArrows?.length ?? 0, mapChanged]);
        return [['monster:2', 'player:1']];
      },
    },
    {
      buildPlayerSyncState(_player: unknown, _view: unknown, unlockedMinimapIds: string[]) {
        return {
          id: 'player:1',
          name: 'player:1',
          displayName: '玩家一',
          online: true,
          inWorld: true,
          senseQiActive: false,
          autoRetaliate: false,
          autoBattleStationary: false,
          allowAoePlayerHit: false,
          autoIdleCultivation: false,
          autoSwitchCultivation: false,
          cultivationActive: false,
          instanceId: 'inst.a',
          mapId: 'map.a',
          x: 3,
          y: 4,
          facing: 0,
          viewRange: 2,
          hp: 10,
          maxHp: 10,
          qi: 5,
          dead: false,
          foundation: 0,
          combatExp: 0,
          boneAgeBaseYears: 18,
          lifeElapsedTicks: 0,
          lifespanYears: 60,
          baseAttrs: {
            constitution: 1,
            spirit: 1,
            perception: 1,
            talent: 1,
            comprehension: 1,
            luck: 1,
          },
          bonuses: [],
          temporaryBuffs: [],
          finalAttrs: {
            constitution: 1,
            spirit: 1,
            perception: 1,
            talent: 1,
            comprehension: 1,
            luck: 1,
          },
          numericStats: {
            maxHp: 10,
            maxQi: 10,
            physAtk: 1,
            spellAtk: 1,
            physDef: 1,
            spellDef: 1,
            hit: 1,
            dodge: 1,
            crit: 1,
            critDamage: 1,
            breakPower: 1,
            resolvePower: 1,
            maxQiOutputPerTick: 1,
            qiRegenRate: 1,
            hpRegenRate: 1,
            cooldownSpeed: 1,
            auraCostReduce: 0,
            auraPowerRate: 1,
            playerExpRate: 1,
            techniqueExpRate: 1,
            realmExpPerTick: 1,
            techniqueExpPerTick: 1,
            lootRate: 1,
            rareLootRate: 1,
            viewRange: 2,
            moveSpeed: 1,
            extraAggroRate: 0,
            extraRange: 0,
            extraArea: 0,
            elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
            elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
          },
          ratioDivisors: {
            dodge: 1,
            crit: 1,
            breakPower: 1,
            resolvePower: 1,
            cooldownSpeed: 1,
            moveSpeed: 1,
            elementDamageReduce: { metal: 1, wood: 1, water: 1, fire: 1, earth: 1 },
          },
          inventory: { capacity: 20, items: [] },
          marketStorage: { items: [] },
          equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
          techniques: [],
          bodyTraining: undefined,
          alchemySkill: undefined,
          gatherSkill: undefined,
          enhancementSkill: undefined,
          enhancementSkillLevel: 0,
          actions: [],
          quests: [],
          realm: undefined,
          realmLv: undefined,
          realmName: undefined,
          realmStage: undefined,
          realmReview: undefined,
          breakthroughReady: undefined,
          heavenGate: undefined,
          spiritualRoots: undefined,
          autoBattle: false,
          autoBattleSkills: [],
          autoUsePills: [],
          combatTargetingRules: undefined,
          autoBattleTargetingMode: 'lowest_hp',
          combatTargetId: undefined,
          combatTargetLocked: false,
          cultivatingTechId: undefined,
          unlockedMinimapIds,
        } as any;
      },
    },
  );

  return {
    service,
    setLootWindow(nextLootWindow: typeof lootWindow) {
      lootWindow = nextLootWindow;
    },
  };
}

function createPlayer(stage = '炼气', progress = 10) {
  return {
    attrs: { numericStats: { viewRange: 2 } },
    realm: {
      stage,
      realmLv: 1,
      displayName: stage,
      name: stage,
      shortName: stage,
      path: 'qi',
      narrative: 'narrative',
      review: 'review',
      lifespanYears: 60,
      progress,
      progressToNext: 100,
      breakthroughReady: false,
      nextStage: '筑基',
      minTechniqueLevel: 1,
      minTechniqueRealm: 1,
      breakthroughItems: [],
      heavenGate: null,
    },
  };
}

function createView(tick = 10) {
  return {
    tick,
    worldRevision: 20,
    selfRevision: 30,
    instance: { templateId: 'map.a', instanceId: 'inst.a' },
    self: { x: 3, y: 4 },
  };
}

function testAuxStateSync() {
  const log: unknown[] = [];
  const { service, setLootWindow } = createService(log);
  const socket = { id: 'socket:1', emit() {} };

  service.emitAuxInitialSync('player:1', socket, createView(10), createPlayer('炼气', 10));
  setLootWindow({
    tileX: 4,
    tileY: 5,
    title: '增量拾取',
    sources: [],
  });
  service.emitAuxDeltaSync('player:1', socket, createView(11), createPlayer('筑基', 20));
  service.clearPlayerCache('player:1');

  assert.deepEqual(log, [
    ['getTemplate', 'map.a'],
    ['sendBootstrap', 'socket:1', ['map.a']],
    ['sendMapStatic', 'socket:1', true],
    ['sendRealm', 'socket:1', '炼气'],
    ['sendLootWindow', 'socket:1', '初始拾取'],
    ['emitInitialThreatSync', 'socket:1', 10, 1],
    ['commitPlayerCache', 'player:1', 'initial'],
    ['getTemplate', 'map.a'],
    ['sendWorldDelta', 'socket:1', true, true, true],
    ['sendRealm', 'socket:1', '筑基'],
    ['sendLootWindow', 'socket:1', '增量拾取'],
    ['emitDeltaThreatSync', 'socket:1', 11, 1, false],
    ['commitPlayerCache', 'player:1', 'delta'],
    ['clearPlayerCache', 'player:1'],
  ]);
}

testAuxStateSync();
console.log(
  JSON.stringify({
    ok: true,
    case: 'world-sync-aux-state',
    runtimeModuleFallback: false,
    runtimeModuleLoadError: null,
  }, null, 2),
);
