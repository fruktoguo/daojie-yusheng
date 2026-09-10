import assert from 'node:assert/strict';
import {
  ATTR_KEYS,
  MINING_VEIN_CURSE_BUFF_ID,
  MINING_VEIN_CURSE_DURATION_TICKS,
  MINING_VEIN_STAGNATION_BUFF_ID,
  MINING_VEIN_STAGNATION_DURATION_TICKS,
  TileType,
  resolveMiningVeinCurseDropMultiplier,
} from '@mud/shared';
import { PlayerCombatService } from '../runtime/combat/player-combat.service';
import { WorldRuntimeBasicAttackService } from '../runtime/world/combat/world-runtime-basic-attack.service';
import { WorldRuntimeCombatActionService } from '../runtime/world/combat/world-runtime-combat-action.service';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import {
  applyMiningVeinBreakDebuffs,
  countDestroyedSpiritOreBatchEntries,
} from '../runtime/world/combat/mining-vein-debuff.helpers';
import { resolveMiningDropRollOptions } from '../runtime/world/combat/tile-drop.helpers';

type BuffView = {
  buffId: string;
  remainingTicks: number;
  duration: number;
  stacks: number;
  persistOnDeath?: boolean;
  persistOnReturnToSpawn?: boolean;
  immuneToCleanse?: boolean;
};

type SmokePlayer = {
  playerId: string;
  realm: { stage: number; realmLv: number };
  attrs: {
    numericStats: { maxQiOutputPerTick: number };
    [key: string]: unknown;
  };
  maxHp: number;
  maxQi: number;
  hp: number;
  qi: number;
  selfRevision: number;
  persistentRevision: number;
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  facing: number;
  lifeElapsedTicks: number;
  dirtyDomains: Set<string>;
  runtimeBonuses: unknown[];
  techniques: { revision: number; techniques: unknown[] };
  bodyTraining: { level: number };
  equipment: { slots: unknown[] };
  buffs: { revision: number; buffs: BuffView[] };
  combat: {
    cooldownReadyTickBySkillId: Record<string, number>;
    autoBattle: boolean;
    cultivationActive: boolean;
    lastActiveTick: number;
  };
  spiritualRoots: null;
};

function main(): void {
  testCurseDropMultiplierAndBatchCount();
  testTileOutcomeStackingOutputPersistenceAndCleanseImmunity();
  console.log(JSON.stringify({ ok: true, case: 'mining-vein-debuff' }, null, 2));
}

function testCurseDropMultiplierAndBatchCount(): void {
  const options = resolveMiningDropRollOptions({
    realm: { realmLv: 1 },
    luck: 0,
    miningSkill: { level: 0 },
    attrs: { craftEffectStats: {} },
    buffs: {
      buffs: [{
        buffId: MINING_VEIN_CURSE_BUFF_ID,
        remainingTicks: 10,
        stacks: 2,
      }],
    },
  });
  assert.equal(resolveMiningVeinCurseDropMultiplier(2), 0.81);
  assert.ok(Math.abs(options.miningOtherDropMultiplier - 0.81) <= 1e-12);
  assert.equal(countDestroyedSpiritOreBatchEntries(
    [
      { tileType: TileType.SpiritOre },
      { tileType: TileType.BlackIronOre },
      { tileType: TileType.SpiritOre },
    ],
    [{ destroyed: true }, { destroyed: true }, { destroyed: false }],
  ), 1);
}

