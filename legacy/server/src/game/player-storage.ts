/**
 * 玩家存档序列化/反序列化 —— 负责将内存中的玩家集合数据（背包、装备、
 * 功法、Buff、任务）与持久化快照格式互相转换。
 * 已知物品/技能走精简快照（仅存 ID），未知的则保留完整字段以防丢失。
 */
import {
  BodyTrainingState,
  DEFAULT_INVENTORY_CAPACITY,
  EQUIP_SLOTS,
  EquipmentSlots,
  EquipSlot,
  Inventory,
  ITEM_TYPES,
  ItemStack,
  ItemType,
  MarketStorage,
  QUEST_OBJECTIVE_TYPE_KEYS,
  QUEST_STATUS_KEYS,
  QuestObjectiveType,
  QuestState,
  QuestStatus,
  SkillDef,
  SkillEffectDef,
  TechniqueCategory,
  TechniqueAttrCurves,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
  TemporaryBuffState,
  WORLD_DARKNESS_BUFF_DURATION,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_TIME_SOURCE_ID,
  normalizeEnhanceLevel,
  normalizeBodyTrainingState,
} from '@mud/shared';
import {
  CULTIVATION_ACTION_ID,
  CULTIVATION_BUFF_ID,
  TECHNIQUE_GRADES,
} from '../constants/gameplay/player-storage';
import {
  GM_WORLD_OBSERVE_BUFF_ID,
  GM_WORLD_OBSERVE_SOURCE_ID,
} from '../constants/gameplay/gm-observe';
import { syncDynamicBuffPresentation } from './buff-presentation';
import { normalizeBuffSustainCost } from './buff-sustain';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { resolveQuestTargetName } from './quest-display';
import {
  dehydrateTemporaryBuff as dehydratePersistedTemporaryBuff,
  hydrateTemporaryBuffSnapshots as hydratePersistedTemporaryBuffSnapshots,
  PersistedTemporaryBuffSnapshot,
} from './temporary-buff-storage';

/** PersistedInventoryItem：定义该接口的能力与字段约束。 */
interface PersistedInventoryItem {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
/** count：定义该变量以承载业务值。 */
  count: number;
  enhanceLevel?: number;
}

/** PersistedEquipmentItem：定义该接口的能力与字段约束。 */
interface PersistedEquipmentItem {
/** itemId：定义该变量以承载业务值。 */
  itemId: string;
  enhanceLevel?: number;
}

/** PersistedTechniqueItem：定义该接口的能力与字段约束。 */
interface PersistedTechniqueItem {
/** techId：定义该变量以承载业务值。 */
  techId: string;
/** level：定义该变量以承载业务值。 */
  level: number;
/** exp：定义该变量以承载业务值。 */
  exp: number;
  expToNext?: number;
  skillsEnabled?: boolean;
}

/** PersistedTemporaryBuffItem：定义该接口的能力与字段约束。 */
interface PersistedTemporaryBuffItem {
/** buffId：定义该变量以承载业务值。 */
  buffId: string;
/** sourceSkillId：定义该变量以承载业务值。 */
  sourceSkillId: string;
  sourceCasterId?: string;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** remainingTicks：定义该变量以承载业务值。 */
  remainingTicks: number;
/** duration：定义该变量以承载业务值。 */
  duration: number;
/** stacks：定义该变量以承载业务值。 */
  stacks: number;
/** maxStacks：定义该变量以承载业务值。 */
  maxStacks: number;
  sustainTicksElapsed?: number;
}

/** PersistedQuestItem：定义该接口的能力与字段约束。 */
interface PersistedQuestItem {
/** id：定义该变量以承载业务值。 */
  id: string;
/** status：定义该变量以承载业务值。 */
  status: QuestStatus;
/** progress：定义该变量以承载业务值。 */
  progress: number;
}

/** PersistedInventoryEntry：定义该类型的结构与数据语义。 */
type PersistedInventoryEntry = PersistedInventoryItem | ItemStack;
/** PersistedEquipmentEntry：定义该类型的结构与数据语义。 */
type PersistedEquipmentEntry = PersistedEquipmentItem | ItemStack;
/** PersistedTechniqueEntry：定义该类型的结构与数据语义。 */
type PersistedTechniqueEntry = PersistedTechniqueItem | TechniqueState;
/** PersistedTemporaryBuffEntry：定义该类型的结构与数据语义。 */
type PersistedTemporaryBuffEntry = PersistedTemporaryBuffItem | TemporaryBuffState;
/** PersistedQuestEntry：定义该类型的结构与数据语义。 */
type PersistedQuestEntry = PersistedQuestItem | QuestState;

/** PersistedInventorySnapshot：定义该接口的能力与字段约束。 */
export interface PersistedInventorySnapshot {
/** capacity：定义该变量以承载业务值。 */
  capacity: number;
/** items：定义该变量以承载业务值。 */
  items: PersistedInventoryEntry[];
}

/** PersistedEquipmentSnapshot：定义该类型的结构与数据语义。 */
export type PersistedEquipmentSnapshot = Record<EquipSlot, PersistedEquipmentEntry | null>;

