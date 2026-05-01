// @ts-nocheck

import assert from 'node:assert/strict';

import {
  calculateTerrainDurability,
  getTileTraversalCost,
  TERRAIN_DESTROYED_RESTORE_TICKS,
  TERRAIN_RESTORE_RETRY_DELAY_TICKS,
  TileType,
} from '@mud/shared';

import { WorldSyncMapSnapshotService } from '../network/world-sync-map-snapshot.service';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { WorldRuntimeDetailQueryService } from '../runtime/world/world-runtime-detail-query.service';
import { buildPlayerObservation } from '../runtime/world/world-runtime.observation.helpers';
import { findPathPointsOnMap } from '../runtime/world/world-runtime.path-planning.helpers';

function createTemplate() {
  return {
    id: 'tile_smoke_map',
    name: '地块摧毁 Smoke',
    width: 3,
    height: 3,
    terrainRows: [
      '.#.',
      '...',
      '...',
    ],
    walkableMask: Uint8Array.from([
      1, 0, 1,
      1, 1, 1,
      1, 1, 1,
    ]),
    blocksSightMask: Uint8Array.from([
      0, 1, 0,
      0, 0, 0,
      0, 0, 0,
    ]),
    portalIndexByTile: Int32Array.from({ length: 9 }, () => -1),
    safeZoneMask: Uint8Array.from({ length: 9 }, () => 0),
    baseAuraByTile: Int32Array.from({ length: 9 }, () => 0),
    baseTileResourceEntries: [],
    npcs: [],
    landmarks: [],
    containers: [],
    safeZones: [],
    portals: [],
    spawnX: 0,
    spawnY: 0,
    source: {},
  };
}

function createStoneTemplate(terrainRealmLv: number) {
  return {
    ...createTemplate(),
    terrainRows: [
      '.o.',
      '...',
      '...',
    ],
    walkableMask: Uint8Array.from([
      1, 0, 1,
      1, 1, 1,
      1, 1, 1,
    ]),
    blocksSightMask: Uint8Array.from([
      0, 1, 0,
      0, 0, 0,
      0, 0, 0,
    ]),
    source: {
      terrainRealmLv,
    },
  };
}

function createCloudTemplate() {
  return {
    ...createTemplate(),
    terrainRows: [
      '.云.',
      '...',
      '...',
    ],
    source: {
      terrainProfileId: 'earth_sky_metal',
    },
  };
}

function createInstance(template = createTemplate()) {
  return new MapInstanceRuntime({
    instanceId: 'instance:tile-smoke',
    template,
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: 'Tile Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function createSnapshotService(instance: MapInstanceRuntime, tileStateFactory?: (x: number, y: number) => any) {
  return new WorldSyncMapSnapshotService(
    {
      getInstanceTileState(instanceId: string, x: number, y: number) {
        assert.equal(instanceId, 'instance:tile-smoke');
        if (tileStateFactory) {
          return tileStateFactory(x, y);
        }
        return {
          aura: 0,
          resources: [],
          combat: instance.getTileCombatState(x, y),
        };
      },
    } as any,
    {} as any,
    {} as any,
    {} as any,
    {} as any,
  );
}

function createDetailService() {
  return new WorldRuntimeDetailQueryService(
    {} as any,
    {
      has() {
        return false;
      },
      getOrThrow() {
        throw new Error('unexpected template lookup');
      },
    } as any,
    {
      getPlayer() {
        return null;
      },
    } as any,
  );
}

function createTileDetailContext(instance: MapInstanceRuntime) {
  return {
    view: {
      self: { x: 0, y: 0 },
      visibleTileIndices: [1],
      instance: { width: instance.template.width, height: instance.template.height },
      localNpcs: [],
      localMonsters: [],
      visiblePlayers: [],
      localPortals: [],
      localGroundPiles: [],
    },
    viewer: {
      playerId: 'player:tile-detail',
      attrs: {
        numericStats: { viewRange: 8 },
        finalAttrs: { spirit: 100 },
      },
    },
    location: { instanceId: 'instance:tile-smoke' },
    instance,
  };
}

function testDamagedTileShowsHpBarPayload() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance);
  const maxHp = instance.getTileCombatState(1, 0)?.maxHp ?? 0;

  assert.ok(maxHp > 0);
  instance.damageTile(1, 0, 1);

  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 0);
  assert.equal(tile?.type, TileType.Wall);
  assert.equal(tile?.hpVisible, true);
  assert.equal(tile?.maxHp, maxHp);
  assert.equal(tile?.hp, maxHp - 1);
}

