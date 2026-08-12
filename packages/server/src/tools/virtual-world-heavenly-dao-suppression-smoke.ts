import assert from 'node:assert/strict';

import { ATTR_KEYS } from '@mud/shared';
import {
  PVP_SOUL_INJURY_BUFF_ID,
  PVP_SOUL_INJURY_DURATION_TICKS,
  PVP_SOUL_INJURY_MAX_STACKS,
  resolvePvPSoulInjuryMultiplier,
  resolvePvPSoulInjuryReductionPercent,
} from '../constants/gameplay/pvp';
import {
  HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
  HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEYS,
  HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS,
  HEAVENLY_DAO_SUPPRESSION_MAX_STACKS,
} from '../constants/gameplay/virtual-world';
import { buildAttrDetailBonuses, buildAttrDetailNumericStatBreakdowns } from '../network/world-gateway-attr-detail.helper';
import { PlayerAttributesService } from '../runtime/player/player-attributes.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { materializeRuntimeTemporaryBuff } from '../runtime/player/runtime-buff-instance';

function main(): void {
  testHeavenlyDaoSuppressionAppliesOnceToFinalProjection();
  testHeavenlyDaoSuppressionStackingAndPersistence();
  testPvPSoulInjuryReducesOnlySixDimensions();
  testPvPSoulInjuryStackingAndCap();
  console.log(JSON.stringify({ ok: true, case: 'virtual-world-heavenly-dao-suppression' }, null, 2));
}

function testPvPSoulInjuryReducesOnlySixDimensions(): void {
  const attributesService = new PlayerAttributesService();
  const basePlayer = createPlayer(attributesService, 0);
  const oneStackPlayer = createPlayer(attributesService, 0, 1);
  const twoStackPlayer = createPlayer(attributesService, 0, 2);
  const cappedPlayer = createPlayer(attributesService, 0, PVP_SOUL_INJURY_MAX_STACKS);
  for (const player of [basePlayer, oneStackPlayer, twoStackPlayer, cappedPlayer]) {
    attributesService.recalculate(player);
  }

  assert.equal(resolvePvPSoulInjuryReductionPercent(1), 10);
  assert.equal(resolvePvPSoulInjuryReductionPercent(2), 11);
  assert.equal(resolvePvPSoulInjuryReductionPercent(PVP_SOUL_INJURY_MAX_STACKS), 30);
  for (const key of ATTR_KEYS) {
    assert.equal(oneStackPlayer.attrs.finalAttrs[key], basePlayer.attrs.finalAttrs[key] * 0.9);
    assert.equal(twoStackPlayer.attrs.finalAttrs[key], basePlayer.attrs.finalAttrs[key] * 0.89);
    assert.equal(cappedPlayer.attrs.finalAttrs[key], basePlayer.attrs.finalAttrs[key] * 0.7);
  }
  assert.equal(oneStackPlayer.attrs.numericStats.playerExpRate, basePlayer.attrs.numericStats.playerExpRate);
  assert.equal(oneStackPlayer.attrs.numericStats.lootRate, basePlayer.attrs.numericStats.lootRate);

  const soulInjuryBonus = buildAttrDetailBonuses(twoStackPlayer)
    .find((entry) => entry.source === `buff:${PVP_SOUL_INJURY_BUFF_ID}`);
  assert.equal(soulInjuryBonus?.attrMode, 'percent');
  assert.equal(soulInjuryBonus?.attrs?.constitution, -11);
  assert.equal(soulInjuryBonus?.meta?.linearReductionPercent, true);
}

function testPvPSoulInjuryStackingAndCap(): void {
  const attributesService = new PlayerAttributesService();
  const runtimeService = new PlayerRuntimeService(
    {} as never,
    {} as never,
    attributesService,
    {} as never,
  );
  const player = createPlayer(attributesService, 0);
  player.playerId = 'player:pvp-soul-injury';
  runtimeService.players.set(player.playerId, player);

  assert.equal(runtimeService.applyPvPSoulInjury(player.playerId), 1);
  const buff = player.buffs.buffs.find((entry) => entry.buffId === PVP_SOUL_INJURY_BUFF_ID);
  assert.ok(buff);
  assert.equal(buff.maxStacks, PVP_SOUL_INJURY_MAX_STACKS);
  assert.equal(buff.remainingTicks, PVP_SOUL_INJURY_DURATION_TICKS);
  buff.remainingTicks = 17;
  assert.equal(runtimeService.applyPvPSoulInjury(player.playerId), 2);
  assert.equal(buff.remainingTicks, PVP_SOUL_INJURY_DURATION_TICKS);
  for (let index = 2; index < PVP_SOUL_INJURY_MAX_STACKS + 5; index += 1) {
    runtimeService.applyPvPSoulInjury(player.playerId);
  }
  assert.equal(buff.stacks, PVP_SOUL_INJURY_MAX_STACKS);
  assert.equal(player.dirtyDomains.has('buff'), true);
  assert.equal(player.dirtyDomains.has('attr'), true);
  assert.equal(player.dirtyDomains.has('vitals'), true);
}

