import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldProjectorService } from '../network/world-projector.service';
import { TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE } from '@mud/shared';

type TechniqueEntry = {
  techId: string;
  name?: string;
  grade?: string;
  category?: string;
  level?: number;
  exp?: number;
  expToNext?: number;
  realmLv?: number;
  realm?: number;
  skills?: ReadonlyArray<Record<string, unknown>>;
  layers?: ReadonlyArray<Record<string, unknown>>;
};

type ProjectorPlayer = ReturnType<typeof createProjectorPlayer>;

function byteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

function main(): void {
  const noCacheFullProof = proveNoCacheFullPanelKeepsTechniqueStaticDetails();
  const learnedTechniqueProof = proveLearnedTechniquePatchKeepsStaticDetails();
  const expDeltaProof = proveTechniqueExpDeltaAvoidsStaticDetails();
  const levelDeltaProof = proveTechniqueLevelDeltaAvoidsStaticDetails();
  const attrPanelBonusProof = proveAttrPanelUsesProjectedTechniqueBonuses();
  const attrWidePatchProof = proveAttrWidePatchAvoidsFullSnapshot();
  const actionCooldownProof = proveActionCooldownReadyTickDelta();

  console.log(JSON.stringify({
    ok: true,
    noCacheFullProof,
    learnedTechniqueProof,
    expDeltaProof,
    levelDeltaProof,
    attrPanelBonusProof,
    attrWidePatchProof,
    actionCooldownProof,
    answers:
      '功法面板首个全量包和新增功法仍可携带静态 skills/layers；每秒经验/等级动态变化只发字段级 patch，不再带 full/skills/layers/name 等模板详情；属性面板常驻 bonuses 使用投影后的功法加成，包含万法归元与凝气法灵脉投影；属性面板大范围数值变化仍发字段 patch，不回退 full；行动面板会下发技能 cooldownReadyTick 的设置与清除差量，并省略未变化的稳定开关。',
  }, null, 2));
}

function proveNoCacheFullPanelKeepsTechniqueStaticDetails(): {
  fullHasTechnique: boolean;
  fullHasSkills: boolean;
  fullHasLayers: boolean;
  cacheHasNoPanel: boolean;
  cacheHasTechniquePanel: boolean;
} {
  const service = createProjector();
  const player = createProjectorPlayer();
  player.techniques = {
    revision: 1,
    techniques: [createTechnique('tech_full', 0)],
    cultivatingTechId: 'tech_full',
  };
  const envelope = service.createDeltaEnvelope(createProjectorView(), player);
  const entry = envelope?.panelDelta?.tech?.techniques?.[0];
  const cache = getProjectorCache(service);

  const fullHasTechnique = envelope?.panelDelta?.tech?.full === 1 && entry?.techId === 'tech_full';
  const fullHasSkills = Array.isArray(entry?.skills) && entry.skills.length === 1;
  const fullHasLayers = Array.isArray(entry?.layers) && entry.layers.length === 1;
  const cacheHasNoPanel = cache.panel === undefined;
  const cacheHasTechniquePanel = cache.techniquePanel?.techniques?.[0]?.techId === 'tech_full';

  assert.equal(fullHasTechnique, true);
  assert.equal(fullHasSkills, true);
  assert.equal(fullHasLayers, true);
  assert.equal(cacheHasNoPanel, true);
  assert.equal(cacheHasTechniquePanel, true);
  return { fullHasTechnique, fullHasSkills, fullHasLayers, cacheHasNoPanel, cacheHasTechniquePanel };
}

function proveLearnedTechniquePatchKeepsStaticDetails(): {
  patchHasTechnique: boolean;
  patchHasSkills: boolean;
  patchHasLayers: boolean;
  patchIsNotFull: boolean;
} {
  const service = createProjector();
  const player = createProjectorPlayer();
  service.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);
  player.techniques = {
    revision: 2,
    techniques: [createTechnique('tech_learned', 0)],
    cultivatingTechId: 'tech_learned',
  };
  const envelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, player);
  const entry = envelope?.panelDelta?.tech?.techniques?.[0];

  const patchHasTechnique = entry?.techId === 'tech_learned';
  const patchHasSkills = Array.isArray(entry?.skills) && entry.skills.length === 1;
  const patchHasLayers = Array.isArray(entry?.layers) && entry.layers.length === 1;
  const patchIsNotFull = envelope?.panelDelta?.tech?.full === undefined;

  assert.equal(patchHasTechnique, true);
  assert.equal(patchHasSkills, true);
  assert.equal(patchHasLayers, true);
  assert.equal(patchIsNotFull, true);
  return { patchHasTechnique, patchHasSkills, patchHasLayers, patchIsNotFull };
}