function testObservedDamageableTileDetailIncludesHpAndOmitsZeroAura() {
  const template = createTemplate();
  const instance = createInstance(template);
  const detailService = createDetailService();
  const maxHp = instance.getTileCombatState(1, 0)?.maxHp ?? 0;

  assert.ok(maxHp > 2);
  instance.damageTile(1, 0, 2);

  const detail = detailService.buildTileDetail(createTileDetailContext(instance), { x: 1, y: 0 });
  assert.equal(detail.hp, maxHp - 2);
  assert.equal(detail.maxHp, maxHp);
  assert.equal(detail.aura, undefined);
  assert.equal(detail.resources, undefined);
}

function testObservationMissingNumericValuesRenderAsZero() {
  const observation = buildPlayerObservation(undefined, {
    hp: undefined,
    maxHp: undefined,
    qi: 0,
    maxQi: undefined,
    attrs: {
      finalAttrs: {},
      numericStats: {},
    },
  }, true);
  const serialized = JSON.stringify(observation);
  assert.equal(serialized.includes('NaN'), false);
  assert.equal(observation.lines.find((line) => line.label === '生命')?.value, '0 / 0');
  assert.equal(observation.lines.find((line) => line.label === '灵力')?.value, '0 / 0');
  assert.equal(observation.lines.find((line) => line.label === '暴击伤害')?.value, '200%');
  assert.equal(observation.lines.find((line) => line.label === '灵力回复')?.value, '0% / 息');
}

function testDestroyedTileTurnsIntoFloorProjection() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance);
  const destroyed = instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  assert.equal(destroyed?.destroyed, true);
  assert.equal(instance.isWalkable(1, 0), true);
  assert.equal(instance.isTileSightBlocked(1, 0), false);
  assert.equal(instance.getTileTraversalCost(1, 0), getTileTraversalCost(TileType.Floor));

  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 0);
  assert.equal(tile?.type, TileType.Floor);
  assert.equal(tile?.hp, undefined);
  assert.equal(tile?.maxHp, undefined);
  assert.equal(tile?.hpVisible, undefined);
}

function testDestroyedTileBecomesPathReachable() {
  const instance = createInstance(createTemplate());

  const pathBeforeDestroy = findPathPointsOnMap(instance, 'player:smoke', 0, 0, [{ x: 1, y: 0 }]);
  assert.equal(pathBeforeDestroy, null);

  instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  const pathAfterDestroy = findPathPointsOnMap(instance, 'player:smoke', 0, 0, [{ x: 1, y: 0 }]);
  assert.deepEqual(pathAfterDestroy, [{ x: 1, y: 0 }]);
}

function testDestroyedTileRecoveryRespectsStabilizerAndHydrates() {
  const template = createTemplate();
  const instance = createInstance(template);
  instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  const destroyedState = instance.getTileCombatState(1, 0);
  assert.equal(destroyedState?.destroyed, true);
  assert.equal(destroyedState?.respawnLeft, TERRAIN_DESTROYED_RESTORE_TICKS);
  assert.equal(instance.isPersistentDirty(), true);

  const stabilizedChanged = instance.advanceTileRecovery(() => true);
  const stabilizedState = instance.getTileCombatState(1, 0);
  assert.equal(stabilizedChanged, false);
  assert.equal(stabilizedState?.destroyed, true);
  assert.equal(stabilizedState?.respawnLeft, destroyedState?.respawnLeft);

  const recoveryChanged = instance.advanceTileRecovery(() => false);
  const recoveringState = instance.getTileCombatState(1, 0);
  assert.equal(recoveryChanged, true);
  assert.equal(recoveringState?.destroyed, true);
  assert.equal(recoveringState?.respawnLeft, (destroyedState?.respawnLeft ?? 0) - 1);

  const entries = instance.buildTileDamagePersistenceEntries();
  assert.equal(entries.length, 1);
  assert.equal(entries[0]?.destroyed, true);

  const restored = createInstance(template);
  restored.hydrateTileDamage(entries);
  assert.equal(restored.getEffectiveTileType(1, 0), TileType.Floor);
  assert.equal(restored.getTileCombatState(1, 0)?.destroyed, true);
  assert.equal(restored.getTileCombatState(1, 0)?.respawnLeft, entries[0]?.respawnLeft);

  const restoredTicksLeft = entries[0]?.respawnLeft ?? TERRAIN_DESTROYED_RESTORE_TICKS;
  for (let index = 0; index < restoredTicksLeft; index += 1) {
    restored.advanceTileRecovery(() => false);
  }
  assert.equal(restored.getEffectiveTileType(1, 0), TileType.Wall);
  assert.equal(restored.isWalkable(1, 0), false);
  assert.deepEqual(restored.buildTileDamagePersistenceEntries(), []);
}

