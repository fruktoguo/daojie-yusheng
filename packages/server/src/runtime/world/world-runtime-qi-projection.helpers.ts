/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 灵气投影计算辅助函数
 * 根据玩家功法、buff、属性加成计算灵气资源的可见性和吸收效率
 */
import {
  DEFAULT_PLAYER_QI_RESOURCE_KEYS,
  DEFAULT_QI_EFFICIENCY_BP,
  calcTechniqueQiProjectionModifiers,
  matchesQiProjectionSelector,
  parseQiResourceKey,
  projectQiValue,
  stackQiEfficiencyBp,
  type QiProjectionModifier,
  type QiResourceDescriptor,
  type QiVisibilityLevel,
  type TechniqueLayerDef,
} from '@mud/shared';

const QI_VISIBILITY_RANK: Record<QiVisibilityLevel, number> = {
  hidden: 0,
  observable: 1,
  absorbable: 2,
};

interface QiProjectionTechniqueState {
  level?: number;
  layers?: TechniqueLayerDef[];
}

interface QiProjectionBuffState {
  remainingTicks?: number;
  stacks?: number;
  qiProjection?: QiProjectionModifier[];
}

interface QiProjectionBonusState {
  qiProjection?: QiProjectionModifier[];
}

interface QiProjectionPlayerView {
  techniques?: {
    revision?: number;
    techniques?: QiProjectionTechniqueState[] | null;
  };
  buffs?: {
    revision?: number;
    buffs?: QiProjectionBuffState[] | null;
  };
  attrBonuses?: QiProjectionBonusState[] | null;
  runtimeBonuses?: QiProjectionBonusState[] | null;
}

interface QiProjectionTechniqueInputSnapshot {
  technique: QiProjectionTechniqueState;
  level: number | undefined;
  layers: TechniqueLayerDef[] | undefined;
}

interface QiProjectionBuffInputSnapshot {
  buff: QiProjectionBuffState;
  active: boolean;
  qiProjection: QiProjectionModifier[] | undefined;
}

/** 玩家对单个灵气资源的投影结果 */
export interface PlayerQiResourceProjection {
  descriptor: QiResourceDescriptor;
  visibility: QiVisibilityLevel;
  efficiencyBp: number;
}

interface PlayerQiProjectionCacheSignature {
  techniquesRevision: number;
  techniquesRef: QiProjectionTechniqueState[] | null | undefined;
  buffsRevision: number;
  buffsRef: QiProjectionBuffState[] | null | undefined;
  attrBonusesRef: QiProjectionBonusState[] | null | undefined;
  runtimeBonusesRef: QiProjectionBonusState[] | null | undefined;
}

interface PlayerQiProjectionCacheEntry {
  signature: PlayerQiProjectionCacheSignature;
  techniqueInputs: QiProjectionTechniqueInputSnapshot[];
  buffInputs: QiProjectionBuffInputSnapshot[];
  modifiers: QiProjectionModifier[];
  projections: Map<string, PlayerQiResourceProjection | null>;
}

const playerQiProjectionCache = new WeakMap<object, PlayerQiProjectionCacheEntry>();

/** 计算玩家对指定灵气资源的实际吸收值（不可吸收返回 0） */
export function projectPlayerQiResourceValue(
  player: QiProjectionPlayerView | null | undefined,
  resourceKey: string,
  rawValue: number,
): number {
  const projection = resolvePlayerQiResourceProjection(player, resourceKey);
  if (!projection || projection.visibility !== 'absorbable') {
    return 0;
  }
  return projectQiValue(rawValue, projection.efficiencyBp);
}

/** 解析玩家对指定灵气资源的完整投影（可见性 + 效率） */
export function resolvePlayerQiResourceProjection(
  player: QiProjectionPlayerView | null | undefined,
  resourceKey: string,
): PlayerQiResourceProjection | null {
  const cache = getPlayerQiProjectionCache(player);
  if (cache?.projections.has(resourceKey)) {
    return cache.projections.get(resourceKey) ?? null;
  }
  const descriptor = parseQiResourceKey(resourceKey);
  if (!descriptor) {
    cache?.projections.set(resourceKey, null);
    return null;
  }
  const defaultVisible = DEFAULT_PLAYER_QI_RESOURCE_KEYS.includes(resourceKey);
  let visibility: QiVisibilityLevel = defaultVisible ? 'absorbable' : 'hidden';
  let efficiencyBp = defaultVisible ? DEFAULT_QI_EFFICIENCY_BP : 0;
  for (const modifier of cache?.modifiers ?? collectPlayerQiProjectionModifiers(player)) {
    if (!matchesQiProjectionSelector(descriptor, resourceKey, modifier.selector)) {
      continue;
    }
    if (modifier.visibility && QI_VISIBILITY_RANK[modifier.visibility] > QI_VISIBILITY_RANK[visibility]) {
      visibility = modifier.visibility;
    }
    if (modifier.efficiencyBpMultiplier !== undefined) {
      efficiencyBp = defaultVisible
        ? stackQiEfficiencyBp(efficiencyBp, modifier.efficiencyBpMultiplier)
        : Math.max(0, efficiencyBp + modifier.efficiencyBpMultiplier - DEFAULT_QI_EFFICIENCY_BP);
    }
  }
  const projection = {
    descriptor,
    visibility,
    efficiencyBp,
  };
  cache?.projections.set(resourceKey, projection);
  return projection;
}