function proveTechniqueExpDeltaAvoidsStaticDetails(): {
  patchHasExp: boolean;
  patchHasNoFull: boolean;
  patchHasNoName: boolean;
  patchHasNoSkills: boolean;
  patchHasNoLayers: boolean;
  cacheHasTechniquePanel: boolean;
} {
  const service = createProjector();
  const player = createPlayerWithTechnique('tech_exp', 0);
  service.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);
  player.techniques = {
    ...player.techniques,
    revision: 2,
    techniques: [{ ...player.techniques.techniques[0], exp: 1 }],
  };
  const envelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, player);
  const patch = envelope?.panelDelta?.tech?.techniques?.[0];
  const cache = getProjectorCache(service);

  const patchHasExp = patch?.techId === 'tech_exp' && patch.exp === 1;
  const patchHasNoFull = envelope?.panelDelta?.tech?.full === undefined;
  const patchHasNoName = patch?.name === undefined;
  const patchHasNoSkills = patch?.skills === undefined;
  const patchHasNoLayers = patch?.layers === undefined;
  const cacheHasTechniquePanel = cache.techniquePanel?.revision === 2
    && cache.techniquePanel.techniques?.[0]?.exp === 1;

  assert.equal(patchHasExp, true);
  assert.equal(patchHasNoFull, true);
  assert.equal(patchHasNoName, true);
  assert.equal(patchHasNoSkills, true);
  assert.equal(patchHasNoLayers, true);
  assert.equal(cacheHasTechniquePanel, true);
  return { patchHasExp, patchHasNoFull, patchHasNoName, patchHasNoSkills, patchHasNoLayers, cacheHasTechniquePanel };
}

function proveTechniqueLevelDeltaAvoidsStaticDetails(): {
  patchHasDynamicFields: boolean;
  patchHasNoFull: boolean;
  patchHasNoSkills: boolean;
  patchHasNoLayers: boolean;
} {
  const service = createProjector();
  const player = createPlayerWithTechnique('tech_level', 9);
  service.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);
  player.techniques = {
    ...player.techniques,
    revision: 2,
    techniques: [{
      ...player.techniques.techniques[0],
      level: 2,
      exp: 0,
      expToNext: 20,
      realm: 1,
    }],
  };
  const envelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, player);
  const patch = envelope?.panelDelta?.tech?.techniques?.[0];

  const patchHasDynamicFields = patch?.techId === 'tech_level'
    && patch.level === 2
    && patch.exp === 0
    && patch.expToNext === 20
    && patch.realm === 1;
  const patchHasNoFull = envelope?.panelDelta?.tech?.full === undefined;
  const patchHasNoSkills = patch?.skills === undefined;
  const patchHasNoLayers = patch?.layers === undefined;

  assert.equal(patchHasDynamicFields, true);
  assert.equal(patchHasNoFull, true);
  assert.equal(patchHasNoSkills, true);
  assert.equal(patchHasNoLayers, true);
  return { patchHasDynamicFields, patchHasNoFull, patchHasNoSkills, patchHasNoLayers };
}

