import assert from 'node:assert/strict';

import {
  TERRAIN_REGEN_RATE_PER_TICK,
  calculateTerrainDurability,
} from '@mud/shared';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const MAP_LEVEL = 39;
const SPIRIT_ORE_DURABILITY_MULTIPLIER = 10_000;
const TARGET_X = 1;
const TARGET_Y = 0;

function createSpiritOreInstance(): MapInstanceRuntime {
  const template = {
    id: 'ore_recovery_smoke_map',
    name: '矿脉恢复 Smoke',
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
    instanceId: 'instance:ore-recovery-smoke',
    template,
    monsterSpawns: [],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
    displayName: '矿脉恢复 Smoke',
    linePreset: 'peaceful',
    lineIndex: 1,
    instanceOrigin: 'smoke',
    defaultEntry: true,
    supportsPvp: false,
    canDamageTile: true,
  });
}

function testOreRecoveryKeepsOriginalTiming(): void {
  const expectedMaxHp = calculateTerrainDurability(MAP_LEVEL, SPIRIT_ORE_DURABILITY_MULTIPLIER);
  const recoveryAmount = Math.max(1, Math.floor(expectedMaxHp * TERRAIN_REGEN_RATE_PER_TICK));
  const remainingDamage = 100;

  assert.equal(expectedMaxHp, 357_162_090_097);
  assert.equal(createSpiritOreInstance().getTileCombatState(TARGET_X, TARGET_Y)?.maxHp, expectedMaxHp);

  const directInstance = createSpiritOreInstance();
  const naturalRecoveryDamage = recoveryAmount + remainingDamage;
  assert.equal(
    directInstance.damageTile(TARGET_X, TARGET_Y, naturalRecoveryDamage)?.appliedDamage,
    naturalRecoveryDamage,
  );
  assert.equal(directInstance.advanceTileRecovery(() => false, null), true);
  assert.equal(directInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - remainingDamage);

  const batchInstance = createSpiritOreInstance();
  const batchResult = batchInstance.damageTilesBatch([{
    x: TARGET_X,
    y: TARGET_Y,
    damage: naturalRecoveryDamage,
  }]);
  assert.equal(batchResult.fastPathCount, 1);
  assert.equal(batchResult.results[0]?.appliedDamage, naturalRecoveryDamage);
  assert.equal(batchInstance.advanceTileRecovery(() => false, null), true);
  assert.equal(batchInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - remainingDamage);

  const stabilizedInstance = createSpiritOreInstance();
  const stabilizedDamage = recoveryAmount * 2 + remainingDamage;
  stabilizedInstance.damageTile(TARGET_X, TARGET_Y, stabilizedDamage);
  const stabilizerChecker = (x: number, y: number) => x === TARGET_X && y === TARGET_Y;
  Object.defineProperty(stabilizerChecker, 'hasTerrainStabilizer', { value: true });
  assert.equal(stabilizedInstance.advanceTileRecovery(() => false, null, stabilizerChecker), true);
  assert.equal(stabilizedInstance.getTileCombatState(TARGET_X, TARGET_Y)?.hp, expectedMaxHp - remainingDamage);
}

function main(): void {
  testOreRecoveryKeepsOriginalTiming();
  console.log(JSON.stringify({
    ok: true,
    case: 'world-runtime-ore-recovery',
    answers: '矿脉耐久继续按地图等级计算，直接与批量伤害后同次恢复推进正常结算自然恢复，固脉额外恢复一份。',
  }, null, 2));
}

main();
