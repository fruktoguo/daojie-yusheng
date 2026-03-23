/**
 * 玩家存档序列化/反序列化 —— 负责将内存中的玩家集合数据（背包、装备、
 * 功法、Buff、任务）与持久化快照格式互相转换。
 * 已知物品/技能走精简快照（仅存 ID），未知的则保留完整字段以防丢失。
 */
import {
  CULTIVATE_EXP_PER_TICK,
  DEFAULT_INVENTORY_CAPACITY,
  EQUIP_SLOTS,
  EquipmentSlots,
  EquipSlot,
  Inventory,
  ItemStack,
  ItemType,
  QuestObjectiveType,
  QuestState,
  QuestStatus,
  SkillDef,
  SkillEffectDef,
  TECHNIQUE_GRADE_ORDER,
  TechniqueAttrCurves,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  TechniqueState,
  TemporaryBuffState,
  WORLD_DARKNESS_BUFF_DURATION,
  WORLD_DARKNESS_BUFF_ID,
  WORLD_TIME_SOURCE_ID,
} from '@mud/shared';
import { ContentService } from './content.service';
import { MapService } from './map.service';
import { resolveQuestTargetName } from './quest-display';

interface PersistedInventoryItem {
  itemId: string;
  count: number;
}

interface PersistedEquipmentItem {
  itemId: string;
}

interface PersistedTechniqueItem {
  techId: string;
  level: number;
  exp: number;
  expToNext?: number;
}

interface PersistedTemporaryBuffItem {
  buffId: string;
  sourceSkillId: string;
  remainingTicks: number;
  duration: number;
  stacks: number;
  maxStacks: number;
}

interface PersistedQuestItem {
  id: string;
  status: QuestStatus;
  progress: number;
}

type PersistedInventoryEntry = PersistedInventoryItem | ItemStack;
type PersistedEquipmentEntry = PersistedEquipmentItem | ItemStack;
type PersistedTechniqueEntry = PersistedTechniqueItem | TechniqueState;
type PersistedTemporaryBuffEntry = PersistedTemporaryBuffItem | TemporaryBuffState;
type PersistedQuestEntry = PersistedQuestItem | QuestState;

export interface PersistedInventorySnapshot {
  capacity: number;
  items: PersistedInventoryEntry[];
}

export type PersistedEquipmentSnapshot = Record<EquipSlot, PersistedEquipmentEntry | null>;

/** 持久化后的玩家集合数据（背包、装备、功法、Buff、任务） */
export interface PersistedPlayerCollections {
  inventory: PersistedInventorySnapshot;
  equipment: PersistedEquipmentSnapshot;
  techniques: PersistedTechniqueEntry[];
  temporaryBuffs: PersistedTemporaryBuffEntry[];
  quests: PersistedQuestEntry[];
}

interface PlayerStorageState {
  inventory: Inventory;
  equipment: EquipmentSlots;
  techniques: TechniqueState[];
  temporaryBuffs?: TemporaryBuffState[];
  quests: QuestState[];
}

const ITEM_TYPES: readonly ItemType[] = ['consumable', 'equipment', 'material', 'quest_item', 'skill_book'];
const TECHNIQUE_GRADES: readonly TechniqueGrade[] = TECHNIQUE_GRADE_ORDER;
const QUEST_STATUSES: readonly QuestStatus[] = ['available', 'active', 'ready', 'completed'];
const QUEST_OBJECTIVE_TYPES: readonly QuestObjectiveType[] = ['kill', 'learn_technique', 'realm_progress', 'realm_stage'];
const CULTIVATION_BUFF_ID = 'cultivation:active';
const CULTIVATION_ACTION_ID = 'cultivation:toggle';

function isQuestStatus(value: unknown): value is QuestStatus {
  return typeof value === 'string' && QUEST_STATUSES.includes(value as QuestStatus);
}

