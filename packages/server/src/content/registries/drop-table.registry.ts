import { Injectable } from '@nestjs/common';
import { EQUIP_SLOTS, normalizeMonsterTier as normalizeSharedMonsterTier } from '@mud/shared';
import { resolveItemTemplateLevel } from '../content-template-utils';
import { ItemTemplateRegistry } from './item-template.registry';
import { TechniqueTemplateRegistry } from './technique-template.registry';
import { freezeTemplateMap } from './template-freeze';

const ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD = 1;
const ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER = 0.7;

@Injectable()
export class DropTableRegistry {
  readonly monsterDropsByMonsterId = new Map<string, any[]>();

  constructor(
    private itemRegistry: ItemTemplateRegistry = new ItemTemplateRegistry(),
    private techniqueRegistry: TechniqueTemplateRegistry = new TechniqueTemplateRegistry(),
  ) {}

  setTemplateRegistries(itemRegistry: ItemTemplateRegistry, techniqueRegistry: TechniqueTemplateRegistry): void {
    this.itemRegistry = itemRegistry;
    this.techniqueRegistry = techniqueRegistry;
  }

  loadAll(): void {
    this.monsterDropsByMonsterId.clear();
  }

  getRef(monsterId: string): readonly any[] {
    const table = this.tryGetRef(monsterId);
    if (!table) {
      throw new Error(`未找到妖兽掉落表：${monsterId}`);
    }
    return table;
  }

  tryGetRef(monsterId: string): readonly any[] | undefined {
    return this.monsterDropsByMonsterId.get(String(monsterId ?? '').trim());
  }

  createInstance(monsterId: string, init: any = {}): any {
    return { ...init, monsterId };
  }

  hydrate(monsterId: string, payload: any = {}): any {
    return this.createInstance(monsterId, payload);
  }

  listIds(): readonly string[] {
    return Array.from(this.monsterDropsByMonsterId.keys()).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
  }

  freezeAll(): void {
    freezeTemplateMap(this.monsterDropsByMonsterId);
  }

  rollLootPoolItems(query: any): any[] {
    const chance = typeof query.chance === 'number' ? Math.max(0, Math.min(1, query.chance)) : 1;
    if (chance <= 0 || Math.random() > chance) {
      return [];
    }
    const candidates = this.getLootPoolCandidateIds(query);
    if (candidates.length === 0) {
      return [];
    }
    const rolls = Number.isInteger(query.rolls) && Number(query.rolls) > 0 ? Number(query.rolls) : 1;
    const countMin = Number.isInteger(query.countMin) && Number(query.countMin) > 0 ? Number(query.countMin) : 1;
    const countMax = Number.isInteger(query.countMax) && Number(query.countMax) >= countMin ? Number(query.countMax) : countMin;
    const allowDuplicates = query.allowDuplicates === true;
    const pool = candidates.slice();
    const result = [];
    for (let index = 0; index < rolls; index += 1) {
      const source = allowDuplicates ? candidates : pool;
      if (source.length === 0) {
        break;
      }
      const pickedIndex = Math.floor(Math.random() * source.length);
      const pickedItemId = source[pickedIndex];
      if (!pickedItemId) {
        continue;
      }
      const item = this.itemRegistry.createItem(pickedItemId, randomIntInclusive(countMin, countMax));
      if (item) {
        result.push(item);
      }
      if (!allowDuplicates) {
        pool.splice(pickedIndex, 1);
      }
    }
    return result;
  }