function collectPlayerQiProjectionModifiers(player: QiProjectionPlayerView | null | undefined): QiProjectionModifier[] {
  const modifiers: QiProjectionModifier[] = [];
  for (const technique of player?.techniques?.techniques ?? []) {
    modifiers.push(...calcTechniqueQiProjectionModifiers(technique.level ?? 1, technique.layers ?? undefined));
  }
  for (const buff of player?.buffs?.buffs ?? []) {
    if ((buff.remainingTicks ?? 0) <= 0 || (buff.stacks ?? 0) <= 0 || !Array.isArray(buff.qiProjection)) {
      continue;
    }
    modifiers.push(...buff.qiProjection);
  }
  for (const bonus of player?.attrBonuses ?? []) {
    if (Array.isArray(bonus.qiProjection)) {
      modifiers.push(...bonus.qiProjection);
    }
  }
  for (const bonus of player?.runtimeBonuses ?? []) {
    if (Array.isArray(bonus.qiProjection)) {
      modifiers.push(...bonus.qiProjection);
    }
  }
  return modifiers;
}

function getPlayerQiProjectionCache(
  player: QiProjectionPlayerView | null | undefined,
): PlayerQiProjectionCacheEntry | null {
  if (!player || typeof player !== 'object') {
    return null;
  }
  const signature = buildPlayerQiProjectionCacheSignature(player);
  const cached = playerQiProjectionCache.get(player);
  if (cached && isSamePlayerQiProjectionCacheSignature(cached.signature, signature)) {
    return cached;
  }
  if (cached
    && cached.signature.attrBonusesRef === signature.attrBonusesRef
    && cached.signature.runtimeBonusesRef === signature.runtimeBonusesRef
    && hasSameTechniqueProjectionInputs(signature.techniquesRef, cached.techniqueInputs)
    && hasSameBuffProjectionInputs(signature.buffsRef, cached.buffInputs)) {
    cached.signature = signature;
    return cached;
  }
  const entry: PlayerQiProjectionCacheEntry = {
    signature,
    techniqueInputs: snapshotTechniqueProjectionInputs(signature.techniquesRef),
    buffInputs: snapshotBuffProjectionInputs(signature.buffsRef),
    modifiers: collectPlayerQiProjectionModifiers(player),
    projections: new Map(),
  };
  playerQiProjectionCache.set(player, entry);
  return entry;
}

function buildPlayerQiProjectionCacheSignature(player: QiProjectionPlayerView): PlayerQiProjectionCacheSignature {
  return {
    techniquesRevision: normalizeRevision(player.techniques?.revision),
    techniquesRef: player.techniques?.techniques,
    buffsRevision: normalizeRevision(player.buffs?.revision),
    buffsRef: player.buffs?.buffs,
    attrBonusesRef: player.attrBonuses,
    runtimeBonusesRef: player.runtimeBonuses,
  };
}

function isSamePlayerQiProjectionCacheSignature(
  left: PlayerQiProjectionCacheSignature,
  right: PlayerQiProjectionCacheSignature,
): boolean {
  return left.techniquesRevision === right.techniquesRevision
    && left.techniquesRef === right.techniquesRef
    && left.buffsRevision === right.buffsRevision
    && left.buffsRef === right.buffsRef
    && left.attrBonusesRef === right.attrBonusesRef
    && left.runtimeBonusesRef === right.runtimeBonusesRef;
}

function snapshotTechniqueProjectionInputs(
  techniques: QiProjectionTechniqueState[] | null | undefined,
): QiProjectionTechniqueInputSnapshot[] {
  return (techniques ?? []).map((technique) => ({
    technique,
    level: technique.level,
    layers: technique.layers,
  }));
}

function hasSameTechniqueProjectionInputs(
  techniques: QiProjectionTechniqueState[] | null | undefined,
  snapshots: QiProjectionTechniqueInputSnapshot[],
): boolean {
  const entries = techniques ?? [];
  if (entries.length !== snapshots.length) {
    return false;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const technique = entries[index];
    const snapshot = snapshots[index];
    if (technique !== snapshot.technique
      || technique.level !== snapshot.level
      || technique.layers !== snapshot.layers) {
      return false;
    }
  }
  return true;
}

function snapshotBuffProjectionInputs(
  buffs: QiProjectionBuffState[] | null | undefined,
): QiProjectionBuffInputSnapshot[] {
  return (buffs ?? []).map((buff) => ({
    buff,
    active: isQiProjectionBuffActive(buff),
    qiProjection: buff.qiProjection,
  }));
}

function hasSameBuffProjectionInputs(
  buffs: QiProjectionBuffState[] | null | undefined,
  snapshots: QiProjectionBuffInputSnapshot[],
): boolean {
  const entries = buffs ?? [];
  if (entries.length !== snapshots.length) {
    return false;
  }
  for (let index = 0; index < entries.length; index += 1) {
    const buff = entries[index];
    const snapshot = snapshots[index];
    if (buff !== snapshot.buff
      || isQiProjectionBuffActive(buff) !== snapshot.active
      || buff.qiProjection !== snapshot.qiProjection) {
      return false;
    }
  }
  return true;
}

function isQiProjectionBuffActive(buff: QiProjectionBuffState): boolean {
  return (buff.remainingTicks ?? 0) > 0
    && (buff.stacks ?? 0) > 0
    && Array.isArray(buff.qiProjection);
}

function normalizeRevision(value: unknown): number {
  return Number.isFinite(Number(value)) ? Math.trunc(Number(value)) : 0;
}