/** 持久化后的玩家集合数据（背包、装备、功法、Buff、任务） */
export interface PersistedPlayerCollections {
/** inventory：定义该变量以承载业务值。 */
  inventory: PersistedInventorySnapshot;
/** marketStorage：定义该变量以承载业务值。 */
  marketStorage: PersistedInventorySnapshot;
/** equipment：定义该变量以承载业务值。 */
  equipment: PersistedEquipmentSnapshot;
/** techniques：定义该变量以承载业务值。 */
  techniques: PersistedTechniqueEntry[];
/** bodyTraining：定义该变量以承载业务值。 */
  bodyTraining: BodyTrainingState;
/** temporaryBuffs：定义该变量以承载业务值。 */
  temporaryBuffs: PersistedTemporaryBuffSnapshot[];
/** quests：定义该变量以承载业务值。 */
  quests: PersistedQuestEntry[];
}

/** PlayerStorageState：定义该接口的能力与字段约束。 */
interface PlayerStorageState {
/** inventory：定义该变量以承载业务值。 */
  inventory: Inventory;
  marketStorage?: MarketStorage;
/** equipment：定义该变量以承载业务值。 */
  equipment: EquipmentSlots;
/** techniques：定义该变量以承载业务值。 */
  techniques: TechniqueState[];
  bodyTraining?: BodyTrainingState;
  temporaryBuffs?: TemporaryBuffState[];
/** quests：定义该变量以承载业务值。 */
  quests: QuestState[];
}

/** isQuestStatus：执行对应的业务逻辑。 */
function isQuestStatus(value: unknown): value is QuestStatus {
  return typeof value === 'string' && QUEST_STATUS_KEYS.includes(value as QuestStatus);
}

/** isQuestObjectiveType：执行对应的业务逻辑。 */
function isQuestObjectiveType(value: unknown): value is QuestObjectiveType {
  return typeof value === 'string' && QUEST_OBJECTIVE_TYPE_KEYS.includes(value as QuestObjectiveType);
}

/** isPlainObject：执行对应的业务逻辑。 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** normalizePositiveInt：执行对应的业务逻辑。 */
function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

/** normalizeNonNegativeInt：执行对应的业务逻辑。 */
function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

/** isTransientGmObserveBuff：执行对应的业务逻辑。 */
function isTransientGmObserveBuff(buffId: string, sourceSkillId: string): boolean {
  return buffId === GM_WORLD_OBSERVE_BUFF_ID && sourceSkillId === GM_WORLD_OBSERVE_SOURCE_ID;
}

/** isItemType：执行对应的业务逻辑。 */
function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && ITEM_TYPES.includes(value as ItemType);
}

/** isEquipSlot：执行对应的业务逻辑。 */
function isEquipSlot(value: unknown): value is EquipSlot {
  return typeof value === 'string' && EQUIP_SLOTS.includes(value as EquipSlot);
}

/** isTechniqueRealm：执行对应的业务逻辑。 */
function isTechniqueRealm(value: unknown): value is TechniqueRealm {
  return typeof value === 'number'
    && (value === TechniqueRealm.Entry || value === TechniqueRealm.Minor || value === TechniqueRealm.Major || value === TechniqueRealm.Perfection);
}

/** isTechniqueGrade：执行对应的业务逻辑。 */
function isTechniqueGrade(value: unknown): value is TechniqueGrade {
  return typeof value === 'string' && TECHNIQUE_GRADES.includes(value as TechniqueGrade);
}

/** isTechniqueCategory：执行对应的业务逻辑。 */
function isTechniqueCategory(value: unknown): value is TechniqueCategory {
  return value === 'arts' || value === 'internal' || value === 'divine' || value === 'secret';
}

/** hydrateItemStack：执行对应的业务逻辑。 */
function hydrateItemStack(snapshot: unknown, contentService: ContentService, countOverride?: number): ItemStack | null {
  if (!isPlainObject(snapshot) || typeof snapshot.itemId !== 'string' || snapshot.itemId.length === 0) {
    return null;
  }

/** count：定义该变量以承载业务值。 */
  const count = countOverride ?? normalizePositiveInt(snapshot.count, 1);
/** hydrated：定义该变量以承载业务值。 */
  const hydrated = contentService.createItem(snapshot.itemId, count);
  if (hydrated) {
    return contentService.normalizeItemStack({
      ...hydrated,
      enhanceLevel: normalizeEnhanceLevel(snapshot.enhanceLevel),
    });
  }

  return {
    itemId: snapshot.itemId,
/** name：定义该变量以承载业务值。 */
    name: typeof snapshot.name === 'string' && snapshot.name.length > 0 ? snapshot.name : snapshot.itemId,
    type: isItemType(snapshot.type) ? snapshot.type : 'material',
    count,
/** desc：定义该变量以承载业务值。 */
    desc: typeof snapshot.desc === 'string' ? snapshot.desc : '',
/** groundLabel：定义该变量以承载业务值。 */
    groundLabel: typeof snapshot.groundLabel === 'string' && snapshot.groundLabel.length > 0 ? snapshot.groundLabel : undefined,
    grade: isTechniqueGrade(snapshot.grade) ? snapshot.grade : undefined,
    level: Number.isFinite(snapshot.level) ? Math.max(1, Math.floor(Number(snapshot.level))) : undefined,
    equipSlot: isEquipSlot(snapshot.equipSlot) ? snapshot.equipSlot : undefined,
    equipAttrs: isPlainObject(snapshot.equipAttrs) ? snapshot.equipAttrs as ItemStack['equipAttrs'] : undefined,
    equipStats: isPlainObject(snapshot.equipStats) ? snapshot.equipStats as ItemStack['equipStats'] : undefined,
    effects: Array.isArray(snapshot.effects) ? snapshot.effects as ItemStack['effects'] : undefined,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : undefined,
    enhanceLevel: normalizeEnhanceLevel(snapshot.enhanceLevel),
  };
}

