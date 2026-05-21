// @ts-nocheck

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { ContentTemplateRepository } from '../content/content-template.repository';
import { MapInstanceRuntime } from '../runtime/instance/map-instance.runtime';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { buildMonsterObservation } from '../runtime/world/query/world-runtime.observation.helpers';
import {
  Direction,
  formatDisplayCurrentMax,
  formatDisplayInteger,
  MONSTER_MAIN_COMBAT_STAT_KEYS,
  MONSTER_GLOBAL_STAT_PERCENTS,
  resolveMonsterMainCombatStatLevelModifierPercent,
  resolveMonsterNumericStatsFromTendency,
  resolveMonsterTemplateRecord,
} from '@mud/shared';

const verdantMapIds = [
  'verdant_vine_vale_01_entry',
  'verdant_vine_vale_02_slope',
  'verdant_vine_vale_03_bridge',
  'verdant_vine_vale_04_garden',
  'verdant_vine_vale_05_inner_hollow',
  'verdant_vine_vale_06_heart_gate',
];

const expectedMainlineMonsterCounts: Record<string, number> = {
  verdant_vine_vale_01_entry: 18,
  verdant_vine_vale_02_slope: 18,
  verdant_vine_vale_03_bridge: 18,
  verdant_vine_vale_04_garden: 13,
  verdant_vine_vale_05_inner_hollow: 3,
  verdant_vine_vale_06_heart_gate: 3,
};

function assertRuntimeMonsters(repository: ContentTemplateRepository, mapId: string) {
  const monsters = repository.createRuntimeMonstersForMap(mapId);
  assert.ok(monsters.length > 0, `${mapId} should create runtime monsters from map monsterSpawns`);
  assert.ok(monsters.every((monster) => monster.runtimeId.startsWith(`monster:${mapId}:`)), `${mapId} runtime monster ids should include map id`);
  assert.ok(monsters.some((monster) => monster.monsterId.startsWith('m_verdant_')), `${mapId} should use verdant monster templates`);
  assert.equal(new Set(monsters.map((monster) => monster.runtimeId)).size, monsters.length, `${mapId} runtime monster ids should be unique`);
  return monsters.length;
}

function main() {
  const repository = new ContentTemplateRepository();
  repository.loadAll();
  const mapTemplateRepository = new MapTemplateRepository();
  mapTemplateRepository.loadAll();

  const counts: Record<string, number> = {};
  for (const mapId of verdantMapIds) {
    counts[mapId] = assertRuntimeMonsters(repository, mapId);
    assert.equal(
      counts[mapId],
      expectedMainlineMonsterCounts[mapId],
      `${mapId} should follow main spawn population semantics`,
    );
  }

  const rootMapMonsters = repository.createRuntimeMonstersForMap('cleft_blade_plain');
  assert.equal(rootMapMonsters.length, 37, 'root map fallback should follow main spawn population semantics');

  const yunlaiMonsters = repository.createRuntimeMonstersForMap('yunlai_town');
  assert.equal(yunlaiMonsters.length, 24, 'ordinary yunlai spawns should use main maxAlive population');
  assert.equal(
    yunlaiMonsters.find((monster) => monster.monsterId === 'm_town_rat_south')?.respawnTicks,
    10,
    'map monster spawn without respawnTicks override should use current template respawnSec',
  );
  assert.equal(
    yunlaiMonsters.find((monster) => monster.monsterId === 'm_gate_thug')?.respawnTicks,
    10,
    'ordinary map monster spawn without respawnTicks override should use current template respawnSec',
  );
  assertRuntimeMonsterStatsMatchGenerated(repository, mapTemplateRepository);
  assertOrdinaryMonsterSpawnAcceleration(repository, mapTemplateRepository);
  assertHuanlingZhenrenInitialWoundedBuff(repository, mapTemplateRepository);
  assertHuanlingZhenrenSkillOrderAndCastConfig();
  assertHuanlingZhenrenRuntimeSkillSelection(repository, mapTemplateRepository);

  console.log(JSON.stringify({
    ok: true,
    case: 'content-monster-spawn',
    verdantMapCounts: counts,
    rootMapCount: rootMapMonsters.length,
    yunlaiMapCount: yunlaiMonsters.length,
  }, null, 2));
}

