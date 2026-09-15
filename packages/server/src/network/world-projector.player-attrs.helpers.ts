/**
 * 世界投影器 — 玩家特殊属性/装备/文本解析辅助函数。
 *
 * 从 world-projector.helpers.ts 拆分而来，负责玩家特殊属性缓存、装备效果投影、
 * 传送门渲染、玩家显示文本归一化等纯计算辅助。
 * 维护时要保持缓存失效条件与投影器主链路一致。
 */
import {
  type AttrBonus,
  type PlayerSpecialStats,
  type SyncedItemStack,
  type ItemStack,
  type VisibleBuffState,
  applyEquipmentAttributeEffectivenessToItemStack,
  getFirstGrapheme,
  resolvePlayerFacingContentName,
} from '@mud/shared';
import { resolvePlayerDailySignInFortuneLuck } from '../runtime/player/player-special-stat.helpers';
import {
  type ProjectorPlayerLike,
  type ProjectorPortalLike,
  type ProjectedActionEntry,
} from './projector-types';
import { cloneAttrBonus } from './projector-clone';
import { isSameAttrBonuses } from './projector-compare';
import {
  buildAttrDetailBonuses,
  getTechniqueEffectRevision,
  getTechniqueFinalSpecialStatBonusCached,
} from './world-gateway-attr-detail.helper';
import { stableShallowSignature, stableShallowHash, fnvMix, FNV_OFFSET_BASIS } from './world-projector.panel-slices.helpers';

const attrBonusCloneCache = new WeakMap<AttrBonus[], AttrBonus[]>();
const projectedAttrBonusCache = new WeakMap<ProjectorPlayerLike, {
    signature: string;
    techniquesHolder: ProjectorPlayerLike['techniques'];
    techniquesRef: ProjectorPlayerLike['techniques']['techniques'];
    bonuses: AttrBonus[];
}>();
type AttrBonusConditionDependencies = {
    revision: number;
    slotsRef: unknown[];
    hpRatio: boolean;
    qiRatio: boolean;
    cultivating: boolean;
    map: boolean;
    unknown: boolean;
};
const attrBonusConditionDependencyCache = new WeakMap<object, AttrBonusConditionDependencies>();

type SpecialStatsCacheEntry = {
    techniquesHolder: ProjectorPlayerLike['techniques'];
    techniquesRef: ProjectorPlayerLike['techniques']['techniques'];
    attrsRevision: number;
    techniqueEffectRevision: number;
    equipmentRevision: number;
    foundation: number;
    rootFoundation: number;
    bodyTrainingLevel: number;
    combatExp: number;
    comprehension: number;
    luck: number;
    fengShuiLuck: number;
    dailySignInFortuneLuck: number;
    stats: PlayerSpecialStats;
};

const specialStatsCache = new WeakMap<ProjectorPlayerLike, SpecialStatsCacheEntry>();
export function resolvePlayerSpecialStatsCached(player: ProjectorPlayerLike): PlayerSpecialStats {
    const rootFoundation = Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0));
    const bodyTrainingLevel = Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0));
    const comprehension = Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0));
    const luck = Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0));
    const fengShuiLuck = Math.trunc(Number(player.fengShuiLuck ?? 0) || 0);
    const dailySignInFortuneLuck = resolvePlayerDailySignInFortuneLuck(player);
    const techniqueEffectRevision = getTechniqueEffectRevision(player);
    const cached = specialStatsCache.get(player);
    if (cached
        && cached.techniquesHolder === player.techniques
        && cached.techniquesRef === player.techniques.techniques
        && cached.attrsRevision === player.attrs.revision
        && cached.techniqueEffectRevision === techniqueEffectRevision
        && cached.equipmentRevision === player.equipment.revision
        && cached.foundation === player.foundation
        && cached.rootFoundation === rootFoundation
        && cached.bodyTrainingLevel === bodyTrainingLevel
        && cached.combatExp === player.combatExp
        && cached.comprehension === comprehension
        && cached.luck === luck
        && cached.fengShuiLuck === fengShuiLuck
        && cached.dailySignInFortuneLuck === dailySignInFortuneLuck) {
        return cached.stats;
    }
    const stats = resolvePlayerSpecialStats(player);
    specialStatsCache.set(player, {
        techniquesHolder: player.techniques,
        techniquesRef: player.techniques.techniques,
        attrsRevision: player.attrs.revision,
        techniqueEffectRevision,
        equipmentRevision: player.equipment.revision,
        foundation: player.foundation,
        rootFoundation,
        bodyTrainingLevel,
        combatExp: player.combatExp,
        comprehension,
        luck,
        fengShuiLuck,
        dailySignInFortuneLuck,
        stats,
    });
    return stats;
}