/** dehydrateInventoryItem：执行对应的业务逻辑。 */
function dehydrateInventoryItem(item: ItemStack, contentService: ContentService): PersistedInventoryEntry {
/** count：定义该变量以承载业务值。 */
  const count = normalizePositiveInt(item.count, 1);
  if (contentService.getItem(item.itemId)) {
/** enhanceLevel：定义该变量以承载业务值。 */
    const enhanceLevel = normalizeEnhanceLevel(item.enhanceLevel);
    return enhanceLevel > 0
      ? { itemId: item.itemId, count, enhanceLevel }
      : { itemId: item.itemId, count };
  }
  return { ...item, count };
}

/** dehydrateEquipmentItem：执行对应的业务逻辑。 */
function dehydrateEquipmentItem(item: ItemStack, contentService: ContentService): PersistedEquipmentEntry {
  if (contentService.getItem(item.itemId)) {
/** enhanceLevel：定义该变量以承载业务值。 */
    const enhanceLevel = normalizeEnhanceLevel(item.enhanceLevel);
    return enhanceLevel > 0
      ? { itemId: item.itemId, enhanceLevel }
      : { itemId: item.itemId };
  }
  return { ...item, count: 1 };
}

/** hydrateTechnique：执行对应的业务逻辑。 */
function hydrateTechnique(snapshot: unknown): TechniqueState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.techId !== 'string' || snapshot.techId.length === 0) {
    return null;
  }

  return {
    ...snapshot,
    techId: snapshot.techId,
/** name：定义该变量以承载业务值。 */
    name: typeof snapshot.name === 'string' && snapshot.name.length > 0 ? snapshot.name : snapshot.techId,
    level: normalizePositiveInt(snapshot.level, 1),
    exp: normalizeNonNegativeInt(snapshot.exp, 0),
    expToNext: normalizeNonNegativeInt(snapshot.expToNext, 0),
    realmLv: normalizePositiveInt(snapshot.realmLv, 1),
    realm: isTechniqueRealm(snapshot.realm) ? snapshot.realm : TechniqueRealm.Entry,
    skills: Array.isArray(snapshot.skills) ? snapshot.skills as SkillDef[] : [],
/** skillsEnabled：定义该变量以承载业务值。 */
    skillsEnabled: snapshot.skillsEnabled !== false,
    grade: isTechniqueGrade(snapshot.grade) ? snapshot.grade : undefined,
    category: isTechniqueCategory(snapshot.category) ? snapshot.category : undefined,
    layers: Array.isArray(snapshot.layers) ? snapshot.layers as TechniqueLayerDef[] : undefined,
    attrCurves: isPlainObject(snapshot.attrCurves) ? snapshot.attrCurves as TechniqueAttrCurves : undefined,
  };
}

/** dehydrateTechnique：执行对应的业务逻辑。 */
function dehydrateTechnique(technique: TechniqueState, contentService: ContentService): PersistedTechniqueEntry {
/** level：定义该变量以承载业务值。 */
  const level = normalizePositiveInt(technique.level, 1);
/** exp：定义该变量以承载业务值。 */
  const exp = normalizeNonNegativeInt(technique.exp, 0);
/** expToNext：定义该变量以承载业务值。 */
  const expToNext = normalizeNonNegativeInt(technique.expToNext, 0);
  if (contentService.getTechnique(technique.techId)) {
    return {
      techId: technique.techId,
      level,
      exp,
      expToNext,
      ...(technique.skillsEnabled === false ? { skillsEnabled: false } : {}),
    };
  }
  return {
    ...technique,
    level,
    exp,
    expToNext,
  };
}

/** normalizeBuffShortMark：执行对应的业务逻辑。 */
function normalizeBuffShortMark(effect: Extract<SkillEffectDef, { type: 'buff' }>): string {
/** raw：定义该变量以承载业务值。 */
  const raw = effect.shortMark?.trim();
  if (raw) {
    return [...raw][0] ?? raw;
  }
/** fallback：定义该变量以承载业务值。 */
  const fallback = [...effect.name.trim()][0];
  return fallback ?? '气';
}

