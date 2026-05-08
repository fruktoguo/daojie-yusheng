/**
 * 属性面板视觉与辅助常量。
 * 这里集中定义 tab 标签、颜色方案、提示 tooltip 细化文案等页面级常量，便于统一管理和未来扩展。
 */
import { NumericStats, PlayerSpecialStats } from '@mud/shared';
import { t } from '../../ui/i18n';

function attrText(key: string): string {
  return t(key);
}

/** AttrTab：属性面板分页标识。 */
export type AttrTab = 'base' | 'root' | 'vein' | 'combat' | 'qi' | 'special' | 'craft';
/** NumericCardKey：属性面板数值条目键。 */
export type NumericCardKey = Exclude<keyof NumericStats, 'elementDamageBonus' | 'elementDamageReduce'>;
/** PlayerSpecialCardKey：玩家特殊属性条目键。 */
export type PlayerSpecialCardKey = Exclude<keyof PlayerSpecialStats, 'bodyTrainingLevel'>;

export const ATTR_TAB_LABELS: Record<AttrTab, string> = {
  base: attrText('attr.tab.base'),
  root: attrText('attr.tab.root'),
  vein: attrText('attr.tab.vein'),
  combat: attrText('attr.tab.combat'),
  qi: attrText('attr.tab.qi'),
  special: attrText('attr.tab.special'),
  craft: attrText('attr.tab.craft'),
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
  maxHp: attrText('attr.numeric.max-hp.label'),
  maxQi: attrText('attr.numeric.max-qi.label'),
  physAtk: attrText('attr.numeric.phys-atk.label'),
  spellAtk: attrText('attr.numeric.spell-atk.label'),
  physDef: attrText('attr.numeric.phys-def.label'),
  spellDef: attrText('attr.numeric.spell-def.label'),
  hit: attrText('attr.numeric.hit.label'),
  dodge: attrText('attr.numeric.dodge.label'),
  crit: attrText('attr.numeric.crit.label'),
  antiCrit: attrText('attr.numeric.anti-crit.label'),
  critDamage: attrText('attr.numeric.crit-damage.label'),
  breakPower: attrText('attr.numeric.break-power.label'),
  resolvePower: attrText('attr.numeric.resolve-power.label'),
  maxQiOutputPerTick: attrText('attr.numeric.max-qi-output-per-tick.label'),
  qiRegenRate: attrText('attr.numeric.qi-regen-rate.label'),
  hpRegenRate: attrText('attr.numeric.hp-regen-rate.label'),
  cooldownSpeed: attrText('attr.numeric.cooldown-speed.label'),
  auraCostReduce: attrText('attr.numeric.aura-cost-reduce.label'),
  auraPowerRate: attrText('attr.numeric.aura-power-rate.label'),
  playerExpRate: attrText('attr.numeric.player-exp-rate.label'),
  techniqueExpRate: attrText('attr.numeric.technique-exp-rate.label'),
  realmExpPerTick: attrText('attr.numeric.realm-exp-per-tick.label'),
  techniqueExpPerTick: attrText('attr.numeric.technique-exp-per-tick.label'),
  lootRate: attrText('attr.numeric.loot-rate.label'),
  rareLootRate: attrText('attr.numeric.rare-loot-rate.label'),
  moveSpeed: attrText('attr.numeric.move-speed.label'),
  viewRange: attrText('attr.numeric.view-range.label'),
  actionsPerTurn: attrText('attr.numeric.actions-per-turn.label'),
};

export const NUMERIC_TOOLTIP_DESCRIPTIONS: Partial<Record<NumericCardKey, string>> = {
  maxHp: attrText('attr.numeric.max-hp.desc'),
  maxQi: attrText('attr.numeric.max-qi.desc'),
  physAtk: attrText('attr.numeric.phys-atk.desc'),
  spellAtk: attrText('attr.numeric.spell-atk.desc'),
  physDef: attrText('attr.numeric.phys-def.desc'),
  spellDef: attrText('attr.numeric.spell-def.desc'),
  hit: attrText('attr.numeric.hit.desc'),
  dodge: attrText('attr.numeric.dodge.desc'),
  crit: attrText('attr.numeric.crit.desc'),
  antiCrit: attrText('attr.numeric.anti-crit.desc'),
  critDamage: attrText('attr.numeric.crit-damage.desc'),
  breakPower: attrText('attr.numeric.break-power.desc'),
  resolvePower: attrText('attr.numeric.resolve-power.desc'),
  maxQiOutputPerTick: attrText('attr.numeric.max-qi-output-per-tick.desc'),
  qiRegenRate: attrText('attr.numeric.qi-regen-rate.desc'),
  hpRegenRate: attrText('attr.numeric.hp-regen-rate.desc'),
  cooldownSpeed: attrText('attr.numeric.cooldown-speed.desc'),
  auraCostReduce: attrText('attr.numeric.aura-cost-reduce.desc'),
  auraPowerRate: attrText('attr.numeric.aura-power-rate.desc'),
  playerExpRate: attrText('attr.numeric.player-exp-rate.desc'),
  techniqueExpRate: attrText('attr.numeric.technique-exp-rate.desc'),
  realmExpPerTick: attrText('attr.numeric.realm-exp-per-tick.desc'),
  techniqueExpPerTick: attrText('attr.numeric.technique-exp-per-tick.desc'),
  lootRate: attrText('attr.numeric.loot-rate.desc'),
  rareLootRate: attrText('attr.numeric.rare-loot-rate.desc'),
  moveSpeed: attrText('attr.numeric.move-speed.desc'),
  viewRange: attrText('attr.numeric.view-range.desc'),
  actionsPerTurn: attrText('attr.numeric.actions-per-turn.desc'),
};

