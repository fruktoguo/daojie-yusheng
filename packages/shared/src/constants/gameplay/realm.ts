import type { NumericRatioDivisors, NumericStats, RealmNumericTemplate } from '../../numeric';
import type { Attributes, BreakthroughItemRequirement } from '../../types';
import { PlayerRealmStage, TechniqueRealm } from '../../types';
import {
  addPartialNumericStats,
  cloneNumericRatioDivisors,
  cloneNumericStats,
  ensureNumericRatioDivisorsTemplate,
  ensureNumericStatsTemplateStats,
} from '../../numeric';

import {
  ATTR_KEYS,
  BASE_HIT,
  BASE_HP_REGEN_RATE,
  BASE_MAX_HP,
  BASE_MAX_QI,
  BASE_MAX_QI_OUTPUT_PER_TICK,
  BASE_PHYS_ATK,
  BASE_PHYS_DEF,
  BASE_QI_REGEN_RATE,
  BASE_SPELL_ATK,
  BASE_SPELL_DEF,
} from './attributes';
import { VIEW_RADIUS } from './world';

/**
 * 境界成长与境界模板常量。
 */

type RealmConfig = {
/**
 * name：名称名称或显示文本。
 */

  name: string;  
  /**
 * shortName：short名称名称或显示文本。
 */

  shortName: string;  
  /**
 * path：路径相关字段。
 */

  path: 'martial' | 'immortal';  
  /**
 * narrative：narrative相关字段。
 */

  narrative: string;  
  /**
 * progressToNext：进度ToNext相关字段。
 */

  progressToNext: number;  
  /**
 * attrBonus：attrBonu相关字段。
 */

  attrBonus: Partial<Attributes>;  
  /**
 * breakthroughItems：集合字段。
 */

  breakthroughItems: BreakthroughItemRequirement[];  
  /**
 * minTechniqueLevel：min功法等级数值。
 */

  minTechniqueLevel: number;  
  /**
 * minTechniqueRealm：min功法Realm相关字段。
 */

  minTechniqueRealm?: TechniqueRealm;
};

const ZERO_ELEMENT_STATS = {
  metal: 0,
  wood: 0,
  water: 0,
  fire: 0,
  earth: 0,
} as const;

/** FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR：FIXED元素DAMAGE REDUCE DIVISOR。 */
const FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR = 100;

function buildRealmNumericDelta(
  stage: PlayerRealmStage,
  stats: Partial<NumericStats>,
  ratioDivisorDelta: number,
): RealmNumericTemplate {
  return {
    stage,
    stats: ensureNumericStatsTemplateStats({
      maxHp: 0,
      maxQi: 0,
      physAtk: 0,
      spellAtk: 0,
      physDef: 0,
      spellDef: 0,
      hit: 0,
      dodge: 0,
      crit: 0,
      antiCrit: 0,
      critDamage: 0,
      breakPower: 0,
      resolvePower: 0,
      maxQiOutputPerTick: 0,
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
      viewRange: 0,
      moveSpeed: 0,
      extraAggroRate: 0,
      extraRange: 0,
      extraArea: 0,
      actionsPerTurn: 0,
      elementDamageBonus: { ...ZERO_ELEMENT_STATS },
      elementDamageReduce: { ...ZERO_ELEMENT_STATS },
      ...stats,
    }),
    ratioDivisors: ensureNumericRatioDivisorsTemplate({
      dodge: ratioDivisorDelta,
      crit: ratioDivisorDelta,
      breakPower: ratioDivisorDelta,
      resolvePower: ratioDivisorDelta,
      cooldownSpeed: ratioDivisorDelta,
      moveSpeed: ratioDivisorDelta,
      elementDamageReduce: { ...ZERO_ELEMENT_STATS },
    }),
  };
}

/** 默认玩家大境界。 */
export const DEFAULT_PLAYER_REALM_STAGE = PlayerRealmStage.Mortal;

/** 玩家大境界顺序。 */
export const PLAYER_REALM_ORDER: PlayerRealmStage[] = [
  PlayerRealmStage.Mortal,
  PlayerRealmStage.BodyTempering,
  PlayerRealmStage.BoneForging,
  PlayerRealmStage.Meridian,
  PlayerRealmStage.Innate,
  PlayerRealmStage.QiRefining,
  PlayerRealmStage.QiRefiningMiddle,
  PlayerRealmStage.QiRefiningLate,
  PlayerRealmStage.Foundation,
  PlayerRealmStage.FoundationMiddle,
  PlayerRealmStage.FoundationLate,
];