/** buildSkillBuffState：执行对应的业务逻辑。 */
function buildSkillBuffState(skill: SkillDef, effect: Extract<SkillEffectDef, { type: 'buff' }>, snapshot: PersistedTemporaryBuffItem): TemporaryBuffState {
  return syncDynamicBuffPresentation({
    buffId: effect.buffId,
    name: effect.name,
    desc: effect.desc,
    baseDesc: effect.desc,
    shortMark: normalizeBuffShortMark(effect),
/** category：定义该变量以承载业务值。 */
    category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
    visibility: effect.visibility ?? 'public',
    remainingTicks: normalizePositiveInt(snapshot.remainingTicks, Math.max(1, effect.duration)),
    duration: normalizePositiveInt(snapshot.duration, Math.max(1, effect.duration)),
    stacks: normalizePositiveInt(snapshot.stacks, 1),
    maxStacks: normalizePositiveInt(snapshot.maxStacks, Math.max(1, effect.maxStacks ?? 1)),
    sourceSkillId: skill.id,
/** sourceCasterId：定义该变量以承载业务值。 */
    sourceCasterId: typeof snapshot.sourceCasterId === 'string' && snapshot.sourceCasterId.length > 0 ? snapshot.sourceCasterId : undefined,
    sourceSkillName: skill.name,
    realmLv: normalizePositiveInt(snapshot.realmLv, 1),
    color: effect.color,
    attrs: effect.attrs,
    attrMode: effect.attrMode,
    stats: effect.stats,
    statMode: effect.statMode,
    qiProjection: effect.qiProjection,
    presentationScale: effect.presentationScale,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: effect.infiniteDuration === true,
    sustainCost: effect.sustainCost,
    sustainTicksElapsed: effect.sustainCost ? normalizeNonNegativeInt(snapshot.sustainTicksElapsed, 0) : undefined,
    expireWithBuffId: effect.expireWithBuffId,
  });
}

/** buildSystemBuffState：执行对应的业务逻辑。 */
function buildSystemBuffState(snapshot: PersistedTemporaryBuffItem): TemporaryBuffState | null {
  if (snapshot.sourceSkillId === WORLD_TIME_SOURCE_ID && snapshot.buffId === WORLD_DARKNESS_BUFF_ID) {
    return {
      buffId: WORLD_DARKNESS_BUFF_ID,
      name: '夜色压境',
      desc: '夜色会按层数压缩视野；若身处恒明或得以免疫，此压制可被抵消。',
      shortMark: '夜',
      category: 'debuff',
      visibility: 'observe_only',
      remainingTicks: normalizePositiveInt(snapshot.remainingTicks, WORLD_DARKNESS_BUFF_DURATION),
      duration: normalizePositiveInt(snapshot.duration, WORLD_DARKNESS_BUFF_DURATION),
      stacks: normalizePositiveInt(snapshot.stacks, 1),
      maxStacks: normalizePositiveInt(snapshot.maxStacks, 5),
      sourceSkillId: WORLD_TIME_SOURCE_ID,
      sourceSkillName: '天时',
      realmLv: normalizePositiveInt(snapshot.realmLv, 1),
      color: '#89a8c7',
      baseDesc: '夜色会按层数压缩视野；若身处恒明或得以免疫，此压制可被抵消。',
    };
  }

  if (snapshot.sourceSkillId === CULTIVATION_ACTION_ID && snapshot.buffId === CULTIVATION_BUFF_ID) {
    return {
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: '正在运转主修功法，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。',
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      remainingTicks: normalizePositiveInt(snapshot.remainingTicks, 2),
      duration: normalizePositiveInt(snapshot.duration, 1),
      stacks: normalizePositiveInt(snapshot.stacks, 1),
      maxStacks: normalizePositiveInt(snapshot.maxStacks, 1),
      sourceSkillId: CULTIVATION_ACTION_ID,
      sourceSkillName: '修炼',
      realmLv: normalizePositiveInt(snapshot.realmLv, 1),
      baseDesc: '正在运转主修功法，每息获得境界修为与功法经验，移动、主动攻击或受击都会打断修炼。',
      stats: {
        realmExpPerTick: 1,
        techniqueExpPerTick: 5,
      },
      statMode: 'flat',
    };
  }

  return null;
}

/** hydrateTemporaryBuff：执行对应的业务逻辑。 */
function hydrateTemporaryBuff(snapshot: unknown, contentService: ContentService): TemporaryBuffState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.buffId !== 'string' || typeof snapshot.sourceSkillId !== 'string') {
    return null;
  }

/** minimal：定义该变量以承载业务值。 */
  const minimal: PersistedTemporaryBuffItem = {
    buffId: snapshot.buffId,
    sourceSkillId: snapshot.sourceSkillId,
/** sourceCasterId：定义该变量以承载业务值。 */
    sourceCasterId: typeof snapshot.sourceCasterId === 'string' && snapshot.sourceCasterId.length > 0 ? snapshot.sourceCasterId : undefined,
    realmLv: normalizePositiveInt(snapshot.realmLv, 1),
    remainingTicks: normalizePositiveInt(snapshot.remainingTicks, 1),
    duration: normalizePositiveInt(snapshot.duration, 1),
    stacks: normalizePositiveInt(snapshot.stacks, 1),
    maxStacks: normalizePositiveInt(snapshot.maxStacks, 1),
    sustainTicksElapsed: normalizeNonNegativeInt(snapshot.sustainTicksElapsed, 0),
  };

  if (isTransientGmObserveBuff(minimal.buffId, minimal.sourceSkillId)) {
    return null;
  }

/** systemBuff：定义该变量以承载业务值。 */
  const systemBuff = buildSystemBuffState(minimal);
  if (systemBuff) {
    return systemBuff;
  }

