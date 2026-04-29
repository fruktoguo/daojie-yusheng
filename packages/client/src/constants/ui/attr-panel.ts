/**
 * 属性面板视觉与辅助常量。
 * 这里集中定义 tab 标签、颜色方案、提示 tooltip 细化文案等页面级常量，便于统一管理和未来扩展。
 */
import { NumericStats, PlayerSpecialStats } from '@mud/shared';

/** AttrTab：属性面板分页标识。 */
export type AttrTab = 'base' | 'root' | 'vein' | 'combat' | 'qi' | 'special' | 'craft';
/** NumericCardKey：属性面板数值条目键。 */
export type NumericCardKey = Exclude<keyof NumericStats, 'elementDamageBonus' | 'elementDamageReduce'>;
/** PlayerSpecialCardKey：玩家特殊属性条目键。 */
export type PlayerSpecialCardKey = keyof PlayerSpecialStats;

export const ATTR_TAB_LABELS: Record<AttrTab, string> = {
  base: '六维',
  root: '灵根',
  vein: '灵脉',
  combat: '斗法',
  qi: '灵力',
  special: '特殊',
  craft: '技艺',
};

export const ATTR_COLORS = ['#ff8a65', '#ffd54f', '#4fc3f7', '#4db6ac', '#ba68c8', '#f06292'];
export const ELEMENT_COLORS = ['#f9a825', '#7cb342', '#039be5', '#e53935', '#6d4c41'];

/** TOOLTIP_STYLE_ID：提示样式ID。 */
export const TOOLTIP_STYLE_ID = 'attr-panel-tooltip-style';

export const RATE_BP_KEYS = new Set<NumericCardKey>([
  'qiRegenRate',
  'hpRegenRate',
  'auraCostReduce',
  'auraPowerRate',
  'playerExpRate',
  'techniqueExpRate',
  'lootRate',
  'rareLootRate',
]);

export const NUMERIC_TOOLTIP_LABELS: Partial<Record<NumericCardKey, string>> = {
  maxHp: '最大生命值',
  maxQi: '最大灵力值',
  physAtk: '物理攻击',
  spellAtk: '法术攻击',
  physDef: '物理防御',
  spellDef: '法术防御',
  hit: '命中',
  dodge: '闪避',
  crit: '暴击',
  antiCrit: '免爆',
  critDamage: '暴击伤害',
  breakPower: '破招',
  resolvePower: '化解',
  maxQiOutputPerTick: '灵力输出速率',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '光环消耗缩减',
  auraPowerRate: '光环效果增强',
  playerExpRate: '境界修为',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界修为',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  moveSpeed: '移动速度',
  viewRange: '视野范围',
  actionsPerTurn: '每回合行动次数',
};

export const NUMERIC_TOOLTIP_DESCRIPTIONS: Partial<Record<NumericCardKey, string>> = {
  maxHp: '决定你在战斗中的生存上限。',
  maxQi: '决定你可承载的灵力总量。',
  physAtk: '影响物理系技能；普通攻击会取物理攻击与法术攻击中的较高值结算。',
  spellAtk: '影响法术系技能与灵术伤害；普通攻击会取物理攻击与法术攻击中的较高值结算。',
  physDef: '降低受到的物理伤害，化解触发时会按双倍防御重新计算减伤。',
  spellDef: '降低受到的法术伤害，化解触发时会按双倍防御重新计算减伤。',
  hit: '提高攻击命中目标的能力。',
  dodge: '提高闪避攻击的概率。',
  crit: '提高暴击触发概率。',
  antiCrit: '压低对手对你造成暴击的概率。',
  critDamage: '决定暴击命中后的伤害倍率。',
  breakPower: '压低目标化解概率；超出目标化解的部分会按概率触发破招，使本次命中与暴击判定翻倍。',
  resolvePower: '提高化解来招的概率；化解触发时会按双倍防御重新结算本次减伤。',
  maxQiOutputPerTick: '限制每息可稳定输出的灵力上限。',
  qiRegenRate: '决定每息自动回复的灵力比例。',
  hpRegenRate: '决定每息自动回复的生命比例。',
  cooldownSpeed: '提高技能与效果的冷却流转速度。',
  auraCostReduce: '降低光环或阵法持续消耗。',
  auraPowerRate: '提高光环或阵法提供的效果。',
  playerExpRate: '提高境界修为获取效率。',
  techniqueExpRate: '提高功法经验获取效率。',
  realmExpPerTick: '决定修炼状态下每息获得的境界修为。',
  techniqueExpPerTick: '决定修炼状态下每息获得的功法经验基础值。',
  lootRate: '提高常规掉落收益。',
  rareLootRate: '提高稀有掉落收益。',
  moveSpeed: '决定每息获得的移动预算。大路、小路、草地、泥地与沼泽会按不同消耗结算，因此地形会直接影响赶路效率。',
  viewRange: '决定地图上的可见范围。',
  actionsPerTurn: '决定每回合最多可以执行的战斗行动次数。',
};

export const PLAYER_SPECIAL_TOOLTIP_LABELS: Record<PlayerSpecialCardKey, string> = {
  foundation: '底蕴',
  rootFoundation: '根基',
  combatExp: '战斗经验',
  comprehension: '悟性',
  luck: '幸运',
};

export const PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS: Record<PlayerSpecialCardKey, string> = {
  foundation: '在能够获得境界修为时，优先把本次境界修为抬高到三倍上限；实际额外补上的部分会等量消耗底蕴。',
  rootFoundation: '每点根基提供 1% 六维境界乘区，可在境界圆满时消耗当前境界整条修为和对应材料凝练。',
  combatExp: '通过战斗获得的境界修为会一比一累计到战斗经验，并按双方差距影响攻击时的命中、受击时的闪避（两者最高翻倍），以及普通攻击 50% 到 200% 的独立伤害乘区。',
  comprehension: '提高境界修为与功法经验获取；不作为六维参与基础属性换算。',
  luck: '提高常规掉落与稀有掉落收益；不再提供命中、闪避、暴击等战斗属性。',
};
