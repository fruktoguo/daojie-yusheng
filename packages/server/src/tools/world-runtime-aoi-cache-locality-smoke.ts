import assert from 'node:assert/strict';

import { Direction, createNumericRatioDivisors, createNumericStats } from '@mud/shared';

import { WorldProjectorService } from '../network/world-projector.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';

function createTemplate() {
  const width = 64;
  const height = 3;
  const cellCount = width * height;
  return {
    id: 'aoi-cache-locality-map',
    name: 'AOI 局部缓存 Smoke',
    width,
    height,
    terrainRows: Array.from({ length: height }, () => '.'.repeat(width)),
    walkableMask: Uint8Array.from({ length: cellCount }, () => 1),
    blocksSightMask: Uint8Array.from({ length: cellCount }, () => 0),
    baseAuraByTile: Int32Array.from({ length: cellCount }, () => 0),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 1,
    spawnY: 1,
    source: {},
  };
}

function createInstance(): MapInstanceRuntime {
  return new MapInstanceRuntime({
    instanceId: 'instance:aoi-cache-locality',
    template: createTemplate(),
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: 'AOI 局部缓存 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function verifyRemoteChangesDoNotRebuildObserverView(): void {
  const instance = createInstance();
  instance.connectPlayer({ playerId: 'player:observer', sessionId: 'session:observer', preferredX: 2, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:near', sessionId: 'session:near', preferredX: 4, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:far', sessionId: 'session:far', preferredX: 50, preferredY: 1 });

  const initial = instance.buildPlayerView('player:observer', 10);
  assert.ok(initial);
  assert.equal(initial?.visiblePlayers.some((entry) => entry.playerId === 'player:near'), true);
  assert.equal(initial?.visiblePlayers.some((entry) => entry.playerId === 'player:far'), false);

  instance.relocatePlayer('player:far', 51, 1);
  const afterFarMove = instance.buildPlayerView('player:observer', 10);
  assert.equal(afterFarMove, initial, '远处玩家移动不应重建观察者 AOI 快照');
  assert.equal(afterFarMove?.worldRevision, instance.worldRevision, '缓存命中仍应刷新协议 worldRevision');

  instance.relocatePlayer('player:near', 5, 1);
  const afterNearMove = instance.buildPlayerView('player:observer', 10);
  assert.notEqual(afterNearMove, afterFarMove, '视野内玩家移动必须重建 AOI 快照');
  assert.equal(afterNearMove?.visiblePlayers.find((entry) => entry.playerId === 'player:near')?.x, 5);
}

function verifyStaticDirtyUsesLocalChunks(): void {
  const instance = createInstance();
  const observer = instance.connectPlayer({
    playerId: 'player:observer',
    sessionId: 'session:observer',
    preferredX: 2,
    preferredY: 1,
  });
  assert.equal(observer.facing, Direction.East);
  const initial = instance.buildPlayerView('player:observer', 10);
  const initialPathingRevision = instance.getStaticPathingRevision();

  instance.markStaticTileSyncDirtyByIndex(instance.toTileIndex(40, 1));
  instance.markStaticTileSyncDirtyByIndex(instance.toTileIndex(45, 1), { sightBlockingChanged: true });
  assert.equal(
    instance.getStaticPathingRevision(),
    initialPathingRevision,
    '纯展示或 LOS 变化不得污染静态寻路 revision',
  );

  const farIndex = instance.toTileIndex(50, 1);
  instance.markStaticTileSyncDirtyByIndex(farIndex, { sightBlockingChanged: true, pathingChanged: true });
  assert.equal(instance.getStaticPathingRevision(), initialPathingRevision + 1);
  instance.worldRevision += 1;
  const afterFarStaticChange = instance.buildPlayerView('player:observer', 10);
  assert.equal(afterFarStaticChange, initial, '远处静态地块变化不应重建本地 AOI');

  const nearIndex = instance.toTileIndex(6, 1);
  instance.markStaticTileSyncDirtyByIndex(nearIndex, { sightBlockingChanged: true, pathingChanged: true });
  instance.worldRevision += 1;
  const afterNearStaticChange = instance.buildPlayerView('player:observer', 10);
  assert.notEqual(afterNearStaticChange, afterFarStaticChange, '视野内静态地块变化必须重建 AOI');
}

function verifyRemoteWorldRevisionSkipsProjectorRebuild(): void {
  const instance = createInstance();
  instance.connectPlayer({ playerId: 'player:observer', sessionId: 'session:observer', preferredX: 2, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:near', sessionId: 'session:near', preferredX: 4, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:far', sessionId: 'session:far', preferredX: 50, preferredY: 1 });

  const projector = createProjector();
  const player = createProjectorPlayer('player:observer');
  const initial = instance.buildPlayerView('player:observer', 10);
  assert.ok(initial);
  projector.createInitialEnvelope({ playerId: player.playerId, sessionId: 'session:observer' }, initial, player);
  const cachedBefore = projector.getCachedProjectorState(player.playerId);
  const cachedWorldRevision = cachedBefore?.worldRevision;

  instance.relocatePlayer('player:far', 51, 1);
  const afterFarMove = instance.buildPlayerView('player:observer', 10);
  assert.equal(afterFarMove, initial, '远处变化必须复用同一份 AOI view');
  const remoteDelta = projector.createDeltaEnvelope(afterFarMove, player);
  assert.equal(remoteDelta, null, '远处 worldRevision 变化不得生成局部 world patch');
  assert.equal(projector.getCachedProjectorState(player.playerId), cachedBefore, '远处变化不得重建投影缓存');
  assert.equal(projector.getCachedProjectorState(player.playerId)?.worldRevision, cachedWorldRevision);

  instance.relocatePlayer('player:near', 5, 1);
  const afterNearMove = instance.buildPlayerView('player:observer', 10);
  assert.notEqual(afterNearMove, afterFarMove, '近处变化必须使 AOI view 失效');
  const localDelta = projector.createDeltaEnvelope(afterNearMove, player);
  assert.equal(localDelta?.worldDelta?.p?.find((entry: any) => entry.id === 'player:near')?.x, 5);
}

function verifyIdentityAndVisiblePresentationStillInvalidateProjector(): void {
  const instance = createInstance();
  instance.connectPlayer({ playerId: 'player:observer', sessionId: 'session:observer', preferredX: 2, preferredY: 1 });
  instance.connectPlayer({ playerId: 'player:near', sessionId: 'session:near', preferredX: 4, preferredY: 1 });
  const identities = new Map<string, { pendingRoleName: string; displayName: string }>([
    ['player:near', { pendingRoleName: '初始道友', displayName: '初' }],
  ]);
  const projector = new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ id: mapId, name: mapId }),
  } as never, {
    getMemoryUserByPlayerId: (playerId: string) => identities.get(playerId) ?? null,
  } as never);
  const player = createProjectorPlayer('player:observer');
  const view = instance.buildPlayerView('player:observer', 10);
  assert.ok(view);
  projector.createInitialEnvelope({ playerId: player.playerId, sessionId: 'session:observer' }, view, player);

  identities.set('player:near', { pendingRoleName: '更新道友', displayName: '新' });
  const renamed = projector.createDeltaEnvelope(view, player);
  const visiblePlayerPatch = renamed?.worldDelta?.p?.find((entry: any) => entry.id === 'player:near');
  assert.equal(visiblePlayerPatch?.n, '更新道友', '身份展示值变化必须进入世界投影');
  assert.equal(visiblePlayerPatch?.ch, '新');

  const presentationView = instance.buildPlayerView('player:observer', 10);
  assert.equal(presentationView, view, '未发生 AOI 变化时展示夹具应使用同一份 view');
  presentationView.self.buffs = {
    buffs: [{ remainingTicks: 10, stacks: 1, presentationScale: 4 }],
  };
  const scaled = projector.createDeltaEnvelope(presentationView, player);
  const selfPatch = scaled?.worldDelta?.p?.find((entry: any) => entry.id === player.playerId);
  assert.equal(selfPatch?.sc, 4, '玩家体型展示变化必须绕过来源引用短路');
}

