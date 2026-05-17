import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldProjectorService } from '../network/world-projector.service';

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

function main(): void {
  const noCacheFullProof = proveNoCacheFullPanelKeepsTechniqueStaticDetails();
  const learnedTechniqueProof = proveLearnedTechniquePatchKeepsStaticDetails();
  const expDeltaProof = proveTechniqueExpDeltaAvoidsStaticDetails();
  const levelDeltaProof = proveTechniqueLevelDeltaAvoidsStaticDetails();

  console.log(JSON.stringify({
    ok: true,
    noCacheFullProof,
    learnedTechniqueProof,
    expDeltaProof,
    levelDeltaProof,
    answers:
      '功法面板首个全量包和新增功法仍可携带静态 skills/layers；每秒经验/等级动态变化只发字段级 patch，不再带 full/skills/layers/name 等模板详情。',
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
      attrs: { constitution: 1 },
    }],
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