function testDestroyedTileDoesNotRespawnUnderUnit() {
  const template = createTemplate();
  const instance = createInstance(template);
  instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);
  const player = instance.connectPlayer({
    playerId: 'player:blocking-tile',
    sessionId: 'session:blocking-tile',
    preferredX: 1,
    preferredY: 0,
  });
  assert.equal(player.x, 1);
  assert.equal(player.y, 0);

  for (let index = 0; index < TERRAIN_DESTROYED_RESTORE_TICKS; index += 1) {
    instance.advanceTileRecovery(() => false);
  }
  assert.equal(instance.getEffectiveTileType(1, 0), TileType.Floor);
  assert.equal(instance.getTileCombatState(1, 0)?.destroyed, true);
  assert.equal(instance.getTileCombatState(1, 0)?.respawnLeft, TERRAIN_RESTORE_RETRY_DELAY_TICKS);

  instance.disconnectPlayer('player:blocking-tile');
  for (let index = 0; index < TERRAIN_RESTORE_RETRY_DELAY_TICKS; index += 1) {
    instance.advanceTileRecovery(() => false);
  }
  assert.equal(instance.getEffectiveTileType(1, 0), TileType.Wall);
  assert.equal(instance.getTileCombatState(1, 0)?.destroyed, false);
}

function testSpecialTerrainRestoreSpeedMatchesMain() {
  const instance = createInstance(createCloudTemplate());
  instance.damageTile(1, 0, Number.MAX_SAFE_INTEGER);

  assert.equal(instance.getTileCombatState(1, 0)?.destroyed, true);
  assert.equal(instance.getTileCombatState(1, 0)?.respawnLeft, Math.ceil(TERRAIN_DESTROYED_RESTORE_TICKS / 100));

  const player = instance.connectPlayer({
    playerId: 'player:blocking-cloud',
    sessionId: 'session:blocking-cloud',
    preferredX: 1,
    preferredY: 0,
  });
  assert.equal(player.x, 1);
  assert.equal(player.y, 0);

  for (let index = 0; index < Math.ceil(TERRAIN_DESTROYED_RESTORE_TICKS / 100); index += 1) {
    instance.advanceTileRecovery(() => false);
  }

  assert.equal(instance.getTileCombatState(1, 0)?.destroyed, true);
  assert.equal(instance.getTileCombatState(1, 0)?.respawnLeft, Math.ceil(TERRAIN_RESTORE_RETRY_DELAY_TICKS / 100));
}

function testStoneDurabilityScalesWithTerrainRealmLv() {
  const lowRealmInstance = createInstance(createStoneTemplate(1));
  const highRealmInstance = createInstance(createStoneTemplate(10));

  const lowRealmHp = lowRealmInstance.getTileCombatState(1, 0)?.maxHp ?? 0;
  const highRealmHp = highRealmInstance.getTileCombatState(1, 0)?.maxHp ?? 0;

  assert.equal(lowRealmHp, calculateTerrainDurability(1, 50));
  assert.equal(highRealmHp, calculateTerrainDurability(10, 50));
  assert.ok(highRealmHp > lowRealmHp);
}