function proveAttrPanelUsesProjectedTechniqueBonuses(): {
  hasTechniqueMaxBonus: boolean;
  techniqueMaxValue: number | undefined;
  hasQiProjectionBonus: boolean;
  qiProjectionEfficiencyBpMultiplier: number | undefined;
  legacyPlayerBonusesWasEmpty: boolean;
} {
  const service = createProjector();
  const player = createProjectorPlayer();
  player.techniques = {
    revision: 2,
    techniques: [createTechnique('ningqi_projector', 0)],
    cultivatingTechId: 'ningqi_projector',
  };
  const envelope = service.createDeltaEnvelope(createProjectorView(), player);
  const bonuses = envelope?.panelDelta?.attr?.bonuses ?? [];
  const techniqueMaxBonus = bonuses.find((entry: any) => entry.source === TECHNIQUE_MAX_ATTR_PERCENT_BONUS_SOURCE);
  const qiProjectionBonus = bonuses.find((entry: any) => entry.source === 'technique:ningqi_projector');
  const qiProjectionEfficiencyBpMultiplier = qiProjectionBonus?.qiProjection?.[0]?.efficiencyBpMultiplier;

  const hasTechniqueMaxBonus = techniqueMaxBonus?.label === '万法归元'
    && techniqueMaxBonus.attrMode === 'percent'
    && techniqueMaxBonus.attrs?.constitution === 1;
  const hasQiProjectionBonus = qiProjectionBonus?.label === '功法-ningqi_projector'
    && qiProjectionEfficiencyBpMultiplier === 11000;
  const legacyPlayerBonusesWasEmpty = player.bonuses.length === 0;

  assert.equal(hasTechniqueMaxBonus, true);
  assert.equal(hasQiProjectionBonus, true);
  assert.equal(legacyPlayerBonusesWasEmpty, true);
  return {
    hasTechniqueMaxBonus,
    techniqueMaxValue: techniqueMaxBonus?.attrs?.constitution,
    hasQiProjectionBonus,
    qiProjectionEfficiencyBpMultiplier,
    legacyPlayerBonusesWasEmpty,
  };
}

function proveActionCooldownReadyTickDelta(): {
  patchCarriesReadyTick: boolean;
  clearPatchCarriesAction: boolean;
  clearPatchHasNoReadyTick: boolean;
  staticFieldsOmitted: boolean;
  stableControlsOmitted: boolean;
  optimizedBytes: number;
  legacyBytes: number;
} {
  const service = createProjector();
  const player = createProjectorPlayer();
  player.actions = {
    revision: 1,
    actions: [createAction('skill:cooldown-proof', 0, undefined)],
  };
  service.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);

  player.actions = {
    revision: 2,
    actions: [createAction('skill:cooldown-proof', 5, 105)],
  };
  const activeEnvelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, player);
  const activeAction = activeEnvelope?.panelDelta?.act?.actions?.find((entry) => entry.id === 'skill:cooldown-proof');

  player.actions = {
    revision: 3,
    actions: [createAction('skill:cooldown-proof', 0, undefined)],
  };
  const clearEnvelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 3 }, player);
  const clearAction = clearEnvelope?.panelDelta?.act?.actions?.find((entry) => entry.id === 'skill:cooldown-proof');

  const patchCarriesReadyTick = activeAction?.cooldownReadyTick === 105;
  const clearPatchCarriesAction = clearAction?.cooldownLeft === 0;
  const clearPatchHasNoReadyTick = clearAction !== undefined && clearAction.cooldownReadyTick === undefined;
  const staticFieldsOmitted = activeAction?.name === undefined
    && activeAction?.desc === undefined
    && activeAction?.type === undefined
    && activeAction?.range === undefined
    && activeAction?.requiresTarget === undefined
    && activeAction?.targetMode === undefined;
  const stableControlsOmitted = activeEnvelope?.panelDelta?.act?.autoBattle === undefined
    && activeEnvelope?.panelDelta?.act?.autoUsePills === undefined
    && activeEnvelope?.panelDelta?.act?.combatTargetingRules === undefined
    && activeEnvelope?.panelDelta?.act?.autoBattleStationary === undefined
    && activeEnvelope?.panelDelta?.act?.autoIdleCultivation === undefined;
  const optimizedBytes = byteLength(activeEnvelope?.panelDelta?.act);
  const legacyBytes = byteLength({
    ...activeEnvelope?.panelDelta?.act,
    actions: [createAction('skill:cooldown-proof', 5, 105)],
  });

  assert.equal(patchCarriesReadyTick, true);
  assert.equal(clearPatchCarriesAction, true);
  assert.equal(clearPatchHasNoReadyTick, true);
  assert.equal(staticFieldsOmitted, true);
  assert.equal(stableControlsOmitted, true);
  assert.ok(optimizedBytes < legacyBytes, `expected action cooldown patch compaction: optimized=${optimizedBytes} legacy=${legacyBytes}`);
  return {
    patchCarriesReadyTick,
    clearPatchCarriesAction,
    clearPatchHasNoReadyTick,
    staticFieldsOmitted,
    stableControlsOmitted,
    optimizedBytes,
    legacyBytes,
  };
}