  rollMonsterDrops(monsterId: string, rolls = 1, lootRateBonus = 0, rareLootRateBonus = 0, context: any = {}): any[] {
    const dropTable = this.monsterDropsByMonsterId.get(monsterId);
    if (!dropTable || dropTable.length === 0) {
      return [];
    }
    const normalizedRolls = Math.max(1, Math.trunc(rolls));
    const result = new Map<string, any>();
    const normalizedLootRateBonus = Number.isFinite(lootRateBonus) ? lootRateBonus : 0;
    const normalizedRareLootRateBonus = Number.isFinite(rareLootRateBonus) ? rareLootRateBonus : 0;
    for (let rollIndex = 0; rollIndex < normalizedRolls; rollIndex += 1) {
      for (const drop of dropTable) {
        const baseChance = typeof drop.chance === 'number' ? Math.max(0, Math.min(1, drop.chance)) : 1;
        const totalRateBonus = normalizedLootRateBonus + (baseChance <= 0.001 ? normalizedRareLootRateBonus : 0);
        const killEquivalent = totalRateBonus >= 0
          ? 1 + totalRateBonus / 10000
          : 1 / (1 + Math.abs(totalRateBonus) / 10000);
        const chance = baseChance <= 0 || killEquivalent <= 0
          ? 0
          : (1 - Math.pow(1 - baseChance, killEquivalent))
            * this.getOrdinaryMonsterSpiritStoneDropMultiplier(drop, context);
        if (chance <= 0 || Math.random() > chance) {
          continue;
        }
        const existing = result.get(drop.itemId);
        if (existing) {
          existing.count += drop.count;
          continue;
        }
        const item = this.itemRegistry.createItem(drop.itemId, drop.count) ?? {
          itemId: drop.itemId,
          name: drop.name,
          type: drop.type,
          count: drop.count,
        };
        result.set(drop.itemId, item);
      }
    }
    return Array.from(result.values()).sort((left, right) => left.itemId.localeCompare(right.itemId, 'zh-Hans-CN'));
  }

  buildMonsterDrops(rawDrops: any, rawEquipment: any, context: any): any[] {
    const configuredDrops = Array.isArray(rawDrops)
      ? rawDrops
        .map((entry) => this.normalizeMonsterDropEntry(entry))
        .filter((entry) => Boolean(entry))
      : [];
    let spiritStoneOverride = undefined;
    const drops = [];
    for (const entry of configuredDrops) {
      if (entry.itemId === 'spirit_stone') {
        spiritStoneOverride = entry;
        continue;
      }
      drops.push(this.resolveMonsterDropChance(entry, context));
    }
    const existingItemIds = new Set(drops.map((entry) => entry.itemId));
    if (rawEquipment && typeof rawEquipment === 'object') {
      for (const slot of EQUIP_SLOTS) {
        const itemId = this.resolveRawEquipmentItemId(rawEquipment[slot]);
        if (!itemId || existingItemIds.has(itemId)) {
          continue;
        }
        const item = this.itemRegistry.itemTemplates.get(itemId);
        if (!item || item.type !== 'equipment') {
          continue;
        }
        drops.push(this.resolveMonsterDropChance({
          itemId,
          name: item.name ?? itemId,
          type: item.type,
          count: 1,
        }, context));
        existingItemIds.add(itemId);
      }
    }
    const spiritStoneDrop = context?.suppressSpiritStoneDrop === true
      ? null
      : this.buildSpiritStoneMonsterDrop(context, spiritStoneOverride);
    if (spiritStoneDrop) {
      drops.push(spiritStoneDrop);
    }
    return drops;
  }

  resolveMonsterDropChance(drop: any, context: any): any {
    if (typeof drop.chance === 'number') {
      return {
        ...drop,
        chance: Math.max(0, Math.min(1, drop.chance)),
      };
    }
    return {
      ...drop,
      chance: this.computeDefaultMonsterDropChance(drop, context),
    };
  }

  computeDefaultMonsterDropChance(drop: any, context: any): number {
    if (drop.type === 'quest_item') {
      return 1;
    }
    if (drop.type === 'material') {
      return this.getMaterialBaseDropChance(context.tier);
    }
    if (drop.type === 'equipment') {
      return this.getEquipmentBaseDropChance(context.tier);
    }
    const categoryBase = this.getMonsterDropCategoryBase(drop);
    const itemGrade = this.getMonsterDropItemGrade(drop);
    const monsterGradeIndex = resolveTechniqueGradeOrder(context.grade) ?? 0;
    const itemGradeIndex = resolveTechniqueGradeOrder(itemGrade) ?? 0;
    const gradeDelta = Math.max(-7, monsterGradeIndex - itemGradeIndex);
    const chance = 0.01 * categoryBase * (3 ** gradeDelta) * this.getMonsterTierDropFactor(context.tier);
    return Math.max(Number.MIN_VALUE, Math.min(1, chance));
  }