/** skill：定义该变量以承载业务值。 */
  const skill = contentService.getSkill(minimal.sourceSkillId);
/** effect：定义该变量以承载业务值。 */
  const effect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === minimal.buffId
  ));
  if (skill && effect) {
    return buildSkillBuffState(skill, effect, minimal);
  }

  if (typeof snapshot.name !== 'string' || typeof snapshot.shortMark !== 'string' || snapshot.name.length === 0 || snapshot.shortMark.length === 0) {
    return null;
  }

/** hydrated：定义该变量以承载业务值。 */
  const hydrated: TemporaryBuffState = {
    ...snapshot,
    buffId: minimal.buffId,
    sourceSkillId: minimal.sourceSkillId,
    realmLv: minimal.realmLv,
    remainingTicks: minimal.remainingTicks,
    duration: minimal.duration,
    stacks: minimal.stacks,
    maxStacks: minimal.maxStacks,
    name: snapshot.name,
    shortMark: snapshot.shortMark,
/** category：定义该变量以承载业务值。 */
    category: snapshot.category === 'debuff' ? 'debuff' : 'buff',
/** visibility：定义该变量以承载业务值。 */
    visibility: snapshot.visibility === 'hidden' || snapshot.visibility === 'observe_only' ? snapshot.visibility : 'public',
/** desc：定义该变量以承载业务值。 */
    desc: typeof snapshot.desc === 'string' ? snapshot.desc : undefined,
/** baseDesc：定义该变量以承载业务值。 */
    baseDesc: typeof snapshot.baseDesc === 'string'
      ? snapshot.baseDesc
      : typeof snapshot.desc === 'string'
        ? snapshot.desc
        : undefined,
/** sourceSkillName：定义该变量以承载业务值。 */
    sourceSkillName: typeof snapshot.sourceSkillName === 'string' ? snapshot.sourceSkillName : undefined,
    sourceCasterId: minimal.sourceCasterId,
/** color：定义该变量以承载业务值。 */
    color: typeof snapshot.color === 'string' ? snapshot.color : undefined,
    attrs: isPlainObject(snapshot.attrs) ? snapshot.attrs as TemporaryBuffState['attrs'] : undefined,
/** attrMode：定义该变量以承载业务值。 */
    attrMode: snapshot.attrMode === 'flat' ? 'flat' : snapshot.attrMode === 'percent' ? 'percent' : undefined,
    stats: isPlainObject(snapshot.stats) ? snapshot.stats as TemporaryBuffState['stats'] : undefined,
/** statMode：定义该变量以承载业务值。 */
    statMode: snapshot.statMode === 'flat' ? 'flat' : snapshot.statMode === 'percent' ? 'percent' : undefined,
    presentationScale: Number.isFinite(snapshot.presentationScale) ? Number(snapshot.presentationScale) : undefined,
/** infiniteDuration：定义该变量以承载业务值。 */
    infiniteDuration: snapshot.infiniteDuration === true,
    sustainCost: normalizeBuffSustainCost(snapshot.sustainCost),
    sustainTicksElapsed: minimal.sustainTicksElapsed,
/** expireWithBuffId：定义该变量以承载业务值。 */
    expireWithBuffId: typeof snapshot.expireWithBuffId === 'string' && snapshot.expireWithBuffId.length > 0
      ? snapshot.expireWithBuffId
      : undefined,
  };
  return syncDynamicBuffPresentation(hydrated);
}

/** dehydrateTemporaryBuff：执行对应的业务逻辑。 */
function dehydrateTemporaryBuff(buff: TemporaryBuffState, contentService: ContentService): PersistedTemporaryBuffEntry {
/** skill：定义该变量以承载业务值。 */
  const skill = contentService.getSkill(buff.sourceSkillId);
/** effect：定义该变量以承载业务值。 */
  const effect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === buff.buffId
  ));

  if (effect || (buff.sourceSkillId === WORLD_TIME_SOURCE_ID && buff.buffId === WORLD_DARKNESS_BUFF_ID) || (buff.sourceSkillId === CULTIVATION_ACTION_ID && buff.buffId === CULTIVATION_BUFF_ID)) {
    return {
      buffId: buff.buffId,
      sourceSkillId: buff.sourceSkillId,
/** sourceCasterId：定义该变量以承载业务值。 */
      sourceCasterId: typeof buff.sourceCasterId === 'string' && buff.sourceCasterId.length > 0 ? buff.sourceCasterId : undefined,
      realmLv: normalizePositiveInt(buff.realmLv, 1),
      remainingTicks: normalizePositiveInt(buff.remainingTicks, 1),
      duration: normalizePositiveInt(buff.duration, 1),
      stacks: normalizePositiveInt(buff.stacks, 1),
      maxStacks: normalizePositiveInt(buff.maxStacks, 1),
      sustainTicksElapsed: effect?.sustainCost ? normalizeNonNegativeInt(buff.sustainTicksElapsed, 0) : undefined,
    };
  }

  return {
    ...buff,
    realmLv: normalizePositiveInt(buff.realmLv, 1),
    remainingTicks: normalizePositiveInt(buff.remainingTicks, 1),
    duration: normalizePositiveInt(buff.duration, 1),
    stacks: normalizePositiveInt(buff.stacks, 1),
    maxStacks: normalizePositiveInt(buff.maxStacks, 1),
  };
}