/** 玩家大境界对应的等级区间。 */
export const PLAYER_REALM_STAGE_LEVEL_RANGES: Record<PlayerRealmStage, {
/**
 * levelFrom：等级From相关字段。
 */
 levelFrom: number;
 /**
 * levelTo：等级To相关字段。
 */
 levelTo: number }> = {
  [PlayerRealmStage.Mortal]: { levelFrom: 1, levelTo: 5 },
  [PlayerRealmStage.BodyTempering]: { levelFrom: 6, levelTo: 8 },
  [PlayerRealmStage.BoneForging]: { levelFrom: 9, levelTo: 11 },
  [PlayerRealmStage.Meridian]: { levelFrom: 12, levelTo: 15 },
  [PlayerRealmStage.Innate]: { levelFrom: 16, levelTo: 18 },
  [PlayerRealmStage.QiRefining]: { levelFrom: 19, levelTo: 22 },
  [PlayerRealmStage.QiRefiningMiddle]: { levelFrom: 23, levelTo: 26 },
  [PlayerRealmStage.QiRefiningLate]: { levelFrom: 27, levelTo: 30 },
  [PlayerRealmStage.Foundation]: { levelFrom: 31, levelTo: 34 },
  [PlayerRealmStage.FoundationMiddle]: { levelFrom: 35, levelTo: 38 },
  [PlayerRealmStage.FoundationLate]: { levelFrom: 39, levelTo: 42 },
};