export function resolvePlayerSpecialStats(player: ProjectorPlayerLike): PlayerSpecialStats {
  const techniqueSpecialStats = getTechniqueFinalSpecialStatBonusCached(player);
  const equipmentSpecialStats = resolveEquipmentSpecialStats(player);
  const baseLuck = Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0));
  return {
    foundation: player.foundation,
    rootFoundation: Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)),
    bodyTrainingLevel: Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0)),
    combatExp: player.combatExp,
    comprehension: Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.comprehension ?? 0) || 0)),
    luck: Math.max(0, baseLuck
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.luck ?? 0) || 0))
      + Math.trunc(Number(player.fengShuiLuck ?? 0) || 0)
      + resolvePlayerDailySignInFortuneLuck(player)),
  };
}

export function resolveEquipmentSpecialStats(player: ProjectorPlayerLike): Partial<PlayerSpecialStats> {
  const result: Partial<PlayerSpecialStats> = { comprehension: 0, luck: 0 };
  const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv ?? 1) || 1));
  for (const entry of player.equipment?.slots ?? []) {
    const item = entry?.item;
    if (!item) { continue; }
    const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(toEquipmentEffectivenessItemStack(item), realmLv);
    result.comprehension = Math.max(0, Math.trunc(Number(result.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.comprehension ?? 0) || 0));
    result.luck = Math.max(0, Math.trunc(Number(result.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.luck ?? 0) || 0));
  }
  return result;
}

export function toEquipmentEffectivenessItemStack(item: SyncedItemStack): ItemStack {
  return {
    ...item,
    name: resolvePlayerFacingContentName(item.itemId, '未知物品', item.name),
    type: item.type ?? 'equipment',
  } as ItemStack;
}

export function normalizeOptionalNonNegativeInteger(value: unknown): number | undefined {
    if (!Number.isFinite(Number(value))) { return undefined; }
    return Math.max(0, Math.trunc(Number(value)));
}

export function resolvePortalRenderChar(portal: ProjectorPortalLike): string {
    const portalRecord = portal as unknown as Record<string, unknown>;
    if (typeof portalRecord.char === 'string' && portalRecord.char.trim()) {
        return portalRecord.char.trim()[0] ?? '阵';
    }
    return portal.kind === 'stairs' ? '' : '阵';
}

export function resolveBuffPresentationScale(source: { buffs?: unknown[] | null } | unknown[] | null | undefined): number | undefined {
    const buffs = Array.isArray(source)
        ? source
        : Array.isArray(source?.buffs)
            ? source.buffs
            : [];
    let scale = 1;
    for (const buff of buffs) {
        const record = buff as { remainingTicks?: unknown; stacks?: unknown; presentationScale?: unknown } | null | undefined;
        if ((Number(record?.remainingTicks ?? 0) <= 0) || (Number(record?.stacks ?? 0) <= 0)) { continue; }
        const presentationScale = Number(record?.presentationScale);
        if (Number.isFinite(presentationScale) && presentationScale > scale) { scale = presentationScale; }
    }
    return scale > 1 ? scale : undefined;
}

export function normalizeProjectedSectMark(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    return normalized ? getFirstGrapheme(normalized) || null : null;
}

export function buildPortalId(portalOrX: ProjectorPortalLike | number, y?: number) {
    if (typeof portalOrX === 'object' && portalOrX !== null) {
        const explicit = typeof portalOrX.id === 'string' ? portalOrX.id.trim() : '';
        if (explicit) { return explicit; }
        return `${portalOrX.x}:${portalOrX.y}`;
    }
    return `${portalOrX}:${y}`;
}