/** buildQuestRewardItems：执行对应的业务逻辑。 */
function buildQuestRewardItems(questId: string, mapService: MapService, contentService: ContentService): ItemStack[] {
/** config：定义该变量以承载业务值。 */
  const config = mapService.getQuest(questId);
  if (!config) return [];
  if (config.rewards.length > 0) {
    return config.rewards
      .map((reward) => contentService.createItem(reward.itemId, reward.count))
      .filter((item): item is ItemStack => Boolean(item));
  }
  return config.rewardItemIds
    .map((itemId) => contentService.createItem(itemId))
    .filter((item): item is ItemStack => Boolean(item));
}

/** hydrateQuest：执行对应的业务逻辑。 */
function hydrateQuest(snapshot: unknown, mapService: MapService, contentService: ContentService): QuestState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.id !== 'string' || snapshot.id.length === 0) {
    return null;
  }

/** config：定义该变量以承载业务值。 */
  const config = mapService.getQuest(snapshot.id);
/** progress：定义该变量以承载业务值。 */
  const progress = normalizeNonNegativeInt(snapshot.progress, 0);

  if (config) {
/** giverLocation：定义该变量以承载业务值。 */
    const giverLocation = mapService.getNpcLocation(config.giverId);
/** targetNpcLocation：定义该变量以承载业务值。 */
    const targetNpcLocation = config.targetNpcId ? mapService.getNpcLocation(config.targetNpcId) : undefined;
/** submitNpcLocation：定义该变量以承载业务值。 */
    const submitNpcLocation = config.submitNpcId ? mapService.getNpcLocation(config.submitNpcId) : undefined;
    return {
      id: config.id,
      title: config.title,
      desc: config.desc,
      line: config.line,
      chapter: config.chapter,
      story: config.story,
      status: isQuestStatus(snapshot.status) ? snapshot.status : 'active',
      objectiveType: config.objectiveType,
      objectiveText: config.objectiveText,
      progress,
      required: config.required,
      targetName: resolveQuestTargetName({
        objectiveType: config.objectiveType,
        title: config.title,
        targetName: config.targetName,
        targetNpcId: config.targetNpcId,
        targetMonsterId: config.targetMonsterId,
        targetTechniqueId: config.targetTechniqueId,
        targetRealmStage: config.targetRealmStage,
        requiredItemId: config.requiredItemId,
        resolveNpcName: (npcId) => mapService.getNpcLocation(npcId)?.name,
        resolveMonsterName: (monsterId) => mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => contentService.getTechnique(techniqueId)?.name,
        resolveItemName: (itemId) => contentService.getItem(itemId)?.name,
      }),
      targetTechniqueId: config.targetTechniqueId,
      targetRealmStage: config.targetRealmStage,
      rewardText: config.rewardText,
      targetMonsterId: config.targetMonsterId ?? '',
      rewardItemId: config.rewardItemId,
      rewardItemIds: [...config.rewardItemIds],
      rewards: buildQuestRewardItems(config.id, mapService, contentService),
      nextQuestId: config.nextQuestId,
      requiredItemId: config.requiredItemId,
      requiredItemCount: config.requiredItemCount,
      giverId: config.giverId,
      giverName: config.giverName,
      giverMapId: giverLocation?.mapId ?? config.giverMapId,
      giverMapName: giverLocation?.mapName ?? config.giverMapName,
      giverX: giverLocation?.x ?? config.giverX,
      giverY: giverLocation?.y ?? config.giverY,
      targetMapId: targetNpcLocation?.mapId ?? config.targetMapId,
      targetMapName: targetNpcLocation?.mapName ?? config.targetMapName,
      targetX: targetNpcLocation?.x ?? config.targetX,
      targetY: targetNpcLocation?.y ?? config.targetY,
      targetNpcId: config.targetNpcId,
      targetNpcName: targetNpcLocation?.name ?? config.targetNpcName,
      submitNpcId: config.submitNpcId,
      submitNpcName: submitNpcLocation?.name ?? config.submitNpcName,
      submitMapId: submitNpcLocation?.mapId ?? config.submitMapId,
      submitMapName: submitNpcLocation?.mapName ?? config.submitMapName,
      submitX: submitNpcLocation?.x ?? config.submitX,
      submitY: submitNpcLocation?.y ?? config.submitY,
      relayMessage: config.relayMessage,
    };
  }

  if (
    typeof snapshot.title !== 'string'
    || typeof snapshot.desc !== 'string'
    || !isQuestStatus(snapshot.status)
  ) {
    return null;
  }

  return {
    ...snapshot,
    id: snapshot.id,
    title: snapshot.title,
    desc: snapshot.desc,
/** line：定义该变量以承载业务值。 */
    line: snapshot.line === 'main' || snapshot.line === 'daily' || snapshot.line === 'encounter' ? snapshot.line : 'side',
    status: snapshot.status,
    objectiveType: isQuestObjectiveType(snapshot.objectiveType) ? snapshot.objectiveType : 'kill',
    progress,
    required: normalizePositiveInt(snapshot.required, 1),
/** targetName：定义该变量以承载业务值。 */
    targetName: typeof snapshot.targetName === 'string' ? snapshot.targetName : snapshot.title,
/** rewardText：定义该变量以承载业务值。 */
    rewardText: typeof snapshot.rewardText === 'string' ? snapshot.rewardText : '',
/** targetMonsterId：定义该变量以承载业务值。 */
    targetMonsterId: typeof snapshot.targetMonsterId === 'string' ? snapshot.targetMonsterId : '',
/** rewardItemId：定义该变量以承载业务值。 */
    rewardItemId: typeof snapshot.rewardItemId === 'string' ? snapshot.rewardItemId : '',
    rewardItemIds: Array.isArray(snapshot.rewardItemIds) ? snapshot.rewardItemIds.filter((entry): entry is string => typeof entry === 'string') : [],
    rewards: Array.isArray(snapshot.rewards) ? snapshot.rewards as ItemStack[] : [],
/** giverId：定义该变量以承载业务值。 */
    giverId: typeof snapshot.giverId === 'string' ? snapshot.giverId : '',
/** giverName：定义该变量以承载业务值。 */
    giverName: typeof snapshot.giverName === 'string' ? snapshot.giverName : '',
/** chapter：定义该变量以承载业务值。 */
    chapter: typeof snapshot.chapter === 'string' ? snapshot.chapter : undefined,
/** story：定义该变量以承载业务值。 */
    story: typeof snapshot.story === 'string' ? snapshot.story : undefined,
/** objectiveText：定义该变量以承载业务值。 */
    objectiveText: typeof snapshot.objectiveText === 'string' ? snapshot.objectiveText : undefined,
/** targetTechniqueId：定义该变量以承载业务值。 */
    targetTechniqueId: typeof snapshot.targetTechniqueId === 'string' ? snapshot.targetTechniqueId : undefined,
/** targetRealmStage：定义该变量以承载业务值。 */
    targetRealmStage: typeof snapshot.targetRealmStage === 'number' ? snapshot.targetRealmStage : undefined,
/** nextQuestId：定义该变量以承载业务值。 */
    nextQuestId: typeof snapshot.nextQuestId === 'string' ? snapshot.nextQuestId : undefined,
/** requiredItemId：定义该变量以承载业务值。 */
    requiredItemId: typeof snapshot.requiredItemId === 'string' ? snapshot.requiredItemId : undefined,
    requiredItemCount: Number.isFinite(snapshot.requiredItemCount) ? Number(snapshot.requiredItemCount) : undefined,
/** giverMapId：定义该变量以承载业务值。 */
    giverMapId: typeof snapshot.giverMapId === 'string' ? snapshot.giverMapId : undefined,
/** giverMapName：定义该变量以承载业务值。 */
    giverMapName: typeof snapshot.giverMapName === 'string' ? snapshot.giverMapName : undefined,
    giverX: Number.isFinite(snapshot.giverX) ? Number(snapshot.giverX) : undefined,
    giverY: Number.isFinite(snapshot.giverY) ? Number(snapshot.giverY) : undefined,
/** targetMapId：定义该变量以承载业务值。 */
    targetMapId: typeof snapshot.targetMapId === 'string' ? snapshot.targetMapId : undefined,
/** targetMapName：定义该变量以承载业务值。 */
    targetMapName: typeof snapshot.targetMapName === 'string' ? snapshot.targetMapName : undefined,
    targetX: Number.isFinite(snapshot.targetX) ? Number(snapshot.targetX) : undefined,
    targetY: Number.isFinite(snapshot.targetY) ? Number(snapshot.targetY) : undefined,
/** targetNpcId：定义该变量以承载业务值。 */
    targetNpcId: typeof snapshot.targetNpcId === 'string' ? snapshot.targetNpcId : undefined,
/** targetNpcName：定义该变量以承载业务值。 */
    targetNpcName: typeof snapshot.targetNpcName === 'string' ? snapshot.targetNpcName : undefined,
/** submitNpcId：定义该变量以承载业务值。 */
    submitNpcId: typeof snapshot.submitNpcId === 'string' ? snapshot.submitNpcId : undefined,
/** submitNpcName：定义该变量以承载业务值。 */
    submitNpcName: typeof snapshot.submitNpcName === 'string' ? snapshot.submitNpcName : undefined,
/** submitMapId：定义该变量以承载业务值。 */
    submitMapId: typeof snapshot.submitMapId === 'string' ? snapshot.submitMapId : undefined,
/** submitMapName：定义该变量以承载业务值。 */
    submitMapName: typeof snapshot.submitMapName === 'string' ? snapshot.submitMapName : undefined,
    submitX: Number.isFinite(snapshot.submitX) ? Number(snapshot.submitX) : undefined,
    submitY: Number.isFinite(snapshot.submitY) ? Number(snapshot.submitY) : undefined,
/** relayMessage：定义该变量以承载业务值。 */
    relayMessage: typeof snapshot.relayMessage === 'string' ? snapshot.relayMessage : undefined,
  };
}

