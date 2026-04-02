import type { ElementKey, NumericScalarStatKey } from '../../numeric';
import { Direction, TechniqueRealm, TileType } from '../../types';
import { HOUSE_DECOR_TILE_LABELS } from '../gameplay/house-terrain';
import type {
  ActionType,
  AttrKey,
  EntityKind,
  EquipSlot,
  ItemType,
  MapMinimapMarkerKind,
  MonsterTier,
  QuestLine,
  QuestObjectiveType,
  QuestStatus,
  SkillFormulaVar,
  TechniqueCategory,
  TechniqueGrade,
} from '../../types';

/**
 * UI 标签映射常量（共享文案层）。
 */

/** 地形类型中文标签 */
export const TILE_TYPE_LABELS: Record<TileType, string> = {
  [TileType.Floor]: '地面',
  [TileType.Road]: '大路',
  [TileType.Trail]: '小路',
  [TileType.Wall]: '墙体',
  [TileType.Door]: '门扉',
  [TileType.Window]: '窗户',
  [TileType.BrokenWindow]: '破窗',
  [TileType.Portal]: '传送阵',
  [TileType.Stairs]: '楼梯',
  [TileType.Grass]: '草地',
  [TileType.Hill]: '山地',
  [TileType.Cliff]: '山崖',
  [TileType.Mud]: '泥地',
  [TileType.Swamp]: '沼泽',
  [TileType.Water]: '水域',
  [TileType.Cloud]: '云墙',
  [TileType.CloudFloor]: '云地',
  [TileType.Void]: '虚空',
  [TileType.Tree]: '树木',
  [TileType.Bamboo]: '竹林',
  [TileType.Stone]: '岩石',
  [TileType.SpiritOre]: '灵石矿',
  [TileType.BlackIronOre]: '玄铁矿',
  [TileType.BrokenSwordHeap]: '断剑堆',
  ...HOUSE_DECOR_TILE_LABELS,
};

/** 六维属性中文标签 */
export const ATTR_KEY_LABELS: Record<AttrKey, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
  comprehension: '悟性',
  luck: '气运',
};

/** 五行属性中文标签 */
export const ELEMENT_KEY_LABELS: Record<ElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

/** 标量数值属性中文标签 */
export const NUMERIC_SCALAR_STAT_LABELS: Record<NumericScalarStatKey, string> = {
  maxHp: '最大生命',
  maxQi: '最大灵力',
  physAtk: '物理攻击',
  spellAtk: '法术攻击',
  physDef: '物理防御',
  spellDef: '法术防御',
  hit: '命中',
  dodge: '闪避',
  crit: '暴击',
  critDamage: '暴击伤害',
  breakPower: '破招',
  resolvePower: '化解',
  maxQiOutputPerTick: '灵力输出',
  qiRegenRate: '灵力回复',
  hpRegenRate: '生命回复',
  cooldownSpeed: '冷却速度',
  auraCostReduce: '灵耗减免',
  auraPowerRate: '术法增幅',
  playerExpRate: '境界修为',
  techniqueExpRate: '功法经验',
  realmExpPerTick: '每息境界修为',
  techniqueExpPerTick: '每息功法经验',
  lootRate: '掉落增幅',
  rareLootRate: '稀有掉落',
  viewRange: '视野',
  moveSpeed: '移动速度',
  extraAggroRate: '额外仇恨值',
};

/** 实体类型中文标签 */
export const ENTITY_KIND_LABELS: Record<EntityKind | 'player', string> = {
  player: '修士',
  monster: '妖兽',
  npc: '人物',
  container: '容器',
  crowd: '人群',
};

/** 妖兽血脉层次中文标签 */
export const MONSTER_TIER_LABELS: Record<MonsterTier, string> = {
  mortal_blood: '凡血',
  variant: '异种',
  demon_king: '妖王',
};

/** 小地图标记类型中文标签 */
export const MAP_MINIMAP_MARKER_KIND_LABELS: Record<MapMinimapMarkerKind, string> = {
  landmark: '地标',
  container: '容器',
  npc: '人物',
  monster_spawn: '怪物',
  portal: '传送',
  stairs: '楼梯',
};

