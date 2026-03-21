import {
  Attributes,
  AttrKey,
  BreakthroughItemRequirement,
  MapTimeConfig,
  PlayerRealmStage,
  TimePhaseId,
  TechniqueGrade,
  TechniqueRealm,
} from './types';
import type {
  PartialNumericStats,
  RealmNumericTemplate,
} from './numeric';

/** Tick 间隔（毫秒） */
export const TICK_INTERVAL = 1000;

/** 单 tick 最大处理时间（毫秒） */
export const TICK_BUDGET = 200;

/** 默认视野范围（半径，格子数） */
export const VIEW_RADIUS = 10;

/** 视野尺寸 */
export const VIEW_SIZE = VIEW_RADIUS * 2 + 1;

/** 游戏一天长度（息） */
export const GAME_DAY_TICKS = 7200;

/** 昼夜环境效果来源 ID */
export const WORLD_TIME_SOURCE_ID = 'world:time';

/** 夜色环境效果 Buff ID */
export const WORLD_DARKNESS_BUFF_ID = 'world:darkness';

/** 夜色环境效果持续时间 */
export const WORLD_DARKNESS_BUFF_DURATION = 2;

export interface TimePhaseDefinition {
  id: TimePhaseId;
  label: string;
  startTick: number;
  endTick: number;
  skyLightPercent: number;
  tint: string;
  overlayAlpha: number;
}

export const GAME_TIME_PHASES: TimePhaseDefinition[] = [
  { id: 'deep_night', label: '子夜', startTick: 0, endTick: 900, skyLightPercent: 50, tint: '#06101c', overlayAlpha: 0.48 },
  { id: 'late_night', label: '深宵', startTick: 900, endTick: 1500, skyLightPercent: 60, tint: '#0a1726', overlayAlpha: 0.42 },
  { id: 'before_dawn', label: '残夜', startTick: 1500, endTick: 2100, skyLightPercent: 70, tint: '#102132', overlayAlpha: 0.34 },
  { id: 'dawn', label: '破晓', startTick: 2100, endTick: 2700, skyLightPercent: 90, tint: '#6f88a8', overlayAlpha: 0.16 },
  { id: 'day', label: '白昼', startTick: 2700, endTick: 5400, skyLightPercent: 100, tint: '#f6e7bf', overlayAlpha: 0.02 },
  { id: 'dusk', label: '黄昏', startTick: 5400, endTick: 6000, skyLightPercent: 90, tint: '#9d6e46', overlayAlpha: 0.14 },
  { id: 'first_night', label: '初夜', startTick: 6000, endTick: 6600, skyLightPercent: 80, tint: '#3a4768', overlayAlpha: 0.24 },
  { id: 'night', label: '夜色', startTick: 6600, endTick: 6900, skyLightPercent: 70, tint: '#1f2941', overlayAlpha: 0.32 },
  { id: 'midnight', label: '夜阑', startTick: 6900, endTick: GAME_DAY_TICKS, skyLightPercent: 60, tint: '#111b2d', overlayAlpha: 0.4 },
];

export const DARKNESS_STACK_TO_VISION_MULTIPLIER = [1, 0.9, 0.8, 0.7, 0.6, 0.5] as const;

export const DEFAULT_MAP_TIME_CONFIG: MapTimeConfig = {
  offsetTicks: 0,
  scale: 1,
  light: {
    base: 0,
    timeInfluence: 100,
  },
  palette: {},
};

/** 地形被摧毁后的自动恢复时间（息） */
export const TERRAIN_DESTROYED_RESTORE_TICKS = 7200;

/** 地形恢复受阻时的顺延时间（息） */
export const TERRAIN_RESTORE_RETRY_DELAY_TICKS = 60;

/** 可摧毁地形每息自动恢复比例 */
export const TERRAIN_REGEN_RATE_PER_TICK = 0.001;

/** 死亡等待时间（秒） */
export const DEATH_WAIT_TIME = 10;

/** 断线保留时间（秒） */
export const DISCONNECT_RETAIN_TIME = 120;

/** 复活后 HP 比例 */
export const RESPAWN_HP_RATIO = 0.5;

/** 死亡经验惩罚比例 */
export const DEATH_EXP_PENALTY = 0.1;

/** Redis 落盘间隔（秒） */
export const PERSIST_INTERVAL = 60;

/** 服务端默认端口 */
export const SERVER_PORT = 3000;