function testTileOutcomeStackingOutputPersistenceAndCleanseImmunity(): void {
  const attributesService = new PlayerAttributesService();
  const runtimeService = new PlayerRuntimeService(
    {} as never,
    {} as never,
    attributesService,
    {} as never,
  );
  const player = createPlayer(attributesService);
  runtimeService.players.set(player.playerId, player);
  attributesService.recalculate(player);
  const baseQiOutput = player.attrs.numericStats.maxQiOutputPerTick;

  const instance = {
    meta: { canDamageTile: true },
    template: { source: { mapLv: 1 } },
    worldRevision: 1,
    getTileCombatState() {
      return { tileType: TileType.SpiritOre, hp: 1, maxHp: 1, destroyed: false };
    },
    damageTile() {
      return { destroyed: true, appliedDamage: 1, hp: 0, maxHp: 1, tileDrops: [] };
    },
  };
  const combatActionService = new WorldRuntimeCombatActionService();
  const basicAttackService = new WorldRuntimeBasicAttackService(runtimeService, combatActionService);
  basicAttackService.dispatchBasicAttackToTile(player, 1, 1, 'physical', 1, {
    playerRuntimeService: runtimeService,
    getInstanceRuntime() {
      return instance;
    },
    getInstanceRuntimeOrThrow() {
      return instance;
    },
    worldRuntimeSectService: {},
  }, 1);

  const curse = findBuff(player, MINING_VEIN_CURSE_BUFF_ID);
  const stagnation = findBuff(player, MINING_VEIN_STAGNATION_BUFF_ID);
  assert.ok(curse);
  assert.ok(stagnation);
  assert.equal(curse.stacks, 1);
  assert.equal(curse.remainingTicks, MINING_VEIN_CURSE_DURATION_TICKS);
  assert.equal(curse.persistOnDeath, true);
  assert.equal(curse.persistOnReturnToSpawn, true);
  assert.equal(curse.immuneToCleanse, true);
  assert.equal(JSON.parse(JSON.stringify(curse)).immuneToCleanse, true);
  assert.equal(stagnation.stacks, 1);
  assert.equal(stagnation.remainingTicks, MINING_VEIN_STAGNATION_DURATION_TICKS);
  assert.equal(stagnation.persistOnDeath, true);
  assert.equal(stagnation.persistOnReturnToSpawn, true);
  assert.equal(stagnation.immuneToCleanse, true);
  assert.equal(player.attrs.numericStats.maxQiOutputPerTick, Math.round(baseQiOutput * 0.9));

  curse.remainingTicks = 7;
  stagnation.remainingTicks = 7;
  applyMiningVeinBreakDebuffs(runtimeService, player.playerId, 2);
  assert.equal(curse.stacks, 3);
  assert.equal(curse.remainingTicks, MINING_VEIN_CURSE_DURATION_TICKS);
  assert.equal(stagnation.stacks, 3);
  assert.equal(stagnation.remainingTicks, MINING_VEIN_STAGNATION_DURATION_TICKS);
  assert.equal(player.attrs.numericStats.maxQiOutputPerTick, Math.round(baseQiOutput * 0.7));
  runtimeService.applyTemporaryBuff(player.playerId, {
    buffId: 'smoke.cleanseable_debuff',
    name: '可净化减益',
    desc: '用于验证普通减益会被净化。',
    shortMark: '净',
    category: 'debuff',
    visibility: 'public',
    duration: 100,
    remainingTicks: 100,
    stacks: 1,
    maxStacks: 1,
    sourceSkillId: 'smoke.cleanseable_debuff',
    sourceSkillName: '验证',
    realmLv: 1,
    persistOnDeath: false,
    persistOnReturnToSpawn: false,
  });

  const cleanseSkill = {
    id: 'skill.mining_vein_cleanse_probe',
    name: '净化探针',
    cost: 0,
    cooldown: 1,
    range: 0,
    effects: [{ type: 'cleanse', target: 'self', category: 'debuff', removeCount: 99 }],
  };
  player.techniques = {
    revision: 1,
    techniques: [{ techId: 'technique.mining_vein_cleanse_probe', level: 1, skills: [cleanseSkill] }],
  };
  const combatService = new PlayerCombatService(runtimeService);
  const cleanseResult = combatService.castSelfSkill(player, cleanseSkill.id, 1, { skipResourceAndCooldown: true });
  assert.equal(cleanseResult.selfCleanseCount, 1);
  assert.equal(cleanseResult.cleanseCount, 1);
  assert.equal(findBuff(player, 'smoke.cleanseable_debuff'), undefined);
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_CURSE_BUFF_ID), 3);
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_STAGNATION_BUFF_ID), 3);

  runtimeService.respawnPlayer(player.playerId, buildRespawnInput(player));
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_CURSE_BUFF_ID), 3);
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_STAGNATION_BUFF_ID), 3);
  runtimeService.respawnPlayer(player.playerId, {
    ...buildRespawnInput(player),
    buffClearMode: 'return_to_spawn',
  });
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_CURSE_BUFF_ID), 3);
  assert.equal(runtimeService.getBuffStacks(player.playerId, MINING_VEIN_STAGNATION_BUFF_ID), 3);
}

function findBuff(player: SmokePlayer, buffId: string): BuffView | undefined {
  return player.buffs.buffs.find((entry) => entry.buffId === buffId);
}

function buildRespawnInput(player: SmokePlayer) {
  return {
    instanceId: player.instanceId,
    templateId: player.templateId,
    x: player.x,
    y: player.y,
    facing: player.facing,
    currentTick: player.lifeElapsedTicks,
  };
}

function createPlayer(attributesService: PlayerAttributesService): SmokePlayer {
  return {
    playerId: 'player:mining-vein-debuff',
    realm: { stage: 0, realmLv: 1 },
    attrs: attributesService.createInitialState(),
    maxHp: 10,
    maxQi: 10,
    hp: 10,
    qi: 10,
    selfRevision: 1,
    persistentRevision: 1,
    instanceId: 'public:test',
    templateId: 'test',
    x: 1,
    y: 1,
    facing: 1,
    lifeElapsedTicks: 1,
    dirtyDomains: new Set<string>(),
    runtimeBonuses: [{
      source: 'runtime:mining-vein-smoke',
      attrs: Object.fromEntries(ATTR_KEYS.map((key) => [key, 10])),
      stats: { maxQiOutputPerTick: 1_000 },
    }],
    techniques: { revision: 1, techniques: [] },
    bodyTraining: { level: 0 },
    equipment: { slots: [] },
    buffs: { revision: 1, buffs: [] },
    combat: {
      cooldownReadyTickBySkillId: {},
      autoBattle: false,
      cultivationActive: false,
      lastActiveTick: 0,
    },
    spiritualRoots: null,
  };
}

main();