/** dehydrateQuest：执行对应的业务逻辑。 */
function dehydrateQuest(quest: QuestState, mapService: MapService): PersistedQuestEntry {
  if (mapService.getQuest(quest.id)) {
    return {
      id: quest.id,
      status: isQuestStatus(quest.status) ? quest.status : 'active',
      progress: normalizeNonNegativeInt(quest.progress, 0),
    };
  }

  return {
    ...quest,
    status: isQuestStatus(quest.status) ? quest.status : 'active',
    progress: normalizeNonNegativeInt(quest.progress, 0),
  };
}

/** 从持久化快照还原背包数据，补全物品定义 */
export function hydrateInventorySnapshot(snapshot: unknown, contentService: ContentService): Inventory {
/** source：定义该变量以承载业务值。 */
  const source = isPlainObject(snapshot) ? snapshot : {};
/** items：定义该变量以承载业务值。 */
  const items = Array.isArray(source.items)
    ? source.items
      .map((entry) => hydrateItemStack(entry, contentService))
      .filter((entry): entry is ItemStack => entry !== null)
    : [];

  return contentService.normalizeInventory({
    capacity: normalizePositiveInt(source.capacity, DEFAULT_INVENTORY_CAPACITY),
    items,
  });
}

/** 从持久化快照还原坊市托管仓 */
export function hydrateMarketStorageSnapshot(snapshot: unknown, contentService: ContentService): MarketStorage {
/** inventory：定义该变量以承载业务值。 */
  const inventory = hydrateInventorySnapshot(snapshot, contentService);
  return {
    items: inventory.items,
  };
}