// ===== 修仙系统常量 =====

/** 默认背包容量 */
export const DEFAULT_INVENTORY_CAPACITY = 100;

/** 地面物品保留时间（息） */
export const GROUND_ITEM_EXPIRE_TICKS = 7200;

/** 默认六维属性 */
export const DEFAULT_BASE_ATTRS = {
  constitution: 10,
  spirit: 10,
  perception: 10,
  talent: 10,
  comprehension: 10,
  luck: 10,
} as const;

/** 基础最大灵力 */
export const BASE_MAX_QI = 50;

/** 基础物理攻击 */
export const BASE_PHYS_ATK = 10;

/** 基础法术攻击 */
export const BASE_SPELL_ATK = 5;

/** 基础物理防御 */
export const BASE_PHYS_DEF = 0;

/** 基础法术防御 */
export const BASE_SPELL_DEF = 0;

/** 基础命中 */
export const BASE_HIT = 0;

/** 基础灵力输出速率 */
export const BASE_MAX_QI_OUTPUT_PER_TICK = 10;

/** 基础生命自动回复（万分比） */
export const BASE_HP_REGEN_RATE = 50;

/** 基础灵力自动回复（万分比） */
export const BASE_QI_REGEN_RATE = 50;

/** 体质 → 最大HP 系数 */
export const HP_PER_CONSTITUTION = 10;

/** 基础最大HP */
export const BASE_MAX_HP = 100;

type AttrPercentStatKey = 'maxHp' | 'maxQi' | 'physAtk' | 'spellAtk';

/** 六维提供的原始点数加成 */
export const ATTR_TO_NUMERIC_WEIGHTS: Record<AttrKey, PartialNumericStats> = {
  constitution: {
    physDef: 1,
  },
  spirit: {
    spellDef: 1,
  },
  perception: {
    hit: 1,
    dodge: 1,
    moveSpeed: 1,
  },
  talent: {
    resolvePower: 1,
  },
  comprehension: {
    playerExpRate: 100,
    techniqueExpRate: 100,
    auraPowerRate: 100,
    breakPower: 1,
  },
  luck: {
    crit: 1,
    hit: 1,
    dodge: 1,
    lootRate: 100,
  },
};

/** 六维提供的百分比加成，按最终汇总值乘算 */
export const ATTR_TO_PERCENT_NUMERIC_WEIGHTS: Record<AttrKey, Partial<Record<AttrPercentStatKey, number>>> = {
  constitution: {
    maxHp: 1,
    physAtk: 1,
  },
  spirit: {
    maxQi: 1,
    spellAtk: 1,
  },
  perception: {},
  talent: {
    maxHp: 1,
    maxQi: 1,
  },
  comprehension: {},
  luck: {},
};

/** 修炼每 tick 获得经验 */
export const CULTIVATE_EXP_PER_TICK = 10;

/** 功法层级经验基准值 */
export const TECHNIQUE_EXP_BASE = 1000;

/** 各品阶功法默认经验倍率基线 */
export const TECHNIQUE_GRADE_EXP_BASE_FACTORS: Record<TechniqueGrade, number> = {
  mortal: 10,
  yellow: 30,
  mystic: 90,
  earth: 270,
  heaven: 810,
  spirit: 2430,
  saint: 7290,
  emperor: 21870,
};

export function scaleTechniqueExp(expFactor: number): number {
  if (expFactor <= 0) return 0;
  return Math.max(0, Math.round(expFactor * TECHNIQUE_EXP_BASE));
}

/** 旧版固定功法经验表，当前内容已按逐层配置为准 */
export const TECHNIQUE_EXP_TABLE: Record<number, number> = {
  0: 100,   // Entry → Minor
  1: 300,   // Minor → Major
  2: 1000,  // Major → Perfection
  3: 0,     // Perfection（满级）
};

type RealmConfig = {
  name: string;
  shortName: string;
  path: 'martial' | 'immortal';
  narrative: string;
  progressToNext: number;
  attrBonus: Partial<Attributes>;
  breakthroughItems: BreakthroughItemRequirement[];
  minTechniqueLevel: number;
  minTechniqueRealm?: TechniqueRealm;
};

/** 默认玩家大境界 */
export const DEFAULT_PLAYER_REALM_STAGE = PlayerRealmStage.Mortal;