/** 方向中文标签 */
export const DIRECTION_LABELS: Record<Direction, string> = {
  [Direction.North]: '北',
  [Direction.South]: '南',
  [Direction.East]: '东',
  [Direction.West]: '西',
};

/** 行动类型中文标签 */
export const ACTION_TYPE_LABELS: Record<ActionType, string> = {
  skill: '技能',
  gather: '采集',
  interact: '交互',
  quest: '任务',
  toggle: '行动',
  battle: '战斗',
  travel: '传送',
  breakthrough: '突破',
};

/** 物品类型中文标签 */
export const ITEM_TYPE_LABELS: Record<ItemType, string> = {
  consumable: '消耗品',
  equipment: '装备',
  material: '材料',
  quest_item: '任务物',
  skill_book: '功法书',
};

/** 装备槽位中文标签 */
export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  weapon: '武器',
  head: '头部',
  body: '身体',
  legs: '腿部',
  accessory: '饰品',
};

/** 功法品阶中文标签 */
export const TECHNIQUE_GRADE_LABELS: Record<TechniqueGrade, string> = {
  mortal: '凡阶',
  yellow: '黄阶',
  mystic: '玄阶',
  earth: '地阶',
  heaven: '天阶',
  spirit: '灵阶',
  saint: '圣阶',
  emperor: '帝阶',
};

/** 功法分类中文标签 */
export const TECHNIQUE_CATEGORY_LABELS: Record<TechniqueCategory, string> = {
  arts: '术法',
  internal: '内功',
  divine: '神通',
  secret: '秘术',
};

/** 任务状态中文标签 */
export const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  available: '可接取',
  active: '进行中',
  ready: '可交付',
  completed: '已完成',
};

/** 任务线中文标签 */
export const QUEST_LINE_LABELS: Record<QuestLine, string> = {
  main: '主线',
  side: '支线',
  daily: '日常',
  encounter: '奇遇',
};

/** 任务目标类型中文标签 */
export const QUEST_OBJECTIVE_TYPE_LABELS: Record<QuestObjectiveType, string> = {
  kill: '击杀目标',
  talk: '对话送信',
  submit_item: '提交物品',
  learn_technique: '习得功法',
  realm_progress: '境界推进',
  realm_stage: '境界阶段',
};

/** 功法境界中文标签 */
export const TECHNIQUE_REALM_LABELS: Record<TechniqueRealm, string> = {
  [TechniqueRealm.Entry]: '入门',
  [TechniqueRealm.Minor]: '小成',
  [TechniqueRealm.Major]: '大成',
  [TechniqueRealm.Perfection]: '圆满',
};

/** 技能公式基础变量中文标签（不含动态 caster/target.stat 与 buff 层数字段） */
export const SKILL_FORMULA_BASE_VAR_LABELS: Partial<Record<SkillFormulaVar, string>> = {
  techLevel: '功法层数',
  targetCount: '目标数量',
  'caster.hp': '自身当前生命',
  'caster.maxHp': '自身最大生命',
  'caster.qi': '自身当前灵力',
  'caster.maxQi': '自身最大灵力',
  'caster.attr.constitution': '自身体魄',
  'caster.attr.spirit': '自身神识',
  'caster.attr.perception': '自身感知',
  'caster.attr.talent': '自身根骨',
  'caster.attr.comprehension': '自身悟性',
  'caster.attr.luck': '自身福缘',
  'target.hp': '目标当前生命',
  'target.maxHp': '目标最大生命',
  'target.qi': '目标当前灵力',
  'target.maxQi': '目标最大灵力',
  'target.attr.constitution': '目标体魄',
  'target.attr.spirit': '目标神识',
  'target.attr.perception': '目标感知',
  'target.attr.talent': '目标根骨',
  'target.attr.comprehension': '目标悟性',
  'target.attr.luck': '目标福缘',
};
