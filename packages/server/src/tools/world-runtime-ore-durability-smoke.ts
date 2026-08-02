import assert from 'node:assert/strict';

import {
  TERRAIN_REGEN_RATE_PER_TICK,
  TileType,
  calculateTerrainDurability,
} from '@mud/shared';
import { MiningStrategy } from '../runtime/craft/pipeline/strategies/mining.strategy';
import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import type { PipelineContext } from '../runtime/craft/pipeline/technique-activity-strategy';
import { buildTechniqueActivityTaskListView } from '../runtime/craft/technique-activity-task-view.helpers';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const MAP_LEVEL = 39;
const SPIRIT_ORE_LEVEL = 20;
const SPIRIT_ORE_DURABILITY_MULTIPLIER = 10_000;
const TARGET_X = 1;
const TARGET_Y = 0;

type MiningSmokePlayer = {
  playerId: string;
  sessionId: null;
  instanceId: string;
  x: number;
  y: number;
  attrs: { numericStats: { physAtk: number } };
  realm: { realmLv: number };
  miningSkill: { level: number; exp: number; expToNext: number };
  equipment: { slots: unknown[] };
  miningJob?: unknown;
  dirtyDomains: Set<string>;
  persistentRevision: number;
};

function createSpiritOreInstance(): MapInstanceRuntime {
  const template = {
    id: 'ore_durability_smoke_map',
    name: '矿脉耐久 Smoke',
    width: 3,
    height: 3,
    terrainRows: ['.L.', '...', '...'],
    walkableMask: Uint8Array.from([1, 0, 1, 1, 1, 1, 1, 1, 1]),
    blocksSightMask: Uint8Array.from([0, 1, 0, 0, 0, 0, 0, 0, 0]),
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
    source: { mapLv: MAP_LEVEL },
  };
  return new MapInstanceRuntime({
    instanceId: 'instance:ore-durability-smoke',
    template,
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '矿脉耐久 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function createPlayer(): MiningSmokePlayer {
  return {
    playerId: 'player:ore-durability-smoke',
    sessionId: null,
    instanceId: 'instance:ore-durability-smoke',
    x: 0,
    y: 0,
    attrs: { numericStats: { physAtk: 4_400_000 } },
    realm: { realmLv: MAP_LEVEL },
    miningSkill: { level: SPIRIT_ORE_LEVEL, exp: 0, expToNext: 10_000 },
    equipment: { slots: [] },
    dirtyDomains: new Set<string>(),
    persistentRevision: 0,
  };
}

function createMiningContext(instance: MapInstanceRuntime): PipelineContext {
  const playerRuntimeService = {
    markPersistenceDirtyDomains(player: MiningSmokePlayer, domains: string[]) {
      for (const domain of domains) {
        player.dirtyDomains.add(domain);
      }
    },
    bumpPersistentRevision(player: MiningSmokePlayer) {
      player.persistentRevision += 1;
    },
  };
  return {
    contentTemplateRepository: {
      getItemName(itemId: string) {
        return itemId;
      },
      normalizeItem<T>(item: T): T {
        return item;
      },
    },
    resolveExpToNextByLevel() {
      return 10_000;
    },
    getInstanceRuntime(instanceId: string) {
      assert.equal(instanceId, 'instance:ore-durability-smoke');
      return instance;
    },
    deps: {
      getInstanceRuntime(instanceId: string) {
        assert.equal(instanceId, 'instance:ore-durability-smoke');
        return instance;
      },
      getPlayerLocation(playerId: string) {
        assert.equal(playerId, 'player:ore-durability-smoke');
        return { instanceId: 'instance:ore-durability-smoke', x: 0, y: 0 };
      },
      hasPendingCommand() {
        return false;
      },
      enqueuePendingCommand() {},
      playerRuntimeService,
    },
  } as unknown as PipelineContext;
}

function testFormulaAndRecovery(): void {
  const expectedMaxHp = calculateTerrainDurability(SPIRIT_ORE_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const legacyMapLevelMaxHp = calculateTerrainDurability(MAP_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const recoveryAmount = Math.max(1, Math.floor(expectedMaxHp * TERRAIN_REGEN_RATE_PER_TICK));

  assert.equal(legacyMapLevelMaxHp, 357_162_090_097);
  assert.equal(expectedMaxHp, 597_630_396);
  assert.equal(createSpiritOreInstance().getTileCombatState(TARGET_X, TARGET_Y)?.maxHp, expectedMaxHp);

  const directInstance = createSpiritOreInstance();
  const naturalRecoveryDamage = recoveryAmount + 100;
  const directResult = directInstance.damageTile(TARGET_X, TARGET_Y, naturalRecoveryDamage);
  assert.equal(directResult?.appliedDamage, naturalRecoveryDamage);
  assert.equal(directInstance.advanceTileRecovery(() => false, null), true);
  assert.equal(directInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - 100);

  const batchInstance = createSpiritOreInstance();
  const batchResult = batchInstance.damageTilesBatch([{
    x: TARGET_X,
    y: TARGET_Y,
    damage: naturalRecoveryDamage,
  }]);
  assert.equal(batchResult.fastPathCount, 1);
  assert.equal(batchResult.results[0]?.appliedDamage, naturalRecoveryDamage);
  assert.equal(batchInstance.advanceTileRecovery(() => false, null), true);
  assert.equal(batchInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - 100);

  const stabilizedInstance = createSpiritOreInstance();
  const stabilizedDamage = recoveryAmount * 2 + 100;
  stabilizedInstance.damageTile(TARGET_X, TARGET_Y, stabilizedDamage);
  const stabilizerChecker = (x: number, y: number) => x === TARGET_X && y === TARGET_Y;
  Object.defineProperty(stabilizerChecker, 'hasTerrainStabilizer', { value: true });
  assert.equal(stabilizedInstance.advanceTileRecovery(() => false, null, stabilizerChecker), true);
  assert.equal(stabilizedInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - 100);
}

function testLegacyHydration(): void {
  const legacyMaxHp = calculateTerrainDurability(MAP_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const legacyHp = Math.floor(legacyMaxHp * 0.75);
  const expectedMaxHp = calculateTerrainDurability(SPIRIT_ORE_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const expectedHp = Math.round(expectedMaxHp * (legacyHp / legacyMaxHp));
  const instance = createSpiritOreInstance();

  instance.hydrateTileDamage([{
    tileIndex: 1,
    hp: legacyHp,
    maxHp: legacyMaxHp,
    destroyed: false,
    respawnLeft: 0,
    modifiedAt: 1,
  }]);
  const restored = instance.getTileCombatState(TARGET_X, TARGET_Y);
  assert.equal(restored?.maxHp, expectedMaxHp);
  assert.equal(restored?.hp, expectedHp);
  assert.ok(Math.abs(
    (restored?.hp ?? 0) / (restored?.maxHp ?? 1) - legacyHp / legacyMaxHp,
  ) <= 1 / expectedMaxHp);

  const destroyedInstance = createSpiritOreInstance();
  destroyedInstance.hydrateTileDamage([{
    tileIndex: 1,
    hp: 0,
    maxHp: legacyMaxHp,
    destroyed: true,
    respawnLeft: 10,
    modifiedAt: 2,
  }]);
  assert.equal(destroyedInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, 0);
  assert.equal(destroyedInstance.getTileCombatState(TARGET_X, TARGET_Y)?.maxHp, expectedMaxHp);
}

function testMiningJobUsesResolvedDurability(): void {
  const expectedMaxHp = calculateTerrainDurability(SPIRIT_ORE_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const instance = createSpiritOreInstance();
  const player = createPlayer();
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new MiningStrategy());

  const result = pipeline.startLifecycle(
    player,
    'mining',
    { targetX: TARGET_X, targetY: TARGET_Y },
    createMiningContext(instance),
  );
  assert.equal(result.ok, true);
  assert.equal(result.started, true);
  const task = buildTechniqueActivityTaskListView(player).tasks.find((entry) => entry.kind === 'mining');
  assert.equal(task?.targetLabel, '灵石矿');
  assert.equal(task?.workTotalTicks, expectedMaxHp);
  assert.equal(task?.workRemainingTicks, expectedMaxHp);
}

function main(): void {
  testFormulaAndRecovery();
  testLegacyHydration();
  testMiningJobUsesResolvedDurability();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-ore-durability',
    answers: '矿脉按固有等级计算耐久，旧耐久按比例回读，直接与批量伤害后正常结算自然/固脉恢复，采矿 job 使用同一权威耐久。',
  }, null, 2));
}

main();