function isQuestObjectiveType(value: unknown): value is QuestObjectiveType {
  return typeof value === 'string' && QUEST_OBJECTIVE_TYPES.includes(value as QuestObjectiveType);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizePositiveInt(value: unknown, fallback = 1): number {
  return Math.max(1, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

function normalizeNonNegativeInt(value: unknown, fallback = 0): number {
  return Math.max(0, Number.isFinite(value) ? Math.floor(Number(value)) : fallback);
}

function isItemType(value: unknown): value is ItemType {
  return typeof value === 'string' && ITEM_TYPES.includes(value as ItemType);
}

function isEquipSlot(value: unknown): value is EquipSlot {
  return typeof value === 'string' && EQUIP_SLOTS.includes(value as EquipSlot);
}

function isTechniqueRealm(value: unknown): value is TechniqueRealm {
  return typeof value === 'number'
    && (value === TechniqueRealm.Entry || value === TechniqueRealm.Minor || value === TechniqueRealm.Major || value === TechniqueRealm.Perfection);
}

function isTechniqueGrade(value: unknown): value is TechniqueGrade {
  return typeof value === 'string' && TECHNIQUE_GRADES.includes(value as TechniqueGrade);
}

function hydrateItemStack(snapshot: unknown, contentService: ContentService, countOverride?: number): ItemStack | null {
  if (!isPlainObject(snapshot) || typeof snapshot.itemId !== 'string' || snapshot.itemId.length === 0) {
    return null;
  }

  const count = countOverride ?? normalizePositiveInt(snapshot.count, 1);
  const hydrated = contentService.createItem(snapshot.itemId, count);
  if (hydrated) {
    return hydrated;
  }

  return {
    itemId: snapshot.itemId,
    name: typeof snapshot.name === 'string' && snapshot.name.length > 0 ? snapshot.name : snapshot.itemId,
    type: isItemType(snapshot.type) ? snapshot.type : 'material',
    count,
    desc: typeof snapshot.desc === 'string' ? snapshot.desc : '',
    grade: isTechniqueGrade(snapshot.grade) ? snapshot.grade : undefined,
    level: Number.isFinite(snapshot.level) ? Math.max(1, Math.floor(Number(snapshot.level))) : undefined,
    equipSlot: isEquipSlot(snapshot.equipSlot) ? snapshot.equipSlot : undefined,
    equipAttrs: isPlainObject(snapshot.equipAttrs) ? snapshot.equipAttrs as ItemStack['equipAttrs'] : undefined,
    equipStats: isPlainObject(snapshot.equipStats) ? snapshot.equipStats as ItemStack['equipStats'] : undefined,
    effects: Array.isArray(snapshot.effects) ? snapshot.effects as ItemStack['effects'] : undefined,
    tags: Array.isArray(snapshot.tags) ? snapshot.tags.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : undefined,
  };
}

function dehydrateInventoryItem(item: ItemStack, contentService: ContentService): PersistedInventoryEntry {
  const count = normalizePositiveInt(item.count, 1);
  if (contentService.getItem(item.itemId)) {
    return { itemId: item.itemId, count };
  }
  return { ...item, count };
}

function dehydrateEquipmentItem(item: ItemStack, contentService: ContentService): PersistedEquipmentEntry {
  if (contentService.getItem(item.itemId)) {
    return { itemId: item.itemId };
  }
  return { ...item, count: 1 };
}

function hydrateTechnique(snapshot: unknown): TechniqueState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.techId !== 'string' || snapshot.techId.length === 0) {
    return null;
  }

  return {
    ...snapshot,
    techId: snapshot.techId,
    name: typeof snapshot.name === 'string' && snapshot.name.length > 0 ? snapshot.name : snapshot.techId,
    level: normalizePositiveInt(snapshot.level, 1),
    exp: normalizeNonNegativeInt(snapshot.exp, 0),
    expToNext: normalizeNonNegativeInt(snapshot.expToNext, 0),
    realm: isTechniqueRealm(snapshot.realm) ? snapshot.realm : TechniqueRealm.Entry,
    skills: Array.isArray(snapshot.skills) ? snapshot.skills as SkillDef[] : [],
    grade: isTechniqueGrade(snapshot.grade) ? snapshot.grade : undefined,
    layers: Array.isArray(snapshot.layers) ? snapshot.layers as TechniqueLayerDef[] : undefined,
    attrCurves: isPlainObject(snapshot.attrCurves) ? snapshot.attrCurves as TechniqueAttrCurves : undefined,
  };
}

function dehydrateTechnique(technique: TechniqueState, contentService: ContentService): PersistedTechniqueEntry {
  const level = normalizePositiveInt(technique.level, 1);
  const exp = normalizeNonNegativeInt(technique.exp, 0);
  const expToNext = normalizeNonNegativeInt(technique.expToNext, 0);
  if (contentService.getTechnique(technique.techId)) {
    return {
      techId: technique.techId,
      level,
      exp,
      expToNext,
    };
  }
  return {
    ...technique,
    level,
    exp,
    expToNext,
  };
}

function normalizeBuffShortMark(effect: Extract<SkillEffectDef, { type: 'buff' }>): string {
  const raw = effect.shortMark?.trim();
  if (raw) {
    return [...raw][0] ?? raw;
  }
  const fallback = [...effect.name.trim()][0];
  return fallback ?? '气';
}

function buildSkillBuffState(skill: SkillDef, effect: Extract<SkillEffectDef, { type: 'buff' }>, snapshot: PersistedTemporaryBuffItem): TemporaryBuffState {
  return {
    buffId: effect.buffId,
    name: effect.name,
    desc: effect.desc,
    shortMark: normalizeBuffShortMark(effect),
    category: effect.category ?? (effect.target === 'self' ? 'buff' : 'debuff'),
    visibility: effect.visibility ?? 'public',
    remainingTicks: normalizePositiveInt(snapshot.remainingTicks, Math.max(1, effect.duration)),
    duration: normalizePositiveInt(snapshot.duration, Math.max(1, effect.duration)),
    stacks: normalizePositiveInt(snapshot.stacks, 1),
    maxStacks: normalizePositiveInt(snapshot.maxStacks, Math.max(1, effect.maxStacks ?? 1)),
    sourceSkillId: skill.id,
    sourceSkillName: skill.name,
    color: effect.color,
    attrs: effect.attrs,
    stats: effect.stats,
  };
}

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
      color: '#89a8c7',
    };
  }

  if (snapshot.sourceSkillId === CULTIVATION_ACTION_ID && snapshot.buffId === CULTIVATION_BUFF_ID) {
    return {
      buffId: CULTIVATION_BUFF_ID,
      name: '修炼中',
      desc: '正在运转主修功法，每息获得境界与功法经验，移动、主动攻击或受击都会打断修炼。',
      shortMark: '修',
      category: 'buff',
      visibility: 'public',
      remainingTicks: normalizePositiveInt(snapshot.remainingTicks, 2),
      duration: normalizePositiveInt(snapshot.duration, 1),
      stacks: normalizePositiveInt(snapshot.stacks, 1),
      maxStacks: normalizePositiveInt(snapshot.maxStacks, 1),
      sourceSkillId: CULTIVATION_ACTION_ID,
      sourceSkillName: '修炼',
      stats: {
        realmExpPerTick: 2,
        techniqueExpPerTick: CULTIVATE_EXP_PER_TICK,
      },
    };
  }

  return null;
}