function testHeavenlyDaoSuppressionAppliesOnceToFinalProjection(): void {
  const attributesService = new PlayerAttributesService();
  const basePlayer = createPlayer(attributesService, 0);
  const oneThousandStackPlayer = createPlayer(attributesService, 1_000);
  const twoThousandStackPlayer = createPlayer(attributesService, 2_000);
  attributesService.recalculate(basePlayer);
  attributesService.recalculate(oneThousandStackPlayer);
  attributesService.recalculate(twoThousandStackPlayer);

  for (const key of ATTR_KEYS) {
    assert.equal(oneThousandStackPlayer.attrs.finalAttrs[key], basePlayer.attrs.finalAttrs[key] * 0.5);
    assert.ok(Math.abs(twoThousandStackPlayer.attrs.finalAttrs[key] - basePlayer.attrs.finalAttrs[key] / 3) < 1e-9);
  }
  for (const key of HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEYS) {
    assert.equal(
      oneThousandStackPlayer.attrs.numericStats[key],
      Math.round(basePlayer.attrs.numericStats[key] * 0.5),
      `${key} 在一千层时应只衰减一次`,
    );
    assert.equal(
      twoThousandStackPlayer.attrs.numericStats[key],
      Math.round(basePlayer.attrs.numericStats[key] / 3),
      `${key} 在两千层时应只保留三分之一`,
    );
  }
  for (const element of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
    assert.equal(
      oneThousandStackPlayer.attrs.numericStats.elementDamageBonus[element],
      Math.round(basePlayer.attrs.numericStats.elementDamageBonus[element] * 0.5),
    );
    assert.equal(
      oneThousandStackPlayer.attrs.numericStats.elementDamageReduce[element],
      Math.round(basePlayer.attrs.numericStats.elementDamageReduce[element] * 0.5),
    );
  }
  for (const key of ['playerExpRate', 'techniqueExpRate', 'realmExpPerTick', 'techniqueExpPerTick', 'lootRate', 'rareLootRate', 'viewRange'] as const) {
    assert.equal(oneThousandStackPlayer.attrs.numericStats[key], basePlayer.attrs.numericStats[key], `${key} 不应受天道压制影响`);
  }

  const bonuses = buildAttrDetailBonuses(oneThousandStackPlayer);
  const suppressionBonus = bonuses.find((entry) => entry.source === `buff:${HEAVENLY_DAO_SUPPRESSION_BUFF_ID}`);
  assert.equal(suppressionBonus?.attrMode, 'percent');
  assert.equal(suppressionBonus?.attrs?.constitution, -100);
  const breakdowns = buildAttrDetailNumericStatBreakdowns(oneThousandStackPlayer) as Record<string, {
    buffMultiplierPct: number;
  }>;
  assert.equal(breakdowns.physAtk?.buffMultiplierPct, -100);
  assert.equal(breakdowns.lootRate?.buffMultiplierPct, 0);

  const combinedBuffPlayer = createPlayer(attributesService, 1_000);
  combinedBuffPlayer.buffs.buffs.push({
    buffId: 'smoke.regular_combat_buff',
    name: '常规战斗增益',
    remainingTicks: 60,
    duration: 60,
    stacks: 1,
    maxStacks: 1,
    stats: { physAtk: 20 },
    statMode: 'percent',
  });
  attributesService.recalculate(combinedBuffPlayer);
  const combinedBreakdowns = buildAttrDetailNumericStatBreakdowns(combinedBuffPlayer) as Record<string, {
    buffMultiplierPct: number;
  }>;
  assert.ok(Math.abs(combinedBreakdowns.physAtk.buffMultiplierPct - (-200 / 3)) < 1e-9);
}

