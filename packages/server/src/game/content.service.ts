/**
 * 内容数据服务：加载并管理功法、物品、境界、突破等静态配置
 */
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import {
  createItemStackSignature,
  AttrKey,
  Attributes,
  DEFAULT_INVENTORY_CAPACITY,
  ELEMENT_KEYS,
  EquipmentConditionDef,
  EquipmentConditionGroup,
  EquipmentEffectDef,
  EquipmentTrigger,
  EquipmentSlots,
  EQUIP_SLOTS,
  Inventory,
  ItemStack,
  NUMERIC_SCALAR_STAT_KEYS,
  PlayerRealmStage,
  scaleTechniqueExp,
  SkillDef,
  TechniqueGrade,
  TechniqueLayerDef,
  TechniqueRealm,
  resolveSkillUnlockLevel,
} from '@mud/shared';

interface TechniqueTemplate {
  id: string;
  name: string;
  skills: SkillDef[];
  grade: TechniqueGrade;
  layers: TechniqueLayerDef[];
}

interface ItemTemplate extends Omit<ItemStack, 'count'> {
  learnTechniqueId?: string;
  healAmount?: number;
}

export interface EditorTechniqueCatalogEntry {
  id: string;
  name: string;
  grade: TechniqueGrade;
  skills: SkillDef[];
  layers: TechniqueLayerDef[];
}

export interface EditorItemCatalogEntry {
  itemId: string;
  name: string;
  type: ItemStack['type'];
  grade?: TechniqueGrade;
  level?: number;
  equipSlot?: ItemStack['equipSlot'];
  desc?: string;
  equipAttrs?: ItemStack['equipAttrs'];
  equipStats?: ItemStack['equipStats'];
  tags?: string[];
  effects?: EquipmentEffectDef[];
}

interface StarterInventoryEntry {
  itemId: string;
  count?: number;
}

interface RawSkillDef extends Omit<SkillDef, 'unlockRealm' | 'unlockPlayerRealm'> {
  unlockRealm?: keyof typeof TechniqueRealm | TechniqueRealm;
  unlockPlayerRealm?: keyof typeof PlayerRealmStage | PlayerRealmStage;
}

interface RawTechniqueLayerDef extends Omit<TechniqueLayerDef, 'expToNext'> {
  expToNext?: number;
  expFactor?: number;
}

interface RawTechniqueTemplate {
  id: string;
  name: string;
  grade: TechniqueGrade;
  layers: RawTechniqueLayerDef[];
  skills: RawSkillDef[];
}

type RealmSegmentId = 'martial' | 'immortal' | 'ascended';

export interface RealmLevelEntry {
  realmLv: number;
  displayName: string;
  name: string;
  phaseName: string | null;
  segment: RealmSegmentId;
  path: RealmSegmentId;
  grade: TechniqueGrade;
  gradeLabel: string;
  review: string;
  expToNext?: number;
}

interface RealmLevelBand {
  grade: TechniqueGrade;
  gradeLabel: string;
  levelFrom: number;
  levelTo: number;
}

interface RealmLevelSegment {
  id: RealmSegmentId;
  label: string;
  levelFrom: number;
  levelTo: number;
  rule: string;
}

interface RealmLevelsConfig {
  version: number;
  baseLevelKey: string;
  expMultiplier?: number;
  gradeSpan: number;
  immortalStageSpan: number;
  segments: RealmLevelSegment[];
  gradeBands: RealmLevelBand[];
  levels: RealmLevelEntry[];
}

type RawBreakthroughItemRequirement = {
  id: string;
  type: 'item';
  itemId: string;
  count: number;
  label?: string;
  hidden?: boolean;
  increaseAttrRequirementPct?: number;
};

type RawBreakthroughTechniqueRequirement = {
  id: string;
  type: 'technique';
  techniqueId?: string;
  minGrade?: TechniqueGrade;
  minLevel?: number;
  minRealm?: keyof typeof TechniqueRealm | TechniqueRealm;
  count?: number;
  label?: string;
  hidden?: boolean;
  increaseAttrRequirementPct?: number;
};

type RawBreakthroughAttributeRequirement = {
  id: string;
  type: 'attribute';
  attr: AttrKey;
  minValue: number;
  label?: string;
  hidden?: boolean;
};