/** 武道到修仙的大境界配置。attrBonus 表示本大境界相对上一大境界的新增六维。 */
export const PLAYER_REALM_CONFIG: Record<PlayerRealmStage, RealmConfig> = {
  [PlayerRealmStage.Mortal]: {
    name: '凡俗境',
    shortName: '凡俗',
    path: 'martial',
    narrative: '筋骨未开，仍在江湖门槛之外，只能以勤练夯实根基。',
    progressToNext: 60,
    attrBonus: {},
    breakthroughItems: [
      { itemId: 'rat_tail', count: 3 },
      { itemId: 'boar_tusk', count: 1 },
    ],
    minTechniqueLevel: 1,
  },
  [PlayerRealmStage.BodyTempering]: {
    name: '淬体境',
    shortName: '淬体',
    path: 'martial',
    narrative: '以气血反复淬洗皮肉，凡躯渐能承载更重劲力。',
    progressToNext: 120,
    attrBonus: { constitution: 12, spirit: 2, perception: 4, talent: 4, strength: 8 },
    breakthroughItems: [
      { itemId: 'wolf_fang', count: 4 },
      { itemId: 'serpent_gall', count: 2 },
    ],
    minTechniqueLevel: 2,
    minTechniqueRealm: TechniqueRealm.Entry,
  },
  [PlayerRealmStage.BoneForging]: {
    name: '锻骨境',
    shortName: '锻骨',
    path: 'martial',
    narrative: '骨骼经受药力与劲力淬炼，气血承载力显著增长。',
    progressToNext: 180,
    attrBonus: { constitution: 8, spirit: 2, perception: 4, talent: 8, strength: 8 },
    breakthroughItems: [
      { itemId: 'black_iron_chunk', count: 4 },
      { itemId: 'crystal_dust', count: 3 },
    ],
    minTechniqueLevel: 4,
    minTechniqueRealm: TechniqueRealm.Minor,
  },
  [PlayerRealmStage.Meridian]: {
    name: '通脉境',
    shortName: '通脉',
    path: 'martial',
    narrative: '经脉渐通，劲力开始带有内息性质，武道正向玄门靠拢。',
    progressToNext: 260,
    attrBonus: { constitution: 4, spirit: 8, perception: 10, talent: 6, strength: 6, meridians: 18 },
    breakthroughItems: [
      { itemId: 'black_iron_chunk', count: 6 },
      { itemId: 'rune_shard', count: 4 },
      { itemId: 'mine_signal_core', count: 1 },
    ],
    minTechniqueLevel: 6,
    minTechniqueRealm: TechniqueRealm.Minor,
  },
  [PlayerRealmStage.Innate]: {
    name: '先天境',
    shortName: '先天',
    path: 'martial',
    narrative: '内外归一，先天一炁渐显，是凡武迈向仙道的最后门槛。',
    progressToNext: 360,
    attrBonus: { constitution: 6, spirit: 18, perception: 12, talent: 12, strength: 8, meridians: 12 },
    breakthroughItems: [
      { itemId: 'rune_shard', count: 6 },
      { itemId: 'spirit_iron_fragment', count: 4 },
      { itemId: 'valley_core', count: 1 },
    ],
    minTechniqueLevel: 8,
    minTechniqueRealm: TechniqueRealm.Major,
  },
  [PlayerRealmStage.QiRefining]: {
    name: '练气前期',
    shortName: '练气前',
    path: 'immortal',
    narrative: '初引天地灵机入体，神识与经脉先行打开，正式踏入修仙序列。',
    progressToNext: 1040,
    attrBonus: { constitution: 10, spirit: 25, perception: 8, talent: 15, strength: 5, meridians: 30 },
    breakthroughItems: [
      { itemId: 'blood_feather', count: 6 },
      { itemId: 'demon_wolf_bone', count: 6 },
      { itemId: 'spirit_iron_fragment', count: 6 },
    ],
    minTechniqueLevel: 10,
    minTechniqueRealm: TechniqueRealm.Major,
  },
  [PlayerRealmStage.QiRefiningMiddle]: {
    name: '练气中期',
    shortName: '练气中',
    path: 'immortal',
    narrative: '灵机周流趋稳，神识、经脉与根骨同步增长，法术运转更为顺畅。',
    progressToNext: 1120,
    attrBonus: { constitution: 25, spirit: 25, perception: 22, talent: 25, strength: 23, meridians: 25 },
    breakthroughItems: [
      { itemId: 'blood_feather', count: 8 },
      { itemId: 'demon_wolf_bone', count: 8 },
      { itemId: 'spirit_iron_fragment', count: 8 },
    ],
    minTechniqueLevel: 11,
    minTechniqueRealm: TechniqueRealm.Major,
  },
  [PlayerRealmStage.QiRefiningLate]: {
    name: '练气后期',
    shortName: '练气后',
    path: 'immortal',
    narrative: '气海渐满，练气一境归于圆融，六维底子补足到百数之基。',
    progressToNext: 1200,
    attrBonus: { constitution: 35, spirit: 20, perception: 40, talent: 30, strength: 42, meridians: 15 },
    breakthroughItems: [
      { itemId: 'blood_feather', count: 10 },
      { itemId: 'demon_wolf_bone', count: 10 },
      { itemId: 'spirit_iron_fragment', count: 10 },
    ],
    minTechniqueLevel: 12,
    minTechniqueRealm: TechniqueRealm.Perfection,
  },
  [PlayerRealmStage.Foundation]: {
    name: '筑基前期',
    shortName: '筑基前',
    path: 'immortal',
    narrative: '道基初筑，体魄、根骨与经脉开始承载更高层次的灵机。',
    progressToNext: 1240,
    attrBonus: { constitution: 25, spirit: 20, perception: 12, talent: 35, strength: 15, meridians: 30 },
    breakthroughItems: [],
    minTechniqueLevel: 12,
    minTechniqueRealm: TechniqueRealm.Perfection,
  },
  [PlayerRealmStage.FoundationMiddle]: {
    name: '筑基中期',
    shortName: '筑基中',
    path: 'immortal',
    narrative: '道基渐稳，根骨、神识与经脉继续抬升，攻守根盘更厚。',
    progressToNext: 1320,
    attrBonus: { constitution: 35, spirit: 30, perception: 28, talent: 35, strength: 30, meridians: 35 },
    breakthroughItems: [],
    minTechniqueLevel: 13,
    minTechniqueRealm: TechniqueRealm.Perfection,
  },
  [PlayerRealmStage.FoundationLate]: {
    name: '筑基后期',
    shortName: '筑基后',
    path: 'immortal',
    narrative: '道基圆满，六维百尺竿头再进，后续更高境界已有根基。',
    progressToNext: 1400,
    attrBonus: { constitution: 40, spirit: 50, perception: 60, talent: 30, strength: 55, meridians: 35 },
    breakthroughItems: [],
    minTechniqueLevel: 14,
    minTechniqueRealm: TechniqueRealm.Perfection,
  },
};