/** 从持久化快照还原装备数据，补全物品定义 */
export function hydrateEquipmentSnapshot(snapshot: unknown, contentService: ContentService): EquipmentSlots {
/** source：定义该变量以承载业务值。 */
  const source = isPlainObject(snapshot) ? snapshot : {};
/** equipment：定义该变量以承载业务值。 */
  const equipment = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;

  for (const slot of EQUIP_SLOTS) {
    const item = hydrateItemStack(source[slot], contentService, 1);
    equipment[slot] = item ? { ...item, count: 1 } : null;
  }

  return contentService.normalizeEquipment(equipment);
}

/** 从持久化快照还原功法列表 */
export function hydrateTechniqueSnapshots(snapshot: unknown): TechniqueState[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  return snapshot
    .map((entry) => hydrateTechnique(entry))
    .filter((entry): entry is TechniqueState => entry !== null);
}

/** hydrateBodyTrainingSnapshot：执行对应的业务逻辑。 */
export function hydrateBodyTrainingSnapshot(snapshot: unknown): BodyTrainingState {
  if (!isPlainObject(snapshot)) {
    return normalizeBodyTrainingState();
  }
/** raw：定义该变量以承载业务值。 */
  const raw = snapshot as Record<string, unknown>;
  return normalizeBodyTrainingState({
    level: raw.level as number | undefined,
    exp: raw.exp as number | undefined,
    expToNext: raw.expToNext as number | undefined,
  });
}

/** 从持久化快照还原临时 Buff 列表，根据技能定义补全完整字段 */
export function hydrateTemporaryBuffSnapshots(snapshot: unknown, contentService: ContentService): TemporaryBuffState[] {
  return hydratePersistedTemporaryBuffSnapshots(snapshot, contentService, {
    ignore: (entry) => isTransientGmObserveBuff(entry.buffId, entry.sourceSkillId),
  });
}

/** 从持久化快照还原任务列表，根据任务配置补全完整字段 */
export function hydrateQuestSnapshots(snapshot: unknown, mapService: MapService, contentService: ContentService): QuestState[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  return snapshot
    .map((entry) => hydrateQuest(entry, mapService, contentService))
    .filter((entry): entry is QuestState => entry !== null);
}

/** 将玩家内存状态转换为持久化快照（已知内容走精简格式，未知保留完整字段） */
export function buildPersistedPlayerCollections(player: PlayerStorageState, contentService: ContentService, mapService: MapService): PersistedPlayerCollections {
/** equipment：定义该变量以承载业务值。 */
  const equipment = { weapon: null, head: null, body: null, legs: null, accessory: null } as PersistedEquipmentSnapshot;
/** persistentTemporaryBuffs：定义该变量以承载业务值。 */
  const persistentTemporaryBuffs = (player.temporaryBuffs ?? []).filter((buff) => !isTransientGmObserveBuff(buff.buffId, buff.sourceSkillId));

  for (const slot of EQUIP_SLOTS) {
    const item = player.equipment[slot];
    equipment[slot] = item ? dehydrateEquipmentItem(item, contentService) : null;
  }

  return {
    inventory: {
      capacity: normalizePositiveInt(player.inventory.capacity, DEFAULT_INVENTORY_CAPACITY),
      items: player.inventory.items.map((item) => dehydrateInventoryItem(item, contentService)),
    },
    marketStorage: {
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: (player.marketStorage?.items ?? []).map((item) => dehydrateInventoryItem(item, contentService)),
    },
    equipment,
    bodyTraining: normalizeBodyTrainingState(player.bodyTraining),
    temporaryBuffs: persistentTemporaryBuffs.map((buff) => dehydratePersistedTemporaryBuff(buff, contentService)),
    techniques: player.techniques
      .filter((technique) => typeof technique.techId === 'string' && technique.techId.length > 0)
      .map((technique) => dehydrateTechnique(technique, contentService)),
    quests: player.quests.map((quest) => dehydrateQuest(quest, mapService)),
  };
}