function hydrateTemporaryBuff(snapshot: unknown, contentService: ContentService): TemporaryBuffState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.buffId !== 'string' || typeof snapshot.sourceSkillId !== 'string') {
    return null;
  }

  const minimal: PersistedTemporaryBuffItem = {
    buffId: snapshot.buffId,
    sourceSkillId: snapshot.sourceSkillId,
    remainingTicks: normalizePositiveInt(snapshot.remainingTicks, 1),
    duration: normalizePositiveInt(snapshot.duration, 1),
    stacks: normalizePositiveInt(snapshot.stacks, 1),
    maxStacks: normalizePositiveInt(snapshot.maxStacks, 1),
  };

  const systemBuff = buildSystemBuffState(minimal);
  if (systemBuff) {
    return systemBuff;
  }

  const skill = contentService.getSkill(minimal.sourceSkillId);
  const effect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === minimal.buffId
  ));
  if (skill && effect) {
    return buildSkillBuffState(skill, effect, minimal);
  }

  if (typeof snapshot.name !== 'string' || typeof snapshot.shortMark !== 'string' || snapshot.name.length === 0 || snapshot.shortMark.length === 0) {
    return null;
  }

  return {
    ...snapshot,
    buffId: minimal.buffId,
    sourceSkillId: minimal.sourceSkillId,
    remainingTicks: minimal.remainingTicks,
    duration: minimal.duration,
    stacks: minimal.stacks,
    maxStacks: minimal.maxStacks,
    name: snapshot.name,
    shortMark: snapshot.shortMark,
    category: snapshot.category === 'debuff' ? 'debuff' : 'buff',
    visibility: snapshot.visibility === 'hidden' || snapshot.visibility === 'observe_only' ? snapshot.visibility : 'public',
    desc: typeof snapshot.desc === 'string' ? snapshot.desc : undefined,
    sourceSkillName: typeof snapshot.sourceSkillName === 'string' ? snapshot.sourceSkillName : undefined,
    color: typeof snapshot.color === 'string' ? snapshot.color : undefined,
    attrs: isPlainObject(snapshot.attrs) ? snapshot.attrs as TemporaryBuffState['attrs'] : undefined,
    stats: isPlainObject(snapshot.stats) ? snapshot.stats as TemporaryBuffState['stats'] : undefined,
  };
}