export function normalizePlayerIdentityText(value: unknown) {
    return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

export function resolvePlayerRenderLabel(name: unknown, displayName: unknown, playerId: unknown) {
    return normalizePlayerDisplayText(name, playerId)
        || normalizePlayerDisplayText(displayName, playerId)
        || '修士';
}

export function resolvePlayerRenderChar(displayName: unknown, name: unknown) {
    const normalizedDisplayName = normalizePlayerDisplayText(displayName);
    const normalizedName = normalizePlayerDisplayText(name);
    if (normalizedDisplayName && (normalizedDisplayName !== '@' || !normalizedName)) {
        return getFirstGrapheme(normalizedDisplayName) || '@';
    }
    return getFirstGrapheme(normalizedName) || '人';
}

export function normalizePlayerDisplayText(value: unknown, playerId: unknown = undefined) {
    const normalized = normalizePlayerIdentityText(value);
    if (!normalized || isRuntimePlayerIdLike(normalized) || normalized === normalizePlayerIdentityText(playerId)) {
        return '';
    }
    return normalized;
}

export function isRuntimePlayerIdLike(value: string) {
    return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(value) || /^player[:_-]/i.test(value);
}

export function resolvePortalDisplayName(
    portal: ProjectorPortalLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
) {
    const explicitName = (portal as unknown as Record<string, unknown>).name;
    if (typeof explicitName === 'string' && explicitName.trim()) {
        return explicitName.trim();
    }
    const kindLabel = portal.kind === 'stairs' ? '楼梯' : '传送阵';
    const targetMapName = resolveMapName?.(portal.targetMapId) ?? null;
    if (typeof targetMapName === 'string' && targetMapName.trim()) {
        return `${kindLabel} · ${targetMapName.trim()}`;
    }
    if (typeof portal.targetMapId === 'string' && portal.targetMapId.trim()) {
        return `${kindLabel} · ${portal.targetMapId.trim()}`;
    }
    return kindLabel;
}

export function buildAttrBonuses(player: ProjectorPlayerLike): AttrBonus[] {
    const signature = buildProjectedAttrBonusesSignature(player);
    const projectedCached = projectedAttrBonusCache.get(player);
    if (projectedCached?.signature === signature
        && projectedCached.techniquesHolder === player.techniques
        && projectedCached.techniquesRef === player.techniques.techniques) {
        return projectedCached.bonuses;
    }
    const source = buildAttrDetailBonuses(player);
    if (source.length === 0) {
        projectedAttrBonusCache.set(player, {
            signature,
            techniquesHolder: player.techniques,
            techniquesRef: player.techniques.techniques,
            bonuses: [],
        });
        return [];
    }
    const cached = attrBonusCloneCache.get(source);
    if (cached && isSameAttrBonuses(cached, source)) {
        projectedAttrBonusCache.set(player, {
            signature,
            techniquesHolder: player.techniques,
            techniquesRef: player.techniques.techniques,
            bonuses: cached,
        });
        return cached;
    }
    const cloned = source.map((entry) => cloneAttrBonus(entry));
    attrBonusCloneCache.set(source, cloned);
    projectedAttrBonusCache.set(player, {
        signature,
        techniquesHolder: player.techniques,
        techniquesRef: player.techniques.techniques,
        bonuses: cloned,
    });
    return cloned;
}

export function buildProjectedAttrBonusesSignature(player: ProjectorPlayerLike): string {
    const realm = player.realm as Record<string, unknown> | null | undefined;
    const dependencies = resolveAttrBonusConditionDependencies(player);
    const includeAllConditionInputs = dependencies.unknown;
    return [
        player.attrs.revision,
        getTechniqueEffectRevision(player),
        player.equipment.revision,
        buildProjectedBuffAttrBonusSignature(player),
        player.realmLv ?? '',
        includeAllConditionInputs || dependencies.hpRatio ? player.hp : '',
        includeAllConditionInputs || dependencies.hpRatio ? player.maxHp : '',
        includeAllConditionInputs || dependencies.qiRatio ? player.qi : '',
        includeAllConditionInputs || dependencies.qiRatio ? player.maxQi : '',
        includeAllConditionInputs || dependencies.cultivating
            ? player.combat.cultivationActive === true ? 1 : 0
            : '',
        includeAllConditionInputs || dependencies.map ? player.templateId : '',
        realm?.stage ?? '',
        realm?.displayName ?? '',
        realm?.name ?? '',
        stableShallowSignature((player as { runtimeBonuses?: unknown }).runtimeBonuses),
    ].join('|');
}

/** 属性加成明细不包含 buff 倒计时；只用真正影响该投影的字段参与缓存失效。 */
export function buildProjectedBuffAttrBonusSignature(player: ProjectorPlayerLike): string {
    const buffs = Array.isArray(player.buffs?.buffs) ? player.buffs.buffs : [];
    let hash = fnvMix(FNV_OFFSET_BASIS, buffs.length);
    for (const entry of buffs) {
        const buff = entry as VisibleBuffState & { sourceSkillId?: unknown };
        hash = fnvMix(hash, stableShallowHash(buff?.buffId ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.name ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.attrs ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.attrMode ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.stats ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.qiProjection ?? null));
        hash = fnvMix(hash, stableShallowHash(buff?.sourceSkillId ?? null));
    }
    return String(hash >>> 0);
}

export function resolveAttrBonusConditionDependencies(player: ProjectorPlayerLike): AttrBonusConditionDependencies {
    const equipment = player.equipment;
    const slots = Array.isArray(equipment?.slots) ? equipment.slots : [];
    const revision = Math.max(0, Math.trunc(Number(equipment?.revision ?? 0) || 0));
    if (!equipment || typeof equipment !== 'object') {
        return { revision, slotsRef: slots, hpRatio: false, qiRatio: false, cultivating: false, map: false, unknown: false };
    }
    const cached = attrBonusConditionDependencyCache.get(equipment);
    if (cached && cached.revision === revision && cached.slotsRef === slots) {
        return cached;
    }
    const dependencies: AttrBonusConditionDependencies = {
        revision,
        slotsRef: slots,
        hpRatio: false,
        qiRatio: false,
        cultivating: false,
        map: false,
        unknown: false,
    };
    for (const entry of slots) {
        for (const effect of (entry as { item?: { effects?: unknown[] } } | null | undefined)?.item?.effects ?? []) {
            if ((effect as { type?: unknown } | null | undefined)?.type !== 'progress_boost') {
                continue;
            }
            for (const condition of (effect as { conditions?: { items?: unknown[] } } | null | undefined)?.conditions?.items ?? []) {
                switch ((condition as { type?: unknown } | null | undefined)?.type) {
                    case 'hp_ratio':
                        dependencies.hpRatio = true;
                        break;
                    case 'qi_ratio':
                        dependencies.qiRatio = true;
                        break;
                    case 'is_cultivating':
                        dependencies.cultivating = true;
                        break;
                    case 'map':
                        dependencies.map = true;
                        break;
                    case 'time_segment':
                    case 'has_buff':
                        break;
                    default:
                        dependencies.unknown = true;
                        break;
                }
            }
        }
    }
    attrBonusConditionDependencyCache.set(equipment, dependencies);
    return dependencies;
}

export function buildSpecialStatsPatch(previous: PlayerSpecialStats, current: PlayerSpecialStats): Partial<PlayerSpecialStats> | undefined {
    const patch: Partial<PlayerSpecialStats> = {};
    if (previous.foundation !== current.foundation) { patch.foundation = current.foundation; }
    if (previous.rootFoundation !== current.rootFoundation) { patch.rootFoundation = current.rootFoundation; }
    if (previous.bodyTrainingLevel !== current.bodyTrainingLevel) { patch.bodyTrainingLevel = current.bodyTrainingLevel; }
    if (previous.combatExp !== current.combatExp) { patch.combatExp = current.combatExp; }
    if (previous.comprehension !== current.comprehension) { patch.comprehension = current.comprehension; }
    if (previous.luck !== current.luck) { patch.luck = current.luck; }
    return Object.keys(patch).length > 0 ? patch : undefined;
}

export function buildActionOrder(actions: ProjectedActionEntry[]): string[] {
    return actions.map((entry) => entry.id);
}