type RawBreakthroughRequirement =
  | RawBreakthroughItemRequirement
  | RawBreakthroughTechniqueRequirement
  | RawBreakthroughAttributeRequirement;

export type BreakthroughRequirementDef =
  | RawBreakthroughItemRequirement
  | (Omit<RawBreakthroughTechniqueRequirement, 'minRealm'> & { minRealm?: TechniqueRealm })
  | RawBreakthroughAttributeRequirement;

export interface BreakthroughConfigEntry {
  fromRealmLv: number;
  toRealmLv: number;
  title?: string;
  requirements: BreakthroughRequirementDef[];
}

interface BreakthroughConfigFile {
  version: number;
  transitions: Array<{
    fromRealmLv: number;
    toRealmLv?: number;
    title?: string;
    requirements?: RawBreakthroughRequirement[];
  }>;
}

const PLAYER_REALM_STAGE_LEVEL_RANGES: Record<PlayerRealmStage, { levelFrom: number; levelTo: number }> = {
  [PlayerRealmStage.Mortal]: { levelFrom: 1, levelTo: 5 },
  [PlayerRealmStage.BodyTempering]: { levelFrom: 6, levelTo: 8 },
  [PlayerRealmStage.BoneForging]: { levelFrom: 9, levelTo: 12 },
  [PlayerRealmStage.Meridian]: { levelFrom: 13, levelTo: 15 },
  [PlayerRealmStage.Innate]: { levelFrom: 16, levelTo: 18 },
  [PlayerRealmStage.QiRefining]: { levelFrom: 19, levelTo: 24 },
  [PlayerRealmStage.Foundation]: { levelFrom: 25, levelTo: 30 },
};

const ATTR_KEYS: AttrKey[] = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'];
const EQUIPMENT_TRIGGERS: readonly EquipmentTrigger[] = [
  'on_equip',
  'on_unequip',
  'on_tick',
  'on_move',
  'on_attack',
  'on_hit',
  'on_kill',
  'on_skill_cast',
  'on_cultivation_tick',
  'on_time_segment_changed',
  'on_enter_map',
];
const TIME_PHASE_IDS = ['deep_night', 'late_night', 'before_dawn', 'dawn', 'day', 'dusk', 'first_night', 'night'] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const normalized = [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0).map((entry) => entry.trim()))];
  return normalized.length > 0 ? normalized : undefined;
}

@Injectable()
export class ContentService implements OnModuleInit {
  private readonly logger = new Logger(ContentService.name);
  private readonly techniques = new Map<string, TechniqueTemplate>();
  private readonly items = new Map<string, ItemTemplate>();
  private realmLevelsConfig: RealmLevelsConfig | null = null;
  private readonly realmLevels = new Map<number, RealmLevelEntry>();
  private readonly breakthroughConfigs = new Map<number, BreakthroughConfigEntry>();
  private starterInventoryEntries: StarterInventoryEntry[] = [];
  private readonly contentDir = path.join(process.cwd(), 'data', 'content');
  private readonly techniquesDir = path.join(this.contentDir, 'techniques');
  private readonly itemsDir = path.join(this.contentDir, 'items');
  private readonly starterInventoryPath = path.join(this.contentDir, 'starter-inventory.json');
  private readonly realmLevelsPath = path.join(this.contentDir, 'realm-levels.json');
  private readonly breakthroughConfigPath = path.join(this.contentDir, 'breakthroughs.json');

  onModuleInit(): void {
    this.loadContent();
  }

  private loadContent(): void {
    this.techniques.clear();
    this.items.clear();
    this.realmLevels.clear();
    this.breakthroughConfigs.clear();
    this.loadTechniques();
    this.loadItems();
    this.loadStarterInventory();
    this.loadRealmLevels();
    this.loadBreakthroughConfigs();
    this.logger.log(`内容已加载：功法 ${this.techniques.size} 条，物品 ${this.items.size} 条，境界 ${this.realmLevels.size} 条，突破配置 ${this.breakthroughConfigs.size} 条`);
  }