  getMaterialBaseDropChance(tier: string): number {
    switch (tier) {
      case 'variant':
        return 0.2;
      case 'demon_king':
        return 0.5;
      default:
        return 0.05;
    }
  }

  getEquipmentBaseDropChance(tier: string): number {
    switch (tier) {
      case 'variant':
        return 0.2;
      case 'demon_king':
        return 0.5;
      default:
        return 0.05;
    }
  }

  getOrdinaryMonsterSpiritStoneDropMultiplier(drop: any, context: any): number {
    if (drop.itemId !== 'spirit_stone' || normalizeSharedMonsterTier(context?.monsterTier) !== 'mortal_blood') {
      return 1;
    }
    const playerRealmLv = Math.max(1, Math.floor(Number(context?.playerRealmLv) || 1));
    const monsterLevel = Math.max(1, Math.floor(Number(context?.monsterLevel) || 1));
    return playerRealmLv - monsterLevel >= ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_THRESHOLD
      ? ORDINARY_MONSTER_OVERLEVEL_SPIRIT_STONE_DROP_MULTIPLIER
      : 1;
  }

  getMonsterDropCategoryBase(drop: any): number {
    if (drop.itemId === 'spirit_stone') {
      return 1;
    }
    switch (drop.type) {
      case 'skill_book':
        return 1;
      case 'equipment':
        return 2;
      case 'material':
        return 20;
      case 'consumable':
        return 10;
      case 'quest_item':
        return 100;
      default:
        return 1;
    }
  }

  getMonsterTierDropFactor(tier: string): number {
    switch (tier) {
      case 'variant':
        return 1 / 3;
      case 'demon_king':
        return 1;
      default:
        return 0.1;
    }
  }

  getMonsterDropItemGrade(drop: any): string {
    const item = this.itemRegistry.itemTemplates.get(drop.itemId);
    if (item?.grade) {
      return normalizeTechniqueGrade(item.grade);
    }
    if (item?.learnTechniqueId) {
      return normalizeTechniqueGrade(this.techniqueRegistry.techniqueTemplates.get(item.learnTechniqueId as string)?.grade);
    }
    if (typeof item?.level === 'number' && Number.isFinite(item.level)) {
      return inferTechniqueGradeFromItemLevel(item.level);
    }
    return 'mortal';
  }

  buildSpiritStoneMonsterDrop(context: any, override: any): any {
    const item = this.itemRegistry.itemTemplates.get('spirit_stone');
    if (!item) {
      return null;
    }
    const count = typeof override?.count === 'number' && Number.isFinite(override.count)
      ? Math.max(1, Math.trunc(override.count))
      : this.computeSpiritStoneDropCount(context);
    const chance = typeof override?.chance === 'number' && Number.isFinite(override.chance)
      ? Math.max(0, Math.min(1, override.chance))
      : this.computeSpiritStoneDropChance(context.tier);
    return {
      itemId: item.itemId,
      name: item.name ?? item.itemId,
      type: item.type,
      count,
      chance,
    };
  }

  computeSpiritStoneDropChance(tier: string): number {
    switch (tier) {
      case 'variant':
        return 0.03;
      case 'demon_king':
        return 0.1;
      default:
        return 0.01;
    }
  }

  computeSpiritStoneDropCount(context: any): number {
    const gradeIndex = Math.max(0, resolveTechniqueGradeOrder(context.grade) ?? 0);
    const level = typeof context.level === 'number' && Number.isFinite(context.level)
      ? Math.max(1, Math.trunc(context.level))
      : 1;
    return Math.max(1, Math.floor(1 + (gradeIndex * 0.5) + (Math.floor(level / 12) * 0.5)));
  }

  resolveRawEquipmentItemId(entry: any): string {
    if (typeof entry === 'string') {
      return entry.trim();
    }
    if (entry && typeof entry === 'object' && typeof entry.itemId === 'string') {
      return entry.itemId.trim();
    }
    return '';
  }