function verifyVisibleMonsterBuffStillInvalidatesProjector(): void {
  const instance = createInstance();
  instance.connectPlayer({ playerId: 'player:observer', sessionId: 'session:observer', preferredX: 2, preferredY: 1 });
  const view = instance.buildPlayerView('player:observer', 10);
  assert.ok(view);
  const publicBuff = {
    buffId: 'buff.aoi_projector',
    name: 'AOI 投影 Buff',
    shortMark: '护',
    category: 'buff',
    visibility: 'public',
    remainingTicks: 10,
    duration: 10,
    stacks: 1,
    maxStacks: 3,
    sourceSkillId: 'skill.aoi_projector',
  };
  view.localMonsters = [{
    runtimeId: 'monster:aoi-projector',
    monsterId: 'monster.aoi_projector',
    x: 4,
    y: 1,
    facing: Direction.West,
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
    name: '投影妖兽',
    char: '妖',
    color: '#f00',
    tier: 'mortal_blood',
    buffs: [publicBuff],
  }];
  const projector = createProjector();
  const player = createProjectorPlayer('player:observer');
  projector.createInitialEnvelope({ playerId: player.playerId, sessionId: 'session:observer' }, view, player);

  publicBuff.stacks = 2;
  const buffDelta = projector.createDeltaEnvelope(view, player);
  assert.equal(buffDelta?.worldDelta?.m?.[0]?.buffs?.[0]?.stacks, 2, '妖兽可见 Buff 变化必须绕过来源引用短路');
}

function createProjector(): WorldProjectorService {
  return new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ id: mapId, name: mapId }),
  } as never, null);
}

function createProjectorPlayer(playerId: string) {
  return {
    playerId,
    instanceId: 'instance:aoi-cache-locality',
    templateId: 'aoi-cache-locality-map',
    x: 2,
    y: 1,
    facing: Direction.East,
    hp: 100,
    maxHp: 100,
    qi: 100,
    maxQi: 100,
    selfRevision: 1,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    bodyTraining: null,
    attrs: {
      revision: 1,
      stage: '炼气',
      baseAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
      finalAttrs: { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 },
      numericStats: createNumericStats(),
      ratioDivisors: createNumericRatioDivisors(),
    },
    realm: { progress: 0, progressToNext: 100, breakthroughReady: false },
    actions: { revision: 1, actions: [] },
    combat: {
      autoBattle: false,
      autoUsePills: [],
      combatTargetingRules: null,
      autoBattleTargetingMode: 'nearest',
      retaliatePlayerTargetId: null,
      combatTargetId: null,
      combatTargetLocked: false,
      autoRetaliate: false,
      autoBattleStationary: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: false,
      autoSwitchCultivation: false,
      autoRootFoundation: false,
      cultivationActive: false,
      senseQiActive: false,
      wangQiActive: false,
    },
    buffs: { revision: 1, buffs: [] },
  };
}

verifyRemoteChangesDoNotRebuildObserverView();
verifyStaticDirtyUsesLocalChunks();
verifyRemoteWorldRevisionSkipsProjectorRebuild();
verifyIdentityAndVisiblePresentationStillInvalidateProjector();
verifyVisibleMonsterBuffStillInvalidatesProjector();
console.log(JSON.stringify({ ok: true, case: 'world-runtime-aoi-cache-locality' }));