/** 玩家大境界顺序 */
export const PLAYER_REALM_ORDER: PlayerRealmStage[] = [
  PlayerRealmStage.Mortal,
  PlayerRealmStage.BodyTempering,
  PlayerRealmStage.BoneForging,
  PlayerRealmStage.Meridian,
  PlayerRealmStage.Innate,
  PlayerRealmStage.QiRefining,
  PlayerRealmStage.Foundation,
];

/** 武道到修仙的大境界配置 */
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
    name: '炼体境',
    shortName: '炼体',
    path: 'martial',
    narrative: '气血打熬周身，筋膜初固，正式迈入武道修行。',
    progressToNext: 120,
    attrBonus: { constitution: 2, perception: 1 },
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
    attrBonus: { constitution: 4, spirit: 1, perception: 2 },
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
    attrBonus: { constitution: 6, spirit: 2, perception: 3, comprehension: 1 },
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
    attrBonus: { constitution: 8, spirit: 4, perception: 4, talent: 2, comprehension: 2 },
    breakthroughItems: [
      { itemId: 'rune_shard', count: 6 },
      { itemId: 'spirit_iron_fragment', count: 4 },
      { itemId: 'valley_core', count: 1 },
    ],
    minTechniqueLevel: 8,
    minTechniqueRealm: TechniqueRealm.Major,
  },
  [PlayerRealmStage.QiRefining]: {
    name: '练气境',
    shortName: '练气',
    path: 'immortal',
    narrative: '可引天地灵机入体，真正踏入修仙序列，功法威能随之跃迁。',
    progressToNext: 520,
    attrBonus: { constitution: 10, spirit: 8, perception: 5, talent: 4, comprehension: 3, luck: 1 },
    breakthroughItems: [
      { itemId: 'blood_feather', count: 6 },
      { itemId: 'demon_wolf_bone', count: 6 },
      { itemId: 'spirit_iron_fragment', count: 6 },
    ],
    minTechniqueLevel: 10,
    minTechniqueRealm: TechniqueRealm.Major,
  },
  [PlayerRealmStage.Foundation]: {
    name: '筑基境',
    shortName: '筑基',
    path: 'immortal',
    narrative: '道基初成，体魄与灵识都进入更高层次，已达当前版本上限。',
    progressToNext: 0,
    attrBonus: { constitution: 14, spirit: 12, perception: 8, talent: 6, comprehension: 5, luck: 2 },
    breakthroughItems: [],
    minTechniqueLevel: 12,
    minTechniqueRealm: TechniqueRealm.Perfection,
  },
};

function makeElementZero() {
  return { metal: 0, wood: 0, water: 0, fire: 0, earth: 0 };
}

function makeRealmNumericTemplate(
  stage: PlayerRealmStage,
  scalar: PartialNumericStats,
  ratioDivisor: number,
): RealmNumericTemplate {
  return {
    stage,
    stats: {
      maxHp: BASE_MAX_HP + (scalar.maxHp ?? 0),
      maxQi: BASE_MAX_QI + (scalar.maxQi ?? 0),
      physAtk: BASE_PHYS_ATK + (scalar.physAtk ?? 0),
      spellAtk: BASE_SPELL_ATK + (scalar.spellAtk ?? 0),
      physDef: BASE_PHYS_DEF + (scalar.physDef ?? 0),
      spellDef: BASE_SPELL_DEF + (scalar.spellDef ?? 0),
      hit: BASE_HIT + (scalar.hit ?? 0),
      dodge: scalar.dodge ?? 0,
      crit: scalar.crit ?? 0,
      critDamage: scalar.critDamage ?? 0,
      breakPower: scalar.breakPower ?? 0,
      resolvePower: scalar.resolvePower ?? 0,
      maxQiOutputPerTick: BASE_MAX_QI_OUTPUT_PER_TICK + (scalar.maxQiOutputPerTick ?? 0),
      qiRegenRate: BASE_QI_REGEN_RATE + (scalar.qiRegenRate ?? 0),
      hpRegenRate: BASE_HP_REGEN_RATE + (scalar.hpRegenRate ?? 0),
      cooldownSpeed: scalar.cooldownSpeed ?? 0,
      auraCostReduce: scalar.auraCostReduce ?? 0,
      auraPowerRate: scalar.auraPowerRate ?? 0,
      playerExpRate: scalar.playerExpRate ?? 0,
      techniqueExpRate: scalar.techniqueExpRate ?? 0,
      realmExpPerTick: scalar.realmExpPerTick ?? 0,
      techniqueExpPerTick: scalar.techniqueExpPerTick ?? 0,
      lootRate: scalar.lootRate ?? 0,
      rareLootRate: scalar.rareLootRate ?? 0,
      viewRange: VIEW_RADIUS + (scalar.viewRange ?? 0),
      moveSpeed: scalar.moveSpeed ?? 0,
      elementDamageBonus: { ...makeElementZero(), ...(scalar.elementDamageBonus ?? {}) },
      elementDamageReduce: { ...makeElementZero(), ...(scalar.elementDamageReduce ?? {}) },
    },
    ratioDivisors: {
      dodge: ratioDivisor,
      crit: ratioDivisor,
      breakPower: ratioDivisor,
      resolvePower: ratioDivisor,
      cooldownSpeed: ratioDivisor,
      moveSpeed: ratioDivisor,
      elementDamageReduce: {
        metal: ratioDivisor,
        wood: ratioDivisor,
        water: ratioDivisor,
        fire: ratioDivisor,
        earth: ratioDivisor,
      },
    },
  };
}