function testHeavenlyDaoSuppressionStackingAndPersistence(): void {
  const attributesService = new PlayerAttributesService();
  const runtimeService = new PlayerRuntimeService(
    {} as never,
    {} as never,
    attributesService,
    {} as never,
  );
  const player = createPlayer(attributesService, 0);
  player.playerId = 'player:heavenly-dao-suppression';
  runtimeService.players.set(player.playerId, player);

  assert.equal(runtimeService.addHeavenlyDaoSuppressionStacks(player.playerId, 1), 1);
  const buff = player.buffs.buffs.find((entry) => entry.buffId === HEAVENLY_DAO_SUPPRESSION_BUFF_ID);
  assert.ok(buff);
  assert.equal(buff.remainingTicks, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS);
  assert.equal(buff.duration, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS);
  assert.equal(buff.maxStacks, HEAVENLY_DAO_SUPPRESSION_MAX_STACKS);
  assert.equal(buff.persistOnDeath, true);
  assert.equal(buff.persistOnReturnToSpawn, true);

  buff.remainingTicks = 17;
  assert.equal(runtimeService.addHeavenlyDaoSuppressionStacks(player.playerId, 3), 4);
  assert.equal(buff.remainingTicks, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS);

  const persisted = JSON.parse(JSON.stringify(materializeRuntimeTemporaryBuff(buff)));
  assert.equal(persisted.buffId, HEAVENLY_DAO_SUPPRESSION_BUFF_ID);
  assert.equal(persisted.stacks, 4);
  assert.equal(persisted.remainingTicks, HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS);
  assert.equal(persisted.persistOnDeath, true);
  assert.equal(persisted.persistOnReturnToSpawn, true);
  assert.equal(player.dirtyDomains.has('buff'), true);
  assert.equal(player.dirtyDomains.has('attr'), true);
  assert.equal(player.dirtyDomains.has('vitals'), true);

  runtimeService.respawnPlayer(player.playerId, buildRespawnInput(player));
  assert.equal(runtimeService.getBuffStacks(player.playerId, HEAVENLY_DAO_SUPPRESSION_BUFF_ID), 4);
  runtimeService.respawnPlayer(player.playerId, {
    ...buildRespawnInput(player),
    buffClearMode: 'return_to_spawn',
  });
  assert.equal(runtimeService.getBuffStacks(player.playerId, HEAVENLY_DAO_SUPPRESSION_BUFF_ID), 4);
}

function buildRespawnInput(player: any) {
  return {
    instanceId: player.instanceId,
    templateId: player.templateId,
    x: player.x,
    y: player.y,
    facing: player.facing,
    currentTick: player.lifeElapsedTicks,
  };
}

function createPlayer(
  attributesService: PlayerAttributesService,
  heavenlyDaoStacks: number,
  soulInjuryStacks = 0,
): any {
  const combatStats = Object.fromEntries(
    HEAVENLY_DAO_SUPPRESSION_COMBAT_STAT_KEYS.map((key) => [key, key === 'actionsPerTurn' ? 999 : 1_000]),
  );
  return {
    playerId: 'player:heavenly-dao-projection',
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
      source: 'runtime:heavenly-dao-smoke',
      attrs: Object.fromEntries(ATTR_KEYS.map((key) => [key, 990])),
      stats: {
        ...combatStats,
        playerExpRate: 1_000,
        techniqueExpRate: 1_000,
        realmExpPerTick: 1_000,
        techniqueExpPerTick: 1_000,
        lootRate: 1_000,
        rareLootRate: 1_000,
        viewRange: 1_000,
        elementDamageBonus: { metal: 1_000, wood: 1_000, water: 1_000, fire: 1_000, earth: 1_000 },
        elementDamageReduce: { metal: 1_000, wood: 1_000, water: 1_000, fire: 1_000, earth: 1_000 },
      },
    }],
    techniques: { techniques: [] },
    bodyTraining: { level: 0 },
    equipment: { slots: [] },
    buffs: { revision: 1, buffs: [
      ...(heavenlyDaoStacks > 0 ? [{
        buffId: HEAVENLY_DAO_SUPPRESSION_BUFF_ID,
        name: '天道压制',
        remainingTicks: HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS,
        duration: HEAVENLY_DAO_SUPPRESSION_DURATION_TICKS,
        stacks: heavenlyDaoStacks,
        maxStacks: HEAVENLY_DAO_SUPPRESSION_MAX_STACKS,
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
      }] : []),
      ...(soulInjuryStacks > 0 ? [{
        buffId: PVP_SOUL_INJURY_BUFF_ID,
        name: '神魂受损',
        remainingTicks: PVP_SOUL_INJURY_DURATION_TICKS,
        duration: PVP_SOUL_INJURY_DURATION_TICKS,
        stacks: soulInjuryStacks,
        maxStacks: PVP_SOUL_INJURY_MAX_STACKS,
        persistOnDeath: true,
        persistOnReturnToSpawn: true,
      }] : []),
    ] },
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