export const PLAYER_SPECIAL_TOOLTIP_LABELS: Record<PlayerSpecialCardKey, string> = {
  foundation: attrText('attr.special.foundation.label'),
  rootFoundation: attrText('attr.special.root-foundation.label'),
  combatExp: attrText('attr.special.combat-exp.label'),
  comprehension: attrText('attr.special.comprehension.label'),
  luck: attrText('attr.special.luck.label'),
};

export const PLAYER_SPECIAL_TOOLTIP_DESCRIPTIONS: Record<PlayerSpecialCardKey, string> = {
  foundation: attrText('attr.special.foundation.desc'),
  rootFoundation: attrText('attr.special.root-foundation.desc'),
  combatExp: attrText('attr.special.combat-exp.desc'),
  comprehension: attrText('attr.special.comprehension.desc'),
  luck: attrText('attr.special.luck.desc'),
};

export type NumericCardIconAtlasCell = {
  col: number;
  row: number;
};

export const ATTR_ICON_ATLAS_COLUMNS = 8;
export const ATTR_ICON_ATLAS_ROWS = 7;

export const ATTR_ICON_ATLAS_CELLS: Record<string, NumericCardIconAtlasCell> = {
  maxHp: { col: 0, row: 0 },
  maxQi: { col: 1, row: 0 },
  physAtk: { col: 2, row: 0 },
  spellAtk: { col: 3, row: 0 },
  physDef: { col: 4, row: 0 },
  spellDef: { col: 5, row: 0 },
  hit: { col: 6, row: 0 },
  dodge: { col: 7, row: 0 },
  crit: { col: 0, row: 1 },
  antiCrit: { col: 1, row: 1 },
  critDamage: { col: 2, row: 1 },
  breakPower: { col: 3, row: 1 },
  resolvePower: { col: 4, row: 1 },
  maxQiOutputPerTick: { col: 5, row: 1 },
  qiRegenRate: { col: 6, row: 1 },
  hpRegenRate: { col: 7, row: 1 },
  cooldownSpeed: { col: 0, row: 2 },
  lootRate: { col: 1, row: 2 },
  viewRange: { col: 2, row: 2 },
  moveSpeed: { col: 3, row: 2 },
  actionsPerTurn: { col: 4, row: 2 },
  playerExpRate: { col: 5, row: 2 },
  techniqueExpRate: { col: 6, row: 2 },
  realmExpPerTick: { col: 7, row: 2 },
  techniqueExpPerTick: { col: 0, row: 3 },
  rareLootRate: { col: 1, row: 3 },
  foundation: { col: 2, row: 3 },
  rootFoundation: { col: 3, row: 3 },
  combatExp: { col: 4, row: 3 },
  comprehension: { col: 5, row: 3 },
  luck: { col: 6, row: 3 },
  constitution: { col: 7, row: 3 },
  spirit: { col: 0, row: 4 },
  perception: { col: 1, row: 4 },
  talent: { col: 2, row: 4 },
  strength: { col: 3, row: 4 },
  meridians: { col: 4, row: 4 },
  'root-metal': { col: 5, row: 4 },
  'root-wood': { col: 6, row: 4 },
  'root-water': { col: 7, row: 4 },
  'root-fire': { col: 0, row: 5 },
  'root-earth': { col: 1, row: 5 },
  'neutral-aura': { col: 2, row: 5 },
  sha: { col: 3, row: 5 },
  'metal-aura': { col: 4, row: 5 },
  'wood-aura': { col: 5, row: 5 },
  'water-aura': { col: 6, row: 5 },
  'fire-aura': { col: 7, row: 5 },
  'earth-aura': { col: 0, row: 6 },
};
