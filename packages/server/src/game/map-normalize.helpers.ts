import {
  GmMapContainerLootPoolRecord,
  GmMapResourceRecord,
  ItemType,
  MapMeta,
  normalizeConfiguredAuraValue,
  parseQiResourceKey,
  TechniqueGrade,
} from '@mud/shared';
import {
  AURA_RESOURCE_KEY,
  ContainerLootPoolConfig,
  DropConfig,
  MapAuraPoint,
  MapTileResourcePoint,
} from './map.service.shared';

/** normalizeContainerGrade：执行对应的业务逻辑。 */
export function normalizeContainerGrade(grade: unknown): TechniqueGrade {
  if (
    grade === 'mortal' ||
    grade === 'yellow' ||
    grade === 'mystic' ||
    grade === 'earth' ||
    grade === 'heaven' ||
    grade === 'spirit' ||
    grade === 'saint' ||
    grade === 'emperor'
  ) {
    return grade;
  }
  return 'mortal';
}

/** normalizeAuraPoints：执行对应的业务逻辑。 */
export function normalizeAuraPoints(
  rawAuras: unknown,
  meta: MapMeta,
  auraLevelBaseValue: number,
  warn: (message: string) => void,
): MapAuraPoint[] {
  if (!Array.isArray(rawAuras)) return [];

/** result：定义该变量以承载业务值。 */
  const result: MapAuraPoint[] = [];
  for (const candidate of rawAuras) {
    const point = candidate as Partial<MapAuraPoint>;
    const valid =
      Number.isInteger(point.x) &&
      Number.isInteger(point.y) &&
      Number.isInteger(point.value);
    if (!valid) {
      warn(`地图 ${meta.id} 存在非法灵气配置，已忽略`);
      continue;
    }
    if (
      point.x! < 0 || point.x! >= meta.width ||
      point.y! < 0 || point.y! >= meta.height
    ) {
      warn(`地图 ${meta.id} 的灵气坐标越界: (${point.x}, ${point.y})`);
      continue;
    }
    result.push({
      x: point.x!,
      y: point.y!,
      value: normalizeConfiguredAuraValue(point.value!, auraLevelBaseValue),
    });
  }
  return result;
}

/** normalizeTileResourcePoints：执行对应的业务逻辑。 */
export function normalizeTileResourcePoints(
  rawResources: unknown,
  meta: MapMeta,
  auraLevelBaseValue: number,
  normalizeTileResourceKey: (rawKey: unknown) => string | null,
  warn: (message: string) => void,
): MapTileResourcePoint[] {
  if (!Array.isArray(rawResources)) {
    return [];
  }

/** result：定义该变量以承载业务值。 */
  const result: MapTileResourcePoint[] = [];
  for (const candidate of rawResources) {
    const point = candidate as Partial<GmMapResourceRecord>;
    const resourceKey = normalizeTileResourceKey(point.resourceKey);
/** valid：定义该变量以承载业务值。 */
    const valid =
      Number.isInteger(point.x) &&
      Number.isInteger(point.y) &&
      Number.isInteger(point.value) &&
      typeof resourceKey === 'string' &&
      resourceKey !== AURA_RESOURCE_KEY &&
      parseQiResourceKey(resourceKey);
    if (!valid) {
      warn(`地图 ${meta.id} 存在非法气机配置，已忽略`);
      continue;
    }
    if (
      point.x! < 0 || point.x! >= meta.width ||
      point.y! < 0 || point.y! >= meta.height
    ) {
      warn(`地图 ${meta.id} 的气机坐标越界: (${point.x}, ${point.y})`);
      continue;
    }
    result.push({
      x: point.x!,
      y: point.y!,
      resourceKey,
      value: normalizeConfiguredAuraValue(point.value!, auraLevelBaseValue),
    });
  }
  return result;
}

/** normalizeDrops：执行对应的业务逻辑。 */
export function normalizeDrops(rawDrops: unknown): DropConfig[] {
  if (!Array.isArray(rawDrops)) {
    return [];
  }

/** drops：定义该变量以承载业务值。 */
  const drops: DropConfig[] = [];
  for (const rawDrop of rawDrops) {
    const drop = rawDrop as Partial<DropConfig>;
    if (
      typeof drop.itemId !== 'string' ||
      typeof drop.name !== 'string' ||
      typeof drop.type !== 'string'
    ) {
      continue;
    }
    drops.push({
      itemId: drop.itemId,
      name: drop.name,
      type: drop.type as ItemType,
      count: Number.isInteger(drop.count) ? Number(drop.count) : 1,
/** chance：定义该变量以承载业务值。 */
      chance: typeof drop.chance === 'number' ? drop.chance : 1,
    });
  }
  return drops;
}

/** normalizeContainerLootPools：执行对应的业务逻辑。 */
export function normalizeContainerLootPools(rawPools: unknown): ContainerLootPoolConfig[] {
  if (!Array.isArray(rawPools)) {
    return [];
  }

/** pools：定义该变量以承载业务值。 */
  const pools: ContainerLootPoolConfig[] = [];
  for (const rawPool of rawPools) {
    const pool = rawPool as Partial<GmMapContainerLootPoolRecord>;
    const normalizedTagGroups = Array.isArray(pool.tagGroups)
      ? pool.tagGroups
        .map((group) => Array.isArray(group)
          ? group
            .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
            .map((entry) => entry.trim())
          : [])
        .filter((group) => group.length > 0)
      : [];
/** rolls：定义该变量以承载业务值。 */
    const rolls = Number.isInteger(pool.rolls) && Number(pool.rolls) > 0 ? Number(pool.rolls) : 1;
/** chance：定义该变量以承载业务值。 */
    const chance = typeof pool.chance === 'number' ? Math.max(0, Math.min(1, Number(pool.chance))) : 1;
/** minLevel：定义该变量以承载业务值。 */
    const minLevel = Number.isInteger(pool.minLevel) && Number(pool.minLevel) > 0 ? Number(pool.minLevel) : undefined;
/** maxLevel：定义该变量以承载业务值。 */
    const maxLevel = Number.isInteger(pool.maxLevel) && Number(pool.maxLevel) > 0 ? Number(pool.maxLevel) : undefined;
/** countMin：定义该变量以承载业务值。 */
    const countMin = Number.isInteger(pool.countMin) && Number(pool.countMin) > 0 ? Number(pool.countMin) : undefined;
/** countMax：定义该变量以承载业务值。 */
    const countMax = Number.isInteger(pool.countMax) && Number(pool.countMax) > 0 ? Number(pool.countMax) : undefined;
    pools.push({
      rolls,
      chance,
      minLevel,
      maxLevel,
      minGrade: pool.minGrade ? normalizeContainerGrade(pool.minGrade) : undefined,
      maxGrade: pool.maxGrade ? normalizeContainerGrade(pool.maxGrade) : undefined,
      tagGroups: normalizedTagGroups,
      countMin,
      countMax,
/** allowDuplicates：定义该变量以承载业务值。 */
      allowDuplicates: pool.allowDuplicates === true,
    });
  }
  return pools;
}