/** 按境界提供的数值模板增量与 RatioValue 除数增量。初始大境界为基础值，后续大境界为相对上一大境界的新增量。 */
export const PLAYER_REALM_NUMERIC_TEMPLATES: Record<PlayerRealmStage, RealmNumericTemplate> = {
  [PlayerRealmStage.Mortal]: {
    stage: PlayerRealmStage.Mortal,
    stats: ensureNumericStatsTemplateStats({
      maxHp: BASE_MAX_HP,
      maxQi: BASE_MAX_QI,
      physAtk: BASE_PHYS_ATK,
      spellAtk: BASE_SPELL_ATK,
      physDef: BASE_PHYS_DEF,
      spellDef: BASE_SPELL_DEF,
      hit: BASE_HIT,
      dodge: 0,
      crit: 0,
      antiCrit: 0,
      critDamage: 0,
      breakPower: 0,
      resolvePower: 0,
      maxQiOutputPerTick: BASE_MAX_QI_OUTPUT_PER_TICK,
      qiRegenRate: BASE_QI_REGEN_RATE,
      hpRegenRate: BASE_HP_REGEN_RATE,
      cooldownSpeed: 0,
      auraCostReduce: 0,
      auraPowerRate: 0,
      playerExpRate: 0,
      techniqueExpRate: 0,
      realmExpPerTick: 0,
      techniqueExpPerTick: 0,
      lootRate: 0,
      rareLootRate: 0,
      viewRange: VIEW_RADIUS,
      moveSpeed: 0,
      extraAggroRate: 0,
      extraRange: 0,
      extraArea: 0,
      actionsPerTurn: 1,
      elementDamageBonus: { ...ZERO_ELEMENT_STATS },
      elementDamageReduce: {
        metal: 0,
        wood: 0,
        water: 0,
        fire: 0,
        earth: 0,
      },
    }),
    ratioDivisors: ensureNumericRatioDivisorsTemplate({
      dodge: 100,
      crit: 100,
      breakPower: 100,
      resolvePower: 100,
      cooldownSpeed: 100,
      moveSpeed: 100,
      elementDamageReduce: {
        metal: FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR,
        wood: FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR,
        water: FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR,
        fire: FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR,
        earth: FIXED_ELEMENT_DAMAGE_REDUCE_DIVISOR,
      },
    }),
  },
  [PlayerRealmStage.BodyTempering]: buildRealmNumericDelta(PlayerRealmStage.BodyTempering, {
    maxHp: 25,
    physAtk: 3,
    physDef: 3,
  }, 25),
  [PlayerRealmStage.BoneForging]: buildRealmNumericDelta(PlayerRealmStage.BoneForging, {
    maxHp: 20,
    physAtk: 2,
    physDef: 3,
    spellDef: 1,
    breakPower: 1,
  }, 20),
  [PlayerRealmStage.Meridian]: buildRealmNumericDelta(PlayerRealmStage.Meridian, {
    maxHp: 15,
    maxQi: 25,
    spellAtk: 3,
    spellDef: 3,
    hit: 4,
    dodge: 2,
    breakPower: 2,
    resolvePower: 2,
    maxQiOutputPerTick: 3,
  }, 25),
  [PlayerRealmStage.Innate]: buildRealmNumericDelta(PlayerRealmStage.Innate, {
    maxHp: 20,
    maxQi: 15,
    physAtk: 3,
    spellAtk: 5,
    physDef: 2,
    spellDef: 4,
    hit: 4,
    dodge: 3,
    crit: 4,
    antiCrit: 4,
    breakPower: 2,
    resolvePower: 3,
    maxQiOutputPerTick: 2,
  }, 30),
  [PlayerRealmStage.QiRefining]: buildRealmNumericDelta(PlayerRealmStage.QiRefining, {
    maxHp: 25,
    maxQi: 35,
    physAtk: 2,
    spellAtk: 6,
    physDef: 2,
    spellDef: 5,
    hit: 3,
    dodge: 1,
    crit: 1,
    antiCrit: 2,
    breakPower: 1,
    resolvePower: 3,
    maxQiOutputPerTick: 3,
  }, 40),
  [PlayerRealmStage.QiRefiningMiddle]: buildRealmNumericDelta(PlayerRealmStage.QiRefiningMiddle, {
    maxHp: 30,
    maxQi: 40,
    physAtk: 3,
    spellAtk: 6,
    physDef: 3,
    spellDef: 5,
    hit: 4,
    dodge: 2,
    crit: 2,
    antiCrit: 2,
    breakPower: 2,
    resolvePower: 3,
    maxQiOutputPerTick: 4,
  }, 40),
  [PlayerRealmStage.QiRefiningLate]: buildRealmNumericDelta(PlayerRealmStage.QiRefiningLate, {
    maxHp: 35,
    maxQi: 55,
    physAtk: 3,
    spellAtk: 8,
    physDef: 3,
    spellDef: 7,
    hit: 5,
    dodge: 2,
    crit: 2,
    antiCrit: 2,
    breakPower: 4,
    resolvePower: 4,
    maxQiOutputPerTick: 4,
  }, 40),
  [PlayerRealmStage.Foundation]: buildRealmNumericDelta(PlayerRealmStage.Foundation, {
    maxHp: 55,
    maxQi: 65,
    physAtk: 6,
    spellAtk: 8,
    physDef: 7,
    spellDef: 8,
    hit: 5,
    dodge: 3,
    crit: 2,
    antiCrit: 4,
    breakPower: 4,
    resolvePower: 5,
    maxQiOutputPerTick: 6,
  }, 40),
  [PlayerRealmStage.FoundationMiddle]: buildRealmNumericDelta(PlayerRealmStage.FoundationMiddle, {
    maxHp: 75,
    maxQi: 80,
    physAtk: 7,
    spellAtk: 10,
    physDef: 8,
    spellDef: 10,
    hit: 7,
    dodge: 3,
    crit: 3,
    antiCrit: 4,
    breakPower: 6,
    resolvePower: 7,
    maxQiOutputPerTick: 6,
  }, 40),
  [PlayerRealmStage.FoundationLate]: buildRealmNumericDelta(PlayerRealmStage.FoundationLate, {
    maxHp: 100,
    maxQi: 105,
    physAtk: 9,
    spellAtk: 14,
    physDef: 11,
    spellDef: 15,
    hit: 8,
    dodge: 4,
    crit: 4,
    antiCrit: 5,
    breakPower: 8,
    resolvePower: 9,
    maxQiOutputPerTick: 8,
  }, 50),
};