function proveAttrWidePatchAvoidsFullSnapshot(): {
  attrIsPatch: boolean;
  finalAttrsPatched: boolean;
  numericStatsPatched: boolean;
  stableLargeFieldsOmitted: boolean;
} {
  const service = createProjector();
  const player = createProjectorPlayer();
  service.createInitialEnvelope({ playerId: player.playerId, sessionId: 'projector_session' }, createProjectorView(), player);

  player.attrs = {
    ...player.attrs,
    revision: 2,
    finalAttrs: {
      constitution: 11,
      spirit: 12,
      perception: 13,
      talent: 14,
      strength: 15,
      meridians: 16,
    },
    numericStats: {
      ...player.attrs.numericStats,
      maxHp: 100,
      maxQi: 101,
      physAtk: 102,
      spellAtk: 103,
      physDef: 104,
      spellDef: 105,
      hit: 106,
      dodge: 107,
      crit: 108,
      antiCrit: 109,
      resolvePower: 110,
    },
  };
  const envelope = service.createDeltaEnvelope({ ...createProjectorView(), tick: 2 }, player);
  const attr = envelope?.panelDelta?.attr;

  const attrIsPatch = attr?.full === undefined;
  const finalAttrsPatched = attr?.finalAttrs?.constitution === 11 && attr.finalAttrs.meridians === 16;
  const numericStatsPatched = attr?.numericStats?.maxHp === 100 && attr.numericStats.resolvePower === 110;
  const stableLargeFieldsOmitted = attr?.baseAttrs === undefined
    && attr?.bonuses === undefined
    && attr?.ratioDivisors === undefined
    && attr?.specialStats === undefined;

  assert.equal(attrIsPatch, true);
  assert.equal(finalAttrsPatched, true);
  assert.equal(numericStatsPatched, true);
  assert.equal(stableLargeFieldsOmitted, true);
  return { attrIsPatch, finalAttrsPatched, numericStatsPatched, stableLargeFieldsOmitted };
}

function createProjector(): WorldProjectorService {
  return new WorldProjectorService({
    has: () => true,
    getOrThrow: (mapId: string) => ({ name: mapId }),
  } as never, null);
}

function getProjectorCache(service: WorldProjectorService): Record<string, any> {
  return (service as unknown as { cacheByPlayerId: Map<string, Record<string, any>> })
    .cacheByPlayerId.get('projector_player') ?? {};
}

function createPlayerWithTechnique(techId: string, exp: number): ProjectorPlayer {
  const player = createProjectorPlayer();
  player.techniques = {
    revision: 1,
    techniques: [createTechnique(techId, exp)],
    cultivatingTechId: techId,
  };
  return player;
}

function createTechnique(techId: string, exp: number): TechniqueEntry {
  return {
    techId,
    name: `功法-${techId}`,
    grade: 'common',
    category: 'cultivation',
    level: 1,
    exp,
    expToNext: 10,
    realmLv: 1,
    realm: 0,
    skills: [{
      id: `${techId}_skill`,
      name: '模板招式',
      desc: '这段静态描述不应随经验变化重复下发',
      cooldown: 1,
      cost: 1,
      range: 1,
      effects: [],
    }],
    layers: [{
      level: 1,
      expToNext: 10,
      attrs: { constitution: 10 },
      qiProjection: [{
        selector: { families: ['aura'], forms: ['refined'], elements: ['neutral'] },
        visibility: 'absorbable',
        efficiencyBpMultiplier: 11000,
      }],
    }],
  };
}