  private loadTechniques(): void {
    for (const raw of this.readJsonEntries<RawTechniqueTemplate>(this.techniquesDir)) {
      const technique: TechniqueTemplate = {
        id: raw.id,
        name: raw.name,
        grade: raw.grade,
        layers: [...(raw.layers ?? [])]
          .map((layer) => ({
            ...layer,
            attrs: this.normalizeTechniqueLayerAttrs(layer.attrs),
            expToNext: layer.expFactor === undefined
              ? Math.max(0, layer.expToNext ?? 0)
              : scaleTechniqueExp(layer.expFactor, raw.grade),
          }))
          .sort((left, right) => left.level - right.level),
        skills: raw.skills.map((skill) => ({
          ...skill,
          unlockLevel: resolveSkillUnlockLevel({
            unlockLevel: skill.unlockLevel,
            unlockRealm: skill.unlockRealm === undefined ? undefined : this.parseTechniqueRealm(skill.unlockRealm),
          }),
          unlockRealm: skill.unlockRealm === undefined ? undefined : this.parseTechniqueRealm(skill.unlockRealm),
          unlockPlayerRealm: skill.unlockPlayerRealm === undefined
            ? undefined
            : this.parsePlayerRealmStage(skill.unlockPlayerRealm),
        })),
      };
      this.techniques.set(technique.id, technique);
    }
  }

  private normalizeTechniqueLayerAttrs(attrs: TechniqueLayerDef['attrs']): TechniqueLayerDef['attrs'] {
    if (!attrs) return attrs;
    const normalized = { ...attrs };
    delete normalized.comprehension;
    delete normalized.luck;
    return normalized;
  }