function dehydrateTemporaryBuff(buff: TemporaryBuffState, contentService: ContentService): PersistedTemporaryBuffEntry {
  const skill = contentService.getSkill(buff.sourceSkillId);
  const effect = skill?.effects.find((entry): entry is Extract<SkillEffectDef, { type: 'buff' }> => (
    entry.type === 'buff' && entry.buffId === buff.buffId
  ));

  if (effect || (buff.sourceSkillId === WORLD_TIME_SOURCE_ID && buff.buffId === WORLD_DARKNESS_BUFF_ID) || (buff.sourceSkillId === CULTIVATION_ACTION_ID && buff.buffId === CULTIVATION_BUFF_ID)) {
    return {
      buffId: buff.buffId,
      sourceSkillId: buff.sourceSkillId,
      remainingTicks: normalizePositiveInt(buff.remainingTicks, 1),
      duration: normalizePositiveInt(buff.duration, 1),
      stacks: normalizePositiveInt(buff.stacks, 1),
      maxStacks: normalizePositiveInt(buff.maxStacks, 1),
    };
  }

  return {
    ...buff,
    remainingTicks: normalizePositiveInt(buff.remainingTicks, 1),
    duration: normalizePositiveInt(buff.duration, 1),
    stacks: normalizePositiveInt(buff.stacks, 1),
    maxStacks: normalizePositiveInt(buff.maxStacks, 1),
  };
}

function buildQuestRewardItems(questId: string, mapService: MapService, contentService: ContentService): ItemStack[] {
  const config = mapService.getQuest(questId);
  if (!config) return [];
  if (config.rewards.length > 0) {
    return config.rewards
      .map((reward) => contentService.createItem(reward.itemId, reward.count) ?? {
        itemId: reward.itemId,
        name: reward.name,
        type: reward.type,
        count: reward.count,
        desc: reward.name,
      })
      .filter((item): item is ItemStack => Boolean(item));
  }
  return config.rewardItemIds
    .map((itemId) => contentService.createItem(itemId))
    .filter((item): item is ItemStack => Boolean(item));
}