function assertRuntimeMonsterStatsMatchGenerated(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const generatedPath = path.resolve(process.cwd(), 'packages/server/data/generated/monster-runtime-stats.json');
  const generated = JSON.parse(fs.readFileSync(generatedPath, 'utf-8'));
  const expected = generated.records?.m_town_rat_south;
  assert.ok(expected, 'generated monster stats should include m_town_rat_south');
  const template = repository.monsterRuntimeTemplates.get('m_town_rat_south');
  assert.ok(template, 'runtime monster template should include m_town_rat_south');
  assert.deepEqual(
    template.attrs,
    expected.attrs,
    'runtime monster attrs should use the same tendency formula as generated monster stats',
  );
  for (const key of ['maxHp', 'maxQi', 'physAtk', 'spellAtk', 'dodge', 'antiCrit', 'hpRegenRate', 'moveSpeed']) {
    assert.equal(
      template.numericStats[key],
      expected.numericStats[key],
      `runtime monster ${key} should match generated monster stats`,
    );
  }

  const monsterContentPath = path.resolve(__dirname, '../../data/content/monsters/云来镇.json');
  const baselinesPath = path.resolve(__dirname, '../../data/content/realm-attr-baselines.json');
  const rawMonster = JSON.parse(fs.readFileSync(monsterContentPath, 'utf-8'))
    .find((entry) => entry.id === 'm_town_rat_south');
  const baselines = JSON.parse(fs.readFileSync(baselinesPath, 'utf-8'));
  const unscaledStats = resolveMonsterNumericStatsFromTendency({
    attrs: template.attrs,
    statTendency: rawMonster.statTendency,
    level: rawMonster.level,
    grade: rawMonster.grade,
    tier: rawMonster.tier,
    baselines,
  });
  const mainCombatLevelModifier = resolveMonsterMainCombatStatLevelModifierPercent(rawMonster.level);
  assert.equal(mainCombatLevelModifier, 0, 'level 1 monster should not get main combat stat level modifier');
  assert.equal(template.numericStats.hpRegenRate, Math.round(unscaledStats.hpRegenRate * (MONSTER_GLOBAL_STAT_PERCENTS.hpRegenRate ?? 100) / 100), 'monster hp regen should use the global monster multiplier');
  assert.equal(template.numericStats.dodge, Math.round(unscaledStats.dodge * (MONSTER_GLOBAL_STAT_PERCENTS.dodge ?? 100) / 100), 'monster dodge should use the global monster multiplier');
  assert.equal(template.numericStats.antiCrit, Math.round(unscaledStats.antiCrit * (MONSTER_GLOBAL_STAT_PERCENTS.antiCrit ?? 100) / 100), 'monster antiCrit should use the global monster multiplier');
  assert.equal(template.numericStats.resolvePower, unscaledStats.resolvePower, 'monster resolvePower should not use the global defensive multiplier');
  assert.equal(Math.round(resolveMonsterMainCombatStatLevelModifierPercent(18)), 20, 'level 18 monster main combat stat modifier should reach 20%');
  assert.equal(Math.round(resolveMonsterMainCombatStatLevelModifierPercent(30)), 100, 'level 30 monster main combat stat modifier should reach 100%');
  assert.equal(resolveMonsterMainCombatStatLevelModifierPercent(31), 105, 'post level 30 monster main combat stat modifier should add 5% per level');
  assert.equal(resolveMonsterMainCombatStatLevelModifierPercent(42), 200, 'each 12 levels after 30 should add an extra 40% on top of level growth');
  const dynamicLevel2 = resolveMonsterTemplateRecord({ ...rawMonster, level: 2 }, undefined, baselines);
  const dynamicMapId = 'smoke_dynamic_monster_level';
  repository.monsterRuntimeStatesByMapId.set(dynamicMapId, [{
    runtimeId: `monster:${dynamicMapId}:m_town_rat_south:0`,
    x: 10,
    y: 10,
    hp: 999999,
    alive: true,
    respawnLeft: 0,
    respawnTicks: 10,
    facing: Direction.South,
    level: 2,
  }]);
  const dynamicSpawn = repository.createRuntimeMonstersForMap(dynamicMapId)[0];
  assert.ok(dynamicSpawn, 'runtime monster spawn should support dynamic level state');
  assert.equal(dynamicSpawn.level, 2, 'dynamic monster spawn should use state level override');
  assert.deepEqual(dynamicSpawn.baseAttrs, dynamicLevel2.resolvedAttrs, 'dynamic level spawn attrs should be recalculated from tendency formula');
  assert.equal(dynamicSpawn.baseNumericStats.maxHp, dynamicLevel2.computedStats.maxHp, 'dynamic level spawn maxHp should be recalculated from tendency formula');
  assert.equal(dynamicSpawn.baseNumericStats.physAtk, dynamicLevel2.computedStats.physAtk, 'dynamic level spawn physAtk should be recalculated from tendency formula');

  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:dynamic_monster_level',
    template: mapTemplateRepository.getOrThrow('yunlai_town'),
    monsterSpawns: [dynamicSpawn],
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const dynamicLevel3 = resolveMonsterTemplateRecord({ ...rawMonster, level: 3 }, undefined, baselines);
  instance.hydrateMonsterRuntimeStates([{
    runtimeId: dynamicSpawn.runtimeId,
    monsterId: dynamicSpawn.monsterId,
    monsterName: dynamicSpawn.name,
    monsterTier: dynamicSpawn.tier,
    monsterLevel: 3,
    x: dynamicSpawn.x,
    y: dynamicSpawn.y,
    hp: dynamicSpawn.maxHp,
    maxHp: dynamicSpawn.maxHp,
    alive: true,
    respawnLeft: 0,
    respawnTicks: dynamicSpawn.respawnTicks,
    statePayload: {},
  }]);
  const hydrated = instance.listMonsters().find((entry) => entry.runtimeId === dynamicSpawn.runtimeId);
  assert.ok(hydrated, 'hydrated dynamic monster should stay in runtime instance');
  assert.equal(hydrated.level, 3, 'hydrated dynamic monster should accept persisted level override');
  assert.deepEqual(hydrated.baseAttrs, dynamicLevel3.resolvedAttrs, 'hydrated dynamic monster attrs should be recalculated from tendency formula');
  assert.equal(hydrated.baseNumericStats.maxHp, dynamicLevel3.computedStats.maxHp, 'hydrated dynamic monster maxHp should be recalculated from tendency formula');
}