  normalizeMonsterDropEntry(raw: any): any {
    if (!raw || typeof raw !== 'object') {
      return null;
    }
    if (typeof raw.itemId !== 'string' || !raw.itemId.trim()) {
      return null;
    }
    const itemId = raw.itemId.trim();
    const item = this.itemRegistry.itemTemplates.get(itemId);
    const type = raw.type ?? item?.type;
    if (!type) {
      return null;
    }
    return {
      itemId,
      name: typeof raw.name === 'string' && raw.name.trim()
        ? raw.name
        : (item?.name ?? itemId),
      type,
      count: Number.isFinite(raw.count) ? Math.max(1, Math.trunc(raw.count ?? 1)) : 1,
      chance: Number.isFinite(raw.chance) ? Math.max(0, Math.min(1, Number(raw.chance))) : undefined,
    };
  }

  getLootPoolCandidateIds(query: any): string[] {
    const result = [];
    for (const [itemId, item] of this.itemRegistry.itemTemplates) {
      if (!matchesLootPoolFilters(item, query)) {
        continue;
      }
      result.push(itemId);
    }
    result.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
    return result;
  }
}

function normalizeTechniqueGrade(raw: any): string {
  switch (raw) {
    case 'yellow':
    case 'mystic':
    case 'earth':
    case 'heaven':
    case 'spirit':
    case 'saint':
    case 'emperor':
      return raw;
    default:
      return 'mortal';
  }
}

function matchesLootPoolFilters(item: any, query: any): boolean {
  const level = resolveItemTemplateLevel(item);
  if (typeof query.minLevel === 'number' && level < Math.max(1, Math.trunc(query.minLevel))) {
    return false;
  }
  if (typeof query.maxLevel === 'number' && level > Math.max(1, Math.trunc(query.maxLevel))) {
    return false;
  }
  const gradeOrder = resolveTechniqueGradeOrder(item.grade);
  if (gradeOrder === null) {
    return false;
  }
  const minGradeOrder = resolveTechniqueGradeOrder(query.minGrade);
  if (minGradeOrder !== null && gradeOrder < minGradeOrder) {
    return false;
  }
  const maxGradeOrder = resolveTechniqueGradeOrder(query.maxGrade);
  if (maxGradeOrder !== null && gradeOrder > maxGradeOrder) {
    return false;
  }
  const tagGroups = Array.isArray(query.tagGroups)
    ? query.tagGroups.filter((group) => Array.isArray(group) && group.length > 0)
    : [];
  if (tagGroups.length === 0) {
    return true;
  }
  const tagSet = new Set((item.tags ?? []).filter((tag) => typeof tag === 'string' && tag.length > 0));
  return tagGroups.every((group) => group.some((tag) => tagSet.has(tag)));
}

function resolveTechniqueGradeOrder(grade: any): number | null {
  switch (grade) {
    case 'mortal':
      return 0;
    case 'yellow':
      return 1;
    case 'mystic':
      return 2;
    case 'earth':
      return 3;
    case 'heaven':
      return 4;
    case 'spirit':
      return 5;
    case 'saint':
      return 6;
    case 'emperor':
      return 7;
    default:
      return null;
  }
}

function inferTechniqueGradeFromItemLevel(level: number): string {
  const normalizedLevel = Math.max(1, Math.trunc(Number(level)));
  if (normalizedLevel >= 85) {
    return 'emperor';
  }
  if (normalizedLevel >= 73) {
    return 'saint';
  }
  if (normalizedLevel >= 61) {
    return 'spirit';
  }
  if (normalizedLevel >= 49) {
    return 'heaven';
  }
  if (normalizedLevel >= 37) {
    return 'earth';
  }
  if (normalizedLevel >= 25) {
    return 'mystic';
  }
  if (normalizedLevel >= 13) {
    return 'yellow';
  }
  return 'mortal';
}

function randomIntInclusive(min: number, max: number): number {
  if (max <= min) {
    return min;
  }
  return min + Math.floor(Math.random() * ((max - min) + 1));
}