const PLAYER_REALM_RATIO_DIVISOR_KEYS: Array<Exclude<keyof NumericRatioDivisors, 'elementDamageReduce'>> = [
  'dodge',
  'crit',
  'breakPower',
  'resolvePower',
  'cooldownSpeed',
  'moveSpeed',
];

/** 解析从凡俗境到目标大境界的累加段。 */
export function getPlayerRealmStagesThrough(stage: PlayerRealmStage | undefined): PlayerRealmStage[] {
  const index = PLAYER_REALM_ORDER.indexOf(stage ?? DEFAULT_PLAYER_REALM_STAGE);
  const normalizedIndex = index >= 0 ? index : PLAYER_REALM_ORDER.indexOf(DEFAULT_PLAYER_REALM_STAGE);
  return PLAYER_REALM_ORDER.slice(0, normalizedIndex + 1);
}

/** 累加到当前大境界后的六维基础加成。 */
export function resolvePlayerRealmAttributeBonus(stage: PlayerRealmStage | undefined): Attributes {
  const result = {
    constitution: 0,
    spirit: 0,
    perception: 0,
    talent: 0,
    strength: 0,
    meridians: 0,
  };
  for (const realmStage of getPlayerRealmStagesThrough(stage)) {
    const bonus = PLAYER_REALM_CONFIG[realmStage]?.attrBonus;
    if (!bonus) {
      continue;
    }
    for (const key of ATTR_KEYS) {
      result[key] += bonus[key] ?? 0;
    }
  }
  return result;
}

function addRatioDivisorDelta(target: NumericRatioDivisors, delta: NumericRatioDivisors): void {
  for (const key of PLAYER_REALM_RATIO_DIVISOR_KEYS) {
    target[key] += delta[key];
  }
  for (const element of ['metal', 'wood', 'water', 'fire', 'earth'] as const) {
    target.elementDamageReduce[element] += delta.elementDamageReduce[element];
  }
}

/** 累加到当前大境界后的完整数值模板。 */
export function resolvePlayerRealmNumericTemplate(stage: PlayerRealmStage | undefined): RealmNumericTemplate {
  const stages = getPlayerRealmStagesThrough(stage);
  const baseStage = stages[0] ?? DEFAULT_PLAYER_REALM_STAGE;
  const resolvedStage = stages[stages.length - 1] ?? DEFAULT_PLAYER_REALM_STAGE;
  const baseTemplate = PLAYER_REALM_NUMERIC_TEMPLATES[baseStage] ?? PLAYER_REALM_NUMERIC_TEMPLATES[DEFAULT_PLAYER_REALM_STAGE];
  const stats = cloneNumericStats(baseTemplate.stats);
  const ratioDivisors = cloneNumericRatioDivisors(baseTemplate.ratioDivisors);
  for (const realmStage of stages.slice(1)) {
    const template = PLAYER_REALM_NUMERIC_TEMPLATES[realmStage];
    if (!template) {
      continue;
    }
    addPartialNumericStats(stats, template.stats);
    addRatioDivisorDelta(ratioDivisors, template.ratioDivisors);
  }
  return {
    stage: resolvedStage,
    stats,
    ratioDivisors,
  };
}