function assertOrdinaryMonsterSpawnAcceleration(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:yunlai_town',
    template: mapTemplateRepository.getOrThrow('yunlai_town'),
    monsterSpawns: repository.createRuntimeMonstersForMap('yunlai_town'),
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const group = instance.listMonsters()
    .filter((monster) => monster.monsterId === 'm_town_rat_south')
    .sort((left, right) => left.runtimeId.localeCompare(right.runtimeId, 'zh-CN'));
  assert.equal(group.length, 6, 'ordinary spawn group should use main maxAlive population');
  assert.ok(group.every((monster) => monster.alive), 'ordinary spawn group should start alive when tiles are available');
  for (const monster of group) {
    const result = instance.applyDamageToMonster(monster.runtimeId, monster.hp, undefined);
    assert.equal(result?.defeated, true, `${monster.runtimeId} should be defeated`);
  }
  const defeatedGroup = instance.listMonsters().filter((monster) => monster.monsterId === 'm_town_rat_south');
  assert.ok(defeatedGroup.every((monster) => monster.alive === false), 'ordinary spawn group should be fully defeated');
  assert.ok(
    defeatedGroup.every((monster) => monster.respawnLeft === 5),
    'first timely ordinary clear should accelerate 10 tick respawn to 5 ticks',
  );
}