function createXueshaLevelNinePlayer() {
  const layerProjection = [{
    selector: { families: ['aura'], elements: ['neutral'] },
    visibility: 'absorbable',
    efficiencyBpMultiplier: 9000,
  }, {
    selector: { families: ['sha'], elements: ['neutral'] },
    visibility: 'absorbable',
    efficiencyBpMultiplier: 12000,
  }];
  return {
    combat: { senseQiActive: true },
    techniques: {
      techniques: [{
        techId: 'xuesha_huanling_jue',
        name: '血煞唤灵决',
        level: 9,
        exp: 0,
        expToNext: 0,
        realmLv: 42,
        realm: 0,
        grade: 'heaven',
        category: 'secret',
        skills: [],
        layers: Array.from({ length: 9 }, (_, index) => ({
          level: index + 1,
          expToNext: 0,
          qiProjection: layerProjection,
        })),
      }],
    },
    buffs: { buffs: [] },
    attrBonuses: [],
    runtimeBonuses: [],
  };
}

function createAllQiAbsorptionPlayer() {
  return {
    combat: { senseQiActive: true },
    techniques: { techniques: [] },
    buffs: { buffs: [] },
    attrBonuses: [{
      source: 'test:five-element-qi',
      label: '五行气机测试',
      qiProjection: [{
        selector: { resourceKeys: ['aura.refined.wood'] },
        visibility: 'absorbable',
        efficiencyBpMultiplier: 20000,
      }, {
        selector: { resourceKeys: ['sha.refined.neutral'] },
        visibility: 'absorbable',
        efficiencyBpMultiplier: 28000,
      }],
    }],
    runtimeBonuses: [],
  };
}

function testProjectedAuraLevelUsesEffectiveResourceValue() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance, () => ({
    aura: 2250,
    resources: [{
      resourceKey: 'aura.refined.neutral',
      value: 2250,
    }],
    combat: undefined,
  }));
  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 1, createXueshaLevelNinePlayer());

  assert.equal(tile?.resources?.[0]?.value, 2250);
  assert.equal(tile?.resources?.[0]?.effectiveValue, 225);
  assert.equal(tile?.resources?.[0]?.level, 0);
  assert.equal(tile?.aura, undefined);
}

function testProjectedTotalQiLevelUsesNeutralElementalAndShaResources() {
  const template = createTemplate();
  const instance = createInstance(template);
  const snapshotService = createSnapshotService(instance, () => ({
    aura: 0,
    resources: [
      { resourceKey: 'aura.refined.neutral', value: 1000 },
      { resourceKey: 'aura.refined.wood', value: 1000 },
      { resourceKey: 'sha.refined.neutral', value: 1000 },
    ],
    combat: undefined,
  }));
  const tile = snapshotService.buildTileSyncState(template, 'instance:tile-smoke', 1, 1, createAllQiAbsorptionPlayer());

  assert.equal(tile?.resources?.[0]?.label, '灵气');
  assert.equal(tile?.resources?.[0]?.effectiveValue, 1000);
  assert.equal(tile?.resources?.[0]?.level, 1);
  assert.equal(tile?.resources?.[1]?.label, '木灵气');
  assert.equal(tile?.resources?.[1]?.effectiveValue, 1000);
  assert.equal(tile?.resources?.[1]?.level, 1);
  assert.equal(tile?.resources?.[2]?.label, '煞气');
  assert.equal(tile?.resources?.[2]?.effectiveValue, 1800);
  assert.equal(tile?.resources?.[2]?.level, 2);
  assert.equal(tile?.aura, 4);
}

function testPlainTickDoesNotDirtyPersistence() {
  const instance = createInstance();

  assert.equal(instance.isPersistentDirty(), false);
  instance.tickOnce();

  assert.equal(instance.tick, 1);
  assert.equal(instance.isPersistentDirty(), false);
}

testDamagedTileShowsHpBarPayload();
testObservedDamageableTileDetailIncludesHpAndOmitsZeroAura();
testObservationMissingNumericValuesRenderAsZero();
testDestroyedTileTurnsIntoFloorProjection();
testDestroyedTileBecomesPathReachable();
testDestroyedTileRecoveryRespectsStabilizerAndHydrates();
testDestroyedTileDoesNotRespawnUnderUnit();
testSpecialTerrainRestoreSpeedMatchesMain();
testStoneDurabilityScalesWithTerrainRealmLv();
testProjectedAuraLevelUsesEffectiveResourceValue();
testProjectedTotalQiLevelUsesNeutralElementalAndShaResources();
testPlainTickDoesNotDirtyPersistence();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-damageable-tile' }, null, 2));