function createAction(id: string, cooldownLeft: number, cooldownReadyTick: number | undefined) {
  return {
    id,
    name: '冷却证明',
    type: 'skill',
    desc: '验证动作冷却时间轴',
    cooldownLeft,
    cooldownReadyTick,
    range: 1,
    requiresTarget: true,
    targetMode: 'entity',
    autoBattleEnabled: true,
    autoBattleOrder: 0,
    skillEnabled: true,
  };
}

function createProjectorView(): Record<string, any> {
  return {
    playerId: 'projector_player',
    tick: 1,
    worldRevision: 1,
    selfRevision: 1,
    instance: {
      instanceId: 'public:projector',
      templateId: 'yunlai_town',
      name: '云来镇',
      kind: 'public',
      width: 16,
      height: 16,
    },
    self: { x: 1, y: 1, name: '测试', displayName: '测试', buffs: [] },
    visiblePlayers: [],
    localNpcs: [],
    localMonsters: [],
    localPortals: [],
    localGroundPiles: [],
    localContainers: [],
    localBuildings: [],
    localFormations: [],
  };
}

function createProjectorPlayer() {
  const attrs = createAttributes();
  return {
    playerId: 'projector_player',
    instanceId: 'public:projector',
    templateId: 'yunlai_town',
    x: 1,
    y: 1,
    facing: 'south',
    hp: 10,
    maxHp: 10,
    qi: 5,
    maxQi: 5,
    selfRevision: 1,
    wallet: { balances: [] },
    inventory: { revision: 1, capacity: 20, items: [] },
    equipment: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [] as TechniqueEntry[], cultivatingTechId: null as string | null },
    bodyTraining: null as { level: number; exp: number; expToNext: number } | null,
    attrs: {
      revision: 1,
      stage: '炼气',
      baseAttrs: attrs,
      finalAttrs: attrs,
      numericStats: createNumericStats(),
      ratioDivisors: createRatioDivisors(),
    },
    actions: { revision: 1, actions: [] as any[] },
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
    bonuses: [],
    foundation: 1,
    rootFoundation: 1,
    combatExp: 0,
    comprehension: 0,
    luck: 0,
    fengShuiLuck: 0,
    boneAgeBaseYears: 18,
    lifeElapsedTicks: 0,
    lifespanYears: 80,
    realm: { realmLv: 1, progress: 0, progressToNext: 100, breakthroughReady: false },
    alchemySkill: null,
    forgingSkill: null,
    buildingSkill: null,
    gatherSkill: null,
    enhancementSkill: null,
    miningSkill: null,
  };
}

function createAttributes(): Record<string, number> {
  return { constitution: 1, spirit: 1, perception: 1, talent: 1, strength: 1, meridians: 1 };
}

function createRatioDivisors(): Record<string, unknown> {
  return {
    dodge: 100,
    crit: 100,
    breakPower: 100,
    resolvePower: 100,
    cooldownSpeed: 100,
    moveSpeed: 100,
    elementDamageReduce: { metal: 100, wood: 100, water: 100, fire: 100, earth: 100 },
  };
}

function createNumericStats(): Record<string, unknown> {
  return {
    maxHp: 10,
    maxQi: 5,
    physAtk: 1,
    spellAtk: 1,
    physDef: 1,
    spellDef: 1,
    hit: 1,
    dodge: 1,
    crit: 0,
    antiCrit: 0,
    critDamage: 0,
    breakPower: 0,
    resolvePower: 0,
    maxQiOutputPerTick: 1,
    qiRegenRate: 0,
    hpRegenRate: 0,
    cooldownSpeed: 0,
    auraCostReduce: 0,
    auraPowerRate: 0,
    playerExpRate: 0,
    techniqueExpRate: 0,
    realmExpPerTick: 0,
    techniqueExpPerTick: 0,
    lootRate: 0,
    rareLootRate: 0,
    viewRange: 8,
    moveSpeed: 1,
    damageReduce: 0,
    pvpDamageReduce: 0,
    pvpDamageBonus: 0,
    extraAggroRate: 0,
    extraRange: 0,
    extraArea: 0,
    actionsPerTurn: 1,
    elementDamageBonus: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
    elementDamageReduce: { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 },
  };
}

main();