function assertHuanlingZhenrenInitialWoundedBuff(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const spawns = repository.createRuntimeMonstersForMap('ruined_cavern_manor');
  const spawn = spawns.find((monster) => monster.monsterId === 'm_huanling_zhenren');
  assert.ok(spawn, 'ruined_cavern_manor should spawn 重伤的唤灵真人');
  const currentMonsterContentPath = path.resolve(__dirname, '../../data/content/monsters/破败洞府.json');
  const currentHuanling = JSON.parse(fs.readFileSync(currentMonsterContentPath, 'utf-8'))
    .find((entry) => entry.id === 'm_huanling_zhenren');
  const attrTendency = currentHuanling?.attrTendency ?? {};
  const constitutionTendency = Math.max(1, Math.round(Number(attrTendency.constitution) || 100));
  assert.equal(spawn.baseAttrs.spirit, Math.round(spawn.baseAttrs.constitution * Math.round(Number(attrTendency.spirit) || 100) / constitutionTendency), '重伤的唤灵真人 神识倾向 should resolve from current attrTendency');
  assert.equal(spawn.baseAttrs.strength, Math.round(spawn.baseAttrs.constitution * Math.round(Number(attrTendency.strength) || 100) / constitutionTendency), '重伤的唤灵真人 力道倾向 should resolve from current attrTendency');
  assert.equal(spawn.baseAttrs.perception, Math.round(spawn.baseAttrs.constitution * Math.round(Number(attrTendency.perception) || 100) / constitutionTendency), '重伤的唤灵真人 身法倾向 should resolve from current attrTendency');
  assert.equal(spawn.baseAttrs.talent, Math.round(spawn.baseAttrs.constitution * Math.round(Number(attrTendency.talent) || 100) / constitutionTendency), '重伤的唤灵真人 根骨倾向 should resolve from current attrTendency');
  assert.equal(spawn.baseAttrs.meridians, Math.round(spawn.baseAttrs.constitution * Math.round(Number(attrTendency.meridians) || 100) / constitutionTendency), '重伤的唤灵真人 经脉倾向 should resolve from current attrTendency');
  assert.ok(
    spawn.initialBuffs?.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    '重伤的唤灵真人 runtime spawn should keep configured initial wounded debuff',
  );
  assert.ok(spawn.baseNumericStats.antiCrit > 0, '重伤的唤灵真人 template should resolve nonzero monster antiCrit');
  assert.ok(spawn.baseNumericStats.maxQi > 0, '重伤的唤灵真人 template should resolve nonzero monster maxQi');

  const instance = new MapInstanceRuntime({
    instanceId: 'smoke:ruined_cavern_manor',
    template: mapTemplateRepository.getOrThrow('ruined_cavern_manor'),
    monsterSpawns: spawns,
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const monster = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(monster, '重伤的唤灵真人 should exist in runtime instance');
  assert.ok(
    monster.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded' && buff.category === 'debuff'),
    '重伤的唤灵真人 should start with visible wounded debuff',
  );
  const woundedBuff = monster.buffs.find((buff) => buff.buffId === 'buff.huanling_zhenren_wounded');
  assert.equal(woundedBuff?.statMode, 'percent', 'wounded debuff should use percent stat mode');
  for (const key of MONSTER_MAIN_COMBAT_STAT_KEYS) {
    assert.equal(woundedBuff?.stats?.[key], -4444, `wounded debuff should reduce ${key} by 4444% through main combat stat shortcut`);
  }
  assert.equal(woundedBuff?.stats?.critDamage, undefined, 'wounded debuff should not reduce non-main critDamage through shortcut');
  assert.equal(woundedBuff?.stats?.hpRegenRate, undefined, 'wounded debuff should not reduce non-main hpRegenRate through shortcut');
  assert.equal(monster.baseNumericStats.antiCrit, spawn.baseNumericStats.antiCrit, 'monster base antiCrit should survive runtime clone');
  assert.ok(monster.numericStats.antiCrit < spawn.baseNumericStats.antiCrit, 'wounded debuff should suppress monster antiCrit');
  assert.ok(monster.maxQi > 0, 'monster runtime should keep nonzero maxQi');
  assert.equal(monster.qi, monster.maxQi, 'monster runtime should start with full qi');
  const observation = buildMonsterObservation(Number.MAX_SAFE_INTEGER, monster);
  assert.ok(
    observation.lines.some((line) => line.label === '灵力' && line.value === formatDisplayCurrentMax(monster.qi, monster.maxQi)),
    'monster observation should expose current/max qi',
  );
  assert.ok(
    observation.lines.some((line) => line.label === '免爆' && line.value === formatDisplayInteger(monster.numericStats.antiCrit)),
    'monster observation should expose resolved antiCrit',
  );
  assert.ok(monster.maxHp < spawn.maxHp, 'wounded debuff should suppress monster maxHp through percent stat mode');

  instance.tickOnce();
  const afterTick = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(
    afterTick?.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    'infinite wounded debuff should survive monster buff tick',
  );

  const defeated = instance.applyDamageToMonster(afterTick.runtimeId, afterTick.hp, undefined);
  assert.equal(defeated?.defeated, true, '重伤的唤灵真人 should be defeated for respawn regression');
  for (let i = 0; i < spawn.respawnTicks; i += 1) {
    instance.tickOnce();
  }
  const respawned = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(respawned?.alive, '重伤的唤灵真人 should respawn after configured respawn ticks');
  assert.ok(
    respawned.buffs.some((buff) => buff.buffId === 'buff.huanling_zhenren_wounded'),
    'respawned 重伤的唤灵真人 should rebuild initial wounded debuff',
  );
  assert.equal(respawned.qi, respawned.maxQi, 'respawned 重伤的唤灵真人 should recover full qi');
}

function assertHuanlingZhenrenSkillOrderAndCastConfig() {
  const currentMonsterContentPath = path.resolve(__dirname, '../../data/content/monsters/破败洞府.json');
  const referenceMonsterContentPath = path.resolve(__dirname, '../../../../参考/main-packages-ref/packages/server/data/content/monsters/破败洞府.json');
  const currentTechniquePath = path.resolve(__dirname, '../../data/content/techniques/凡人期/术法/地阶.json');
  const referenceTechniquePath = path.resolve(__dirname, '../../../../参考/main-packages-ref/packages/server/data/content/techniques/凡人期/术法/地阶.json');

  const currentHuanling = JSON.parse(fs.readFileSync(currentMonsterContentPath, 'utf-8'))
    .find((entry) => entry.id === 'm_huanling_zhenren');
  const referenceHuanling = JSON.parse(fs.readFileSync(referenceMonsterContentPath, 'utf-8'))
    .find((entry) => entry.id === 'm_huanling_zhenren');
  assert.ok(currentHuanling, 'current content should include 重伤的唤灵真人');
  assert.ok(referenceHuanling, 'reference main should include 重伤的唤灵真人');
  assert.deepEqual(
    currentHuanling.skills,
    referenceHuanling.skills,
    '重伤的唤灵真人 skill order should stay aligned with reference main',
  );
  assert.equal(
    currentHuanling.skills[currentHuanling.skills.length - 1],
    'skill.huanling_canpo_zhang',
    '残魄掌 should remain the final fallback skill in 重伤的唤灵真人 skill order',
  );

  const currentSkills = flattenTechniqueSkills(JSON.parse(fs.readFileSync(currentTechniquePath, 'utf-8')));
  const referenceSkills = flattenTechniqueSkills(JSON.parse(fs.readFileSync(referenceTechniquePath, 'utf-8')));
  for (const skillId of currentHuanling.skills) {
    const currentSkill = currentSkills.get(skillId);
    assert.ok(currentSkill, `${skillId} should resolve from current 地阶 technique content`);
    if (currentSkill.requiresTarget !== false) {
      assert.ok(
        Number(currentSkill.monsterCast?.windupTicks) > 0,
        `${skillId} targeted monster skill should keep a positive windupTicks`,
      );
    }
  }

  const currentCanpo = currentSkills.get('skill.huanling_canpo_zhang');
  const referenceCanpo = referenceSkills.get('skill.huanling_canpo_zhang');
  assert.ok(currentCanpo, 'current content should include 残魄掌');
  assert.ok(referenceCanpo, 'reference main should include 残魄掌');
  assert.equal(currentCanpo.name, '残魄掌', '残魄掌 display name should stay stable');
  assert.equal(currentCanpo.cooldown, 0, '残魄掌 should remain a zero-cooldown fallback');
  assert.equal(currentCanpo.range, 5, '残魄掌 should keep reference range 5');
  assert.deepEqual(currentCanpo.targeting, referenceCanpo.targeting, '残魄掌 targeting should stay aligned with reference main');
  assert.deepEqual(currentCanpo.monsterCast, referenceCanpo.monsterCast, '残魄掌 monsterCast warning config should stay aligned with reference main');
}

function assertHuanlingZhenrenRuntimeSkillSelection(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const defaultFixture = createHuanlingCombatFixture(repository, mapTemplateRepository);
  const defaultAction = firstMonsterAction(defaultFixture.instance);
  assert.equal(
    defaultAction?.skillId,
    'skill.huanling_duanhun_ding',
    '重伤的唤灵真人 should not default to 残魄掌 when 断魂灵钉 is castable',
  );
  assert.equal(defaultAction?.kind, 'skill_chant', '断魂灵钉 should be emitted as a chant action');
  assert.equal(defaultAction?.durationMs, 1000, '断魂灵钉 should keep 1 tick chant warning');

  const phaseFixture = createHuanlingCombatFixture(repository, mapTemplateRepository);
  phaseFixture.monster.hp = Math.max(1, Math.floor(phaseFixture.monster.maxHp * 0.7));
  const phaseAction = firstMonsterAction(phaseFixture.instance);
  assert.equal(
    phaseAction?.skillId,
    'skill.huanling_candan_faxiang',
    '重伤的唤灵真人 should prioritize 残丹法相虚影 when entering the 75% phase without 法相 buff',
  );
  assert.equal(phaseAction?.kind, 'skill', '残丹法相虚影 is a self-buff action and should not create warning cells');

  const collapseFixture = createHuanlingCombatFixture(repository, mapTemplateRepository);
  applyHuanlingFaxiangBuff(collapseFixture.monster);
  collapseFixture.monster.hp = Math.max(1, Math.floor(collapseFixture.monster.maxHp * 0.45));
  const collapseAction = firstMonsterAction(collapseFixture.instance);
  assert.equal(
    collapseAction?.skillId,
    'skill.huanling_xingluo_canpan',
    '重伤的唤灵真人 should prioritize 星罗残盘 when entering the 50% phase with 法相 buff',
  );
  assert.equal(collapseAction?.kind, 'skill_chant', '星罗残盘 should be emitted as a chant action');
  assert.equal(collapseAction?.durationMs, 1000, '星罗残盘 should keep 1 tick chant warning');

  const desperationFixture = createHuanlingCombatFixture(repository, mapTemplateRepository);
  applyHuanlingFaxiangBuff(desperationFixture.monster);
  desperationFixture.monster.hp = Math.max(1, Math.floor(desperationFixture.monster.maxHp * 0.2));
  const desperationAction = firstMonsterAction(desperationFixture.instance);
  assert.equal(
    desperationAction?.skillId,
    'skill.huanling_difu_chenyin',
    '重伤的唤灵真人 should prioritize 地府沉印 when entering the 25% phase with 法相 buff',
  );
  assert.equal(desperationAction?.kind, 'skill_chant', '地府沉印 should be emitted as a chant action');
  assert.equal(desperationAction?.durationMs, 1000, '地府沉印 should keep 1 tick chant warning');

  const fallbackFixture = createHuanlingCombatFixture(repository, mapTemplateRepository);
  for (const skill of fallbackFixture.monster.skills) {
    if (skill.id !== 'skill.huanling_canpo_zhang') {
      fallbackFixture.monster.cooldownReadyTickBySkillId[skill.id] = 99999;
    }
  }
  const fallbackAction = firstMonsterAction(fallbackFixture.instance);
  assert.equal(
    fallbackAction?.skillId,
    'skill.huanling_canpo_zhang',
    '残魄掌 should be selected only as fallback when higher priority skills are unavailable',
  );
  assert.equal(fallbackAction?.kind, 'skill_chant', '残魄掌 fallback should still enter chant warning');
  assert.equal(fallbackAction?.durationMs, 1000, '残魄掌 fallback should keep 1 tick chant warning');
}

function createHuanlingCombatFixture(
  repository: ContentTemplateRepository,
  mapTemplateRepository: MapTemplateRepository,
) {
  const spawns = repository.createRuntimeMonstersForMap('ruined_cavern_manor');
  const instance = new MapInstanceRuntime({
    instanceId: `smoke:huanling:${Math.random().toString(36).slice(2)}`,
    template: mapTemplateRepository.getOrThrow('ruined_cavern_manor'),
    monsterSpawns: spawns,
    kind: 'public',
    persistent: false,
    createdAt: Date.now(),
  });
  const snapshot = instance.listMonsters().find((entry) => entry.monsterId === 'm_huanling_zhenren');
  assert.ok(snapshot, 'runtime selection smoke should include 重伤的唤灵真人');
  const monster = instance.monstersByRuntimeId.get(snapshot.runtimeId);
  assert.ok(monster, 'runtime selection smoke should access live 重伤的唤灵真人 state');
  const player = instance.connectPlayer({
    playerId: `player:huanling:${Math.random().toString(36).slice(2)}`,
    sessionId: 'smoke-session',
    preferredX: monster.x + 1,
    preferredY: monster.y,
  });
  assert.ok(
    Math.max(Math.abs(player.x - monster.x), Math.abs(player.y - monster.y)) <= 5,
    'runtime selection smoke target should start within 残魄掌 range',
  );
  return { instance, monster, player };
}

function applyHuanlingFaxiangBuff(monster: Record<string, any>) {
  monster.buffs.push({
    buffId: 'buff.huanling_candan_faxiang',
    name: '残丹法相虚影',
    category: 'buff',
    visibility: 'public',
    remainingTicks: 120,
    duration: 120,
    stacks: 1,
    maxStacks: 1,
  });
}

function firstMonsterAction(instance: MapInstanceRuntime) {
  const result = instance.tickOnce();
  return result.monsterActions.find((action) => action.runtimeId?.includes('m_huanling_zhenren')) ?? result.monsterActions[0] ?? null;
}

function flattenTechniqueSkills(techniques: Array<Record<string, any>>) {
  const skills = new Map<string, Record<string, any>>();
  for (const technique of techniques) {
    for (const skill of technique.skills ?? []) {
      if (typeof skill?.id === 'string') {
        skills.set(skill.id, skill);
      }
    }
  }
  return skills;
}

main();