function hydrateQuest(snapshot: unknown, mapService: MapService, contentService: ContentService): QuestState | null {
  if (!isPlainObject(snapshot) || typeof snapshot.id !== 'string' || snapshot.id.length === 0) {
    return null;
  }

  const config = mapService.getQuest(snapshot.id);
  const progress = normalizeNonNegativeInt(snapshot.progress, 0);

  if (config) {
    const npcLocation = mapService.getNpcLocation(config.giverId);
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
        targetMonsterId: config.targetMonsterId,
        targetTechniqueId: config.targetTechniqueId,
        targetRealmStage: config.targetRealmStage,
        resolveMonsterName: (monsterId) => mapService.getMonsterSpawn(monsterId)?.name,
        resolveTechniqueName: (techniqueId) => contentService.getTechnique(techniqueId)?.name,
      }),
      targetTechniqueId: config.targetTechniqueId,
      targetRealmStage: config.targetRealmStage,
      rewardText: config.rewardText,
      targetMonsterId: config.targetMonsterId ?? '',
      rewardItemId: config.rewardItemId,
      rewardItemIds: [...config.rewardItemIds],
      rewards: buildQuestRewardItems(config.id, mapService, contentService),
      nextQuestId: config.nextQuestId,
      giverId: config.giverId,
      giverName: config.giverName,
      giverMapId: npcLocation?.mapId ?? config.giverMapId,
      giverMapName: npcLocation?.mapName ?? config.giverMapName,
      giverX: npcLocation?.x ?? config.giverX,
      giverY: npcLocation?.y ?? config.giverY,
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
    line: snapshot.line === 'main' || snapshot.line === 'daily' || snapshot.line === 'encounter' ? snapshot.line : 'side',
    status: snapshot.status,
    objectiveType: isQuestObjectiveType(snapshot.objectiveType) ? snapshot.objectiveType : 'kill',
    progress,
    required: normalizePositiveInt(snapshot.required, 1),
    targetName: typeof snapshot.targetName === 'string' ? snapshot.targetName : snapshot.title,
    rewardText: typeof snapshot.rewardText === 'string' ? snapshot.rewardText : '',
    targetMonsterId: typeof snapshot.targetMonsterId === 'string' ? snapshot.targetMonsterId : '',
    rewardItemId: typeof snapshot.rewardItemId === 'string' ? snapshot.rewardItemId : '',
    rewardItemIds: Array.isArray(snapshot.rewardItemIds) ? snapshot.rewardItemIds.filter((entry): entry is string => typeof entry === 'string') : [],
    rewards: Array.isArray(snapshot.rewards) ? snapshot.rewards as ItemStack[] : [],
    giverId: typeof snapshot.giverId === 'string' ? snapshot.giverId : '',
    giverName: typeof snapshot.giverName === 'string' ? snapshot.giverName : '',
    chapter: typeof snapshot.chapter === 'string' ? snapshot.chapter : undefined,
    story: typeof snapshot.story === 'string' ? snapshot.story : undefined,
    objectiveText: typeof snapshot.objectiveText === 'string' ? snapshot.objectiveText : undefined,
    targetTechniqueId: typeof snapshot.targetTechniqueId === 'string' ? snapshot.targetTechniqueId : undefined,
    targetRealmStage: typeof snapshot.targetRealmStage === 'number' ? snapshot.targetRealmStage : undefined,
    nextQuestId: typeof snapshot.nextQuestId === 'string' ? snapshot.nextQuestId : undefined,
    giverMapId: typeof snapshot.giverMapId === 'string' ? snapshot.giverMapId : undefined,
    giverMapName: typeof snapshot.giverMapName === 'string' ? snapshot.giverMapName : undefined,
    giverX: Number.isFinite(snapshot.giverX) ? Number(snapshot.giverX) : undefined,
    giverY: Number.isFinite(snapshot.giverY) ? Number(snapshot.giverY) : undefined,
  };
}

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
  const source = isPlainObject(snapshot) ? snapshot : {};
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

/** 从持久化快照还原装备数据，补全物品定义 */
export function hydrateEquipmentSnapshot(snapshot: unknown, contentService: ContentService): EquipmentSlots {
  const source = isPlainObject(snapshot) ? snapshot : {};
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

/** 从持久化快照还原临时 Buff 列表，根据技能定义补全完整字段 */
export function hydrateTemporaryBuffSnapshots(snapshot: unknown, contentService: ContentService): TemporaryBuffState[] {
  if (!Array.isArray(snapshot)) {
    return [];
  }

  return snapshot
    .map((entry) => hydrateTemporaryBuff(entry, contentService))
    .filter((entry): entry is TemporaryBuffState => entry !== null);
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
  const equipment = { weapon: null, head: null, body: null, legs: null, accessory: null } as PersistedEquipmentSnapshot;

  for (const slot of EQUIP_SLOTS) {
    const item = player.equipment[slot];
    equipment[slot] = item ? dehydrateEquipmentItem(item, contentService) : null;
  }

  return {
    inventory: {
      capacity: normalizePositiveInt(player.inventory.capacity, DEFAULT_INVENTORY_CAPACITY),
      items: player.inventory.items.map((item) => dehydrateInventoryItem(item, contentService)),
    },
    equipment,
    temporaryBuffs: (player.temporaryBuffs ?? []).map((buff) => dehydrateTemporaryBuff(buff, contentService)),
    techniques: player.techniques
      .filter((technique) => typeof technique.techId === 'string' && technique.techId.length > 0)
      .map((technique) => dehydrateTechnique(technique, contentService)),
    quests: player.quests.map((quest) => dehydrateQuest(quest, mapService)),
  };
}