/** 按境界提供的具体属性基准与 RatioValue 基数 */
export const PLAYER_REALM_NUMERIC_TEMPLATES: Record<PlayerRealmStage, RealmNumericTemplate> = {
  [PlayerRealmStage.Mortal]: makeRealmNumericTemplate(PlayerRealmStage.Mortal, {}, 100),
  [PlayerRealmStage.BodyTempering]: makeRealmNumericTemplate(PlayerRealmStage.BodyTempering, {
    maxHp: 20,
    physAtk: 2,
    physDef: 2,
    hpRegenRate: 10,
  }, 120),
  [PlayerRealmStage.BoneForging]: makeRealmNumericTemplate(PlayerRealmStage.BoneForging, {
    maxHp: 45,
    maxQi: 10,
    physAtk: 4,
    physDef: 4,
    spellDef: 2,
    maxQiOutputPerTick: 2,
    hpRegenRate: 20,
  }, 150),
  [PlayerRealmStage.Meridian]: makeRealmNumericTemplate(PlayerRealmStage.Meridian, {
    maxHp: 80,
    maxQi: 25,
    physAtk: 6,
    spellAtk: 4,
    physDef: 6,
    spellDef: 5,
    hit: 4,
    maxQiOutputPerTick: 4,
    qiRegenRate: 20,
    hpRegenRate: 25,
    cooldownSpeed: 4,
  }, 190),
  [PlayerRealmStage.Innate]: makeRealmNumericTemplate(PlayerRealmStage.Innate, {
    maxHp: 130,
    maxQi: 45,
    physAtk: 10,
    spellAtk: 8,
    physDef: 10,
    spellDef: 8,
    hit: 8,
    dodge: 4,
    crit: 4,
    breakPower: 4,
    resolvePower: 4,
    maxQiOutputPerTick: 8,
    qiRegenRate: 30,
    hpRegenRate: 30,
    cooldownSpeed: 8,
  }, 240),
  [PlayerRealmStage.QiRefining]: makeRealmNumericTemplate(PlayerRealmStage.QiRefining, {
    maxHp: 190,
    maxQi: 90,
    physAtk: 14,
    spellAtk: 16,
    physDef: 14,
    spellDef: 15,
    hit: 12,
    dodge: 6,
    crit: 6,
    critDamage: 100,
    breakPower: 6,
    resolvePower: 6,
    maxQiOutputPerTick: 14,
    qiRegenRate: 45,
    hpRegenRate: 35,
    cooldownSpeed: 12,
    auraPowerRate: 50,
  }, 300),
  [PlayerRealmStage.Foundation]: makeRealmNumericTemplate(PlayerRealmStage.Foundation, {
    maxHp: 270,
    maxQi: 150,
    physAtk: 22,
    spellAtk: 24,
    physDef: 22,
    spellDef: 22,
    hit: 18,
    dodge: 10,
    crit: 10,
    critDamage: 200,
    breakPower: 10,
    resolvePower: 10,
    maxQiOutputPerTick: 24,
    qiRegenRate: 60,
    hpRegenRate: 45,
    cooldownSpeed: 18,
    auraPowerRate: 100,
    viewRange: 1,
  }, 380),
};

/** 装备槽位列表 */
export const EQUIP_SLOTS = ['weapon', 'head', 'body', 'legs', 'accessory'] as const;