  private normalizeItemAttrs(attrs: unknown): Partial<Attributes> | undefined {
    if (!isPlainObject(attrs)) {
      return undefined;
    }
    const normalized: Partial<Attributes> = {};
    for (const key of ATTR_KEYS) {
      const value = attrs[key];
      if (!Number.isFinite(value)) continue;
      normalized[key] = Number(value);
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private normalizeItemStats(stats: unknown): ItemStack['equipStats'] {
    if (!isPlainObject(stats)) {
      return undefined;
    }
    const normalized: NonNullable<ItemStack['equipStats']> = {};
    for (const key of NUMERIC_SCALAR_STAT_KEYS) {
      const value = stats[key];
      if (!Number.isFinite(value)) continue;
      normalized[key] = Number(value);
    }
    if (isPlainObject(stats.elementDamageBonus)) {
      const group: NonNullable<ItemStack['equipStats']>['elementDamageBonus'] = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageBonus[key];
        if (!Number.isFinite(value)) continue;
        group[key] = Number(value);
      }
      if (Object.keys(group).length > 0) {
        normalized.elementDamageBonus = group;
      }
    }
    if (isPlainObject(stats.elementDamageReduce)) {
      const group: NonNullable<ItemStack['equipStats']>['elementDamageReduce'] = {};
      for (const key of ELEMENT_KEYS) {
        const value = stats.elementDamageReduce[key];
        if (!Number.isFinite(value)) continue;
        group[key] = Number(value);
      }
      if (Object.keys(group).length > 0) {
        normalized.elementDamageReduce = group;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  private normalizeEquipmentConditionGroup(input: unknown): EquipmentConditionGroup | undefined {
    if (!isPlainObject(input) || !Array.isArray(input.items)) {
      return undefined;
    }
    const items = input.items
      .flatMap((entry) => this.normalizeEquipmentCondition(entry));
    if (items.length === 0) {
      return undefined;
    }
    return {
      mode: input.mode === 'any' ? 'any' : 'all',
      items,
    };
  }

  private normalizeEquipmentCondition(input: unknown): EquipmentConditionDef[] {
    if (!isPlainObject(input) || typeof input.type !== 'string') {
      return [];
    }
    switch (input.type) {
      case 'time_segment': {
        const phases = Array.isArray(input.in)
          ? input.in.filter((entry): entry is typeof TIME_PHASE_IDS[number] => typeof entry === 'string' && TIME_PHASE_IDS.includes(entry as typeof TIME_PHASE_IDS[number]))
          : [];
        return phases.length > 0 ? [{ type: 'time_segment', in: phases }] : [];
      }
      case 'map': {
        const mapIds = normalizeStringArray(input.mapIds);
        return mapIds ? [{ type: 'map', mapIds }] : [];
      }
      case 'hp_ratio':
      case 'qi_ratio': {
        const op = input.op === '>=' ? '>=' : input.op === '<=' ? '<=' : null;
        const rawValue = Number(input.value);
        if (!op || !Number.isFinite(rawValue)) {
          return [];
        }
        const value = rawValue > 1 ? rawValue / 100 : rawValue;
        return value >= 0 ? [{ type: input.type, op, value: Math.min(1, value) }] : [];
      }
      case 'is_cultivating': {
        return typeof input.value === 'boolean' ? [{ type: 'is_cultivating', value: input.value }] : [];
      }
      case 'has_buff': {
        if (typeof input.buffId !== 'string' || input.buffId.trim().length === 0) {
          return [];
        }
        return [{
          type: 'has_buff',
          buffId: input.buffId.trim(),
          minStacks: Number.isFinite(input.minStacks) ? Math.max(1, Math.floor(Number(input.minStacks))) : undefined,
        }];
      }
      case 'target_kind': {
        const targetKinds = Array.isArray(input.in)
          ? input.in.filter((entry): entry is 'monster' | 'player' | 'tile' => entry === 'monster' || entry === 'player' || entry === 'tile')
          : [];
        return targetKinds.length > 0 ? [{ type: 'target_kind', in: targetKinds }] : [];
      }
      default:
        return [];
    }
  }

  private normalizeEquipmentEffects(input: unknown, itemId: string): EquipmentEffectDef[] | undefined {
    if (!Array.isArray(input)) {
      return undefined;
    }
    const effects = input.flatMap((entry, index) => this.normalizeEquipmentEffect(entry, itemId, index));
    return effects.length > 0 ? effects : undefined;
  }

  private normalizeEquipmentEffect(input: unknown, itemId: string, index: number): EquipmentEffectDef[] {
    if (!isPlainObject(input) || typeof input.type !== 'string') {
      return [];
    }
    const effectId = typeof input.effectId === 'string' && input.effectId.trim().length > 0
      ? input.effectId.trim()
      : `${itemId}#${index + 1}`;
    const conditions = this.normalizeEquipmentConditionGroup(input.conditions);

    switch (input.type) {
      case 'stat_aura':
        return [{
          effectId,
          type: 'stat_aura',
          conditions,
          attrs: this.normalizeItemAttrs(input.attrs),
          stats: this.normalizeItemStats(input.stats),
        }];
      case 'progress_boost':
        return [{
          effectId,
          type: 'progress_boost',
          conditions,
          attrs: this.normalizeItemAttrs(input.attrs),
          stats: this.normalizeItemStats(input.stats),
        }];
      case 'periodic_cost': {
        const trigger = input.trigger === 'on_cultivation_tick' ? 'on_cultivation_tick' : input.trigger === 'on_tick' ? 'on_tick' : null;
        if (!trigger) {
          return [];
        }
        const resource = input.resource === 'qi' ? 'qi' : input.resource === 'hp' ? 'hp' : null;
        const mode = input.mode === 'max_ratio_bp' || input.mode === 'current_ratio_bp' || input.mode === 'flat'
          ? input.mode
          : null;
        const value = Number(input.value);
        if (!resource || !mode || !Number.isFinite(value) || value <= 0) {
          return [];
        }
        return [{
          effectId,
          type: 'periodic_cost',
          trigger,
          conditions,
          resource,
          mode,
          value: Math.max(0, Math.round(value)),
          minRemain: Number.isFinite(input.minRemain) ? Math.max(0, Math.floor(Number(input.minRemain))) : undefined,
        }];
      }
      case 'timed_buff': {
        const trigger = EQUIPMENT_TRIGGERS.includes(input.trigger as EquipmentTrigger)
          ? input.trigger as EquipmentTrigger
          : null;
        const buff = isPlainObject(input.buff) ? input.buff : null;
        if (!trigger || !buff || typeof buff.buffId !== 'string' || buff.buffId.trim().length === 0 || typeof buff.name !== 'string' || !Number.isFinite(buff.duration)) {
          return [];
        }
        return [{
          effectId,
          type: 'timed_buff',
          trigger,
          target: input.target === 'target' ? 'target' : 'self',
          cooldown: Number.isFinite(input.cooldown) ? Math.max(0, Math.floor(Number(input.cooldown))) : undefined,
          chance: Number.isFinite(input.chance) ? Math.max(0, Math.min(1, Number(input.chance))) : undefined,
          conditions,
          buff: {
            buffId: buff.buffId.trim(),
            name: buff.name,
            desc: typeof buff.desc === 'string' ? buff.desc : undefined,
            shortMark: typeof buff.shortMark === 'string' ? buff.shortMark : undefined,
            category: buff.category === 'debuff' ? 'debuff' : buff.category === 'buff' ? 'buff' : undefined,
            visibility: buff.visibility === 'hidden' || buff.visibility === 'observe_only' || buff.visibility === 'public'
              ? buff.visibility
              : undefined,
            color: typeof buff.color === 'string' ? buff.color : undefined,
            duration: Math.max(1, Math.floor(Number(buff.duration))),
            maxStacks: Number.isFinite(buff.maxStacks) ? Math.max(1, Math.floor(Number(buff.maxStacks))) : undefined,
            attrs: this.normalizeItemAttrs(buff.attrs),
            stats: this.normalizeItemStats(buff.stats),
          },
        }];
      }
      default:
        return [];
    }
  }

  private loadItems(): void {
    for (const raw of this.readJsonEntries<ItemTemplate>(this.itemsDir)) {
      const item: ItemTemplate = {
        ...raw,
        grade: raw.grade,
        level: Number.isFinite(raw.level) ? Math.max(1, Math.floor(Number(raw.level))) : undefined,
        equipAttrs: this.normalizeItemAttrs(raw.equipAttrs),
        equipStats: this.normalizeItemStats(raw.equipStats),
        effects: this.normalizeEquipmentEffects(raw.effects, raw.itemId),
        tags: normalizeStringArray(raw.tags),
      };
      this.items.set(item.itemId, item);
    }
  }

  private loadStarterInventory(): void {
    const raw = JSON.parse(fs.readFileSync(this.starterInventoryPath, 'utf-8')) as { items?: StarterInventoryEntry[] };
    this.starterInventoryEntries = Array.isArray(raw.items) ? raw.items : [];
  }

  private loadRealmLevels(): void {
    const raw = JSON.parse(fs.readFileSync(this.realmLevelsPath, 'utf-8')) as RealmLevelsConfig;
    const expMultiplier = Number.isFinite(raw.expMultiplier) ? Math.max(0, Math.floor(raw.expMultiplier ?? 1)) : 1;
    const levels = (raw.levels ?? []).map((entry) => ({
      ...entry,
      expToNext: entry.expToNext === undefined
        ? undefined
        : Math.max(0, Math.floor(entry.expToNext)) * expMultiplier,
    }));
    this.realmLevelsConfig = { ...raw, expMultiplier, levels };
    for (const entry of levels) {
      this.realmLevels.set(entry.realmLv, entry);
    }
  }

  private loadBreakthroughConfigs(): void {
    const raw = JSON.parse(fs.readFileSync(this.breakthroughConfigPath, 'utf-8')) as BreakthroughConfigFile;
    for (const transition of raw.transitions ?? []) {
      if (!Number.isInteger(transition.fromRealmLv)) continue;
      const fromRealmLv = Number(transition.fromRealmLv);
      const toRealmLv = Number.isInteger(transition.toRealmLv) ? Number(transition.toRealmLv) : fromRealmLv + 1;
      const requirements = Array.isArray(transition.requirements)
        ? transition.requirements.flatMap((requirement) => this.normalizeBreakthroughRequirement(requirement))
        : [];
      this.breakthroughConfigs.set(fromRealmLv, {
        fromRealmLv,
        toRealmLv,
        title: typeof transition.title === 'string' ? transition.title : undefined,
        requirements,
      });
    }
  }

  private normalizeBreakthroughRequirement(input: RawBreakthroughRequirement): BreakthroughRequirementDef[] {
    if (!input || typeof input !== 'object' || typeof input.id !== 'string') {
      return [];
    }
    if (input.type === 'item') {
      if (typeof input.itemId !== 'string' || !Number.isInteger(input.count)) return [];
      return [{
        id: input.id,
        type: 'item',
        itemId: input.itemId,
        count: Math.max(1, Number(input.count)),
        label: typeof input.label === 'string' ? input.label : undefined,
        hidden: input.hidden === true,
        increaseAttrRequirementPct: typeof input.increaseAttrRequirementPct === 'number' && Number.isFinite(input.increaseAttrRequirementPct)
          ? Math.max(0, Math.floor(input.increaseAttrRequirementPct))
          : undefined,
      }];
    }
    if (input.type === 'technique') {
      return [{
        id: input.id,
        type: 'technique',
        techniqueId: typeof input.techniqueId === 'string' ? input.techniqueId : undefined,
        minGrade: input.minGrade,
        minLevel: Number.isInteger(input.minLevel) ? Math.max(1, Number(input.minLevel)) : undefined,
        minRealm: input.minRealm === undefined ? undefined : this.parseTechniqueRealm(input.minRealm),
        count: Number.isInteger(input.count) ? Math.max(1, Number(input.count)) : undefined,
        label: typeof input.label === 'string' ? input.label : undefined,
        hidden: input.hidden === true,
        increaseAttrRequirementPct: typeof input.increaseAttrRequirementPct === 'number' && Number.isFinite(input.increaseAttrRequirementPct)
          ? Math.max(0, Math.floor(input.increaseAttrRequirementPct))
          : undefined,
      }];
    }
    if (input.type === 'attribute') {
      if (!['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'].includes(input.attr) || !Number.isFinite(input.minValue)) {
        return [];
      }
      return [{
        id: input.id,
        type: 'attribute',
        attr: input.attr,
        minValue: Math.max(1, Math.floor(input.minValue)),
        label: typeof input.label === 'string' ? input.label : undefined,
        hidden: input.hidden === true,
      }];
    }
    return [];
  }

  private readJsonEntries<T>(dirPath: string): T[] {
    const result: T[] = [];
    for (const filePath of this.collectJsonFiles(dirPath)) {
      const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T[];
      result.push(...raw);
    }
    return result;
  }

  private collectJsonFiles(dirPath: string): string[] {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    const files: string[] = [];
    for (const entry of entries) {
      const entryPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        files.push(...this.collectJsonFiles(entryPath));
        continue;
      }
      if (entry.isFile() && entry.name.endsWith('.json')) {
        files.push(entryPath);
      }
    }
    return files;
  }

  private parseTechniqueRealm(value: keyof typeof TechniqueRealm | TechniqueRealm): TechniqueRealm {
    if (typeof value === 'number') {
      return value;
    }
    return TechniqueRealm[value];
  }

  private parsePlayerRealmStage(value: keyof typeof PlayerRealmStage | PlayerRealmStage): PlayerRealmStage {
    if (typeof value === 'number') {
      return value;
    }
    return PlayerRealmStage[value];
  }

  /** 获取新角色初始背包 */
  getStarterInventory(): Inventory {
    return this.normalizeInventory({
      capacity: DEFAULT_INVENTORY_CAPACITY,
      items: this.starterInventoryEntries
        .map((entry) => this.createItem(entry.itemId, entry.count ?? 1))
        .filter((item): item is ItemStack => item !== null),
    });
  }

  /** 根据物品 ID 创建物品栈 */
  createItem(itemId: string, count = 1): ItemStack | null {
    const item = this.items.get(itemId);
    if (!item) return null;
    return {
      itemId: item.itemId,
      name: item.name,
      type: item.type,
      count,
      desc: item.desc,
      grade: item.grade,
      level: item.level,
      equipSlot: item.equipSlot,
      equipAttrs: item.equipAttrs,
      equipStats: item.equipStats,
      effects: item.effects,
      tags: item.tags,
      mapUnlockId: item.mapUnlockId,
    };
  }

  /** 规范化物品栈：用模板数据补全字段 */
  normalizeItemStack(item: ItemStack): ItemStack {
    const normalized = this.createItem(item.itemId, item.count);
    if (!normalized) {
      return { ...item };
    }
    return {
      ...item,
      ...normalized,
      count: normalized.count,
    };
  }

  /** 规范化背包：合并同类物品、补全模板数据 */
  normalizeInventory(inventory: Inventory): Inventory {
    const mergedItems: ItemStack[] = [];
    const mergedIndex = new Map<string, ItemStack>();
    for (const item of inventory.items.map((entry) => this.normalizeItemStack(entry))) {
      if (item.count <= 0) {
        continue;
      }
      const signature = createItemStackSignature(item);
      const existing = mergedIndex.get(signature);
      if (existing) {
        existing.count += item.count;
        continue;
      }
      const created = { ...item };
      mergedIndex.set(signature, created);
      mergedItems.push(created);
    }

    return {
      capacity: Math.max(DEFAULT_INVENTORY_CAPACITY, Number.isFinite(inventory.capacity) ? inventory.capacity : 0),
      items: mergedItems,
    };
  }

  /** 规范化装备槽数据 */
  normalizeEquipment(equipment: EquipmentSlots): EquipmentSlots {
    const normalized = { weapon: null, head: null, body: null, legs: null, accessory: null } as EquipmentSlots;
    for (const slot of EQUIP_SLOTS) {
      const item = equipment[slot];
      normalized[slot] = item ? { ...this.normalizeItemStack(item), count: 1 } : null;
    }
    return normalized;
  }

  getItem(itemId: string): ItemTemplate | undefined {
    return this.items.get(itemId);
  }

  getTechnique(techniqueId: string): TechniqueTemplate | undefined {
    return this.techniques.get(techniqueId);
  }

  getRealmLevelsConfig(): RealmLevelsConfig | null {
    return this.realmLevelsConfig;
  }

  getRealmLevelEntry(realmLv: number): RealmLevelEntry | undefined {
    return this.realmLevels.get(realmLv);
  }

  getEditorTechniqueCatalog(): EditorTechniqueCatalogEntry[] {
    return [...this.techniques.values()]
      .map((technique) => ({
        id: technique.id,
        name: technique.name,
        grade: technique.grade,
        skills: JSON.parse(JSON.stringify(technique.skills)) as SkillDef[],
        layers: JSON.parse(JSON.stringify(technique.layers)) as TechniqueLayerDef[],
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  getEditorItemCatalog(): EditorItemCatalogEntry[] {
    return [...this.items.values()]
      .map((item) => ({
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        grade: item.grade,
        level: item.level,
        equipSlot: item.equipSlot,
        desc: item.desc,
        equipAttrs: item.equipAttrs ? JSON.parse(JSON.stringify(item.equipAttrs)) as NonNullable<ItemStack['equipAttrs']> : undefined,
        equipStats: item.equipStats ? JSON.parse(JSON.stringify(item.equipStats)) as NonNullable<ItemStack['equipStats']> : undefined,
        tags: item.tags ? [...item.tags] : undefined,
        effects: item.effects ? JSON.parse(JSON.stringify(item.effects)) as EquipmentEffectDef[] : undefined,
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
  }

  getEditorRealmCatalog(): RealmLevelEntry[] {
    return [...this.realmLevels.values()].sort((left, right) => left.realmLv - right.realmLv);
  }

  getRealmLevelRange(stage: PlayerRealmStage): { levelFrom: number; levelTo: number } {
    return PLAYER_REALM_STAGE_LEVEL_RANGES[stage] ?? PLAYER_REALM_STAGE_LEVEL_RANGES[PlayerRealmStage.Mortal];
  }

  getBreakthroughConfig(fromRealmLv: number): BreakthroughConfigEntry | undefined {
    return this.breakthroughConfigs.get(fromRealmLv);
  }

  getRealmStageStartEntry(stage: PlayerRealmStage): RealmLevelEntry | undefined {
    return this.getRealmLevelEntry(this.getRealmLevelRange(stage).levelFrom);
  }

  /** 根据境界阶段和修炼进度解析对应的境界等级条目 */
  resolveRealmLevelEntry(
    stage: PlayerRealmStage,
    progress = 0,
    progressToNext = 0,
    breakthroughReady = false,
  ): RealmLevelEntry {
    const range = this.getRealmLevelRange(stage);
    const span = Math.max(1, range.levelTo - range.levelFrom + 1);
    let realmLv = range.levelFrom;

    if (span > 1) {
      if (breakthroughReady || progressToNext <= 0) {
        realmLv = range.levelTo;
      } else {
        const normalized = Math.max(0, Math.min(progress / progressToNext, 0.999999));
        realmLv = range.levelFrom + Math.min(span - 1, Math.floor(normalized * span));
      }
    }

    return this.realmLevels.get(realmLv)
      ?? this.realmLevels.get(range.levelFrom)
      ?? {
        realmLv: range.levelFrom,
        displayName: '未知境界',
        name: '未知境界',
        phaseName: null,
        segment: 'martial',
        path: 'martial',
        grade: 'mortal',
        gradeLabel: '凡阶',
        review: '',
      };
  }

  /** 跨功法全局查找技能定义 */
  getSkill(skillId: string): SkillDef | undefined {
    for (const technique of this.techniques.values()) {
      const skill = technique.skills.find((entry) => entry.id === skillId);
      if (skill) return skill;
    }
    return undefined;
  }
}
