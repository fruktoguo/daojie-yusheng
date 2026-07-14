import {
    ATTR_KEYS,
    TechniqueRealm,
    readCraftEffectStat,
} from '@mud/shared';

import { resolvePlayerCraftEffectStat } from '../craft/craft-effect-runtime.helpers';
import { resolveCompiledBuildingDefinition } from '../building/building-definition-resolution.helpers';

/**
 * 玩家成长的无状态规则。
 * 本模块不读写权威玩家容器，不触发属性重算或持久化副作用。
 */
export const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
export const TECHNIQUE_GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];

const PATH_SEVERED_BREAKTHROUGH_LABEL = '仙路断绝';
const PATH_SEVERED_BREAKTHROUGH_REASON = '仙路断绝，你的前路已被无形天堑阻断，暂时无法继续突破。';

function formatTechniqueRealmLabel(value) {
    switch (value) {
        case TechniqueRealm.Perfection:
            return '圆满';
        case TechniqueRealm.Major:
            return '大成';
        case TechniqueRealm.Minor:
            return '小成';
        case TechniqueRealm.Entry:
        default:
            return '入门';
    }
}
/** 复制并收敛天门灵根数值。 */
export function cloneHeavenGateRoots(roots) {
    if (!roots) {
        return null;
    }
    return {
        metal: clamp(normalizePositiveInt(roots.metal, 0), 0, 100),
        wood: clamp(normalizePositiveInt(roots.wood, 0), 0, 100),
        water: clamp(normalizePositiveInt(roots.water, 0), 0, 100),
        fire: clamp(normalizePositiveInt(roots.fire, 0), 0, 100),
        earth: clamp(normalizePositiveInt(roots.earth, 0), 0, 100),
    };
}

export function normalizeHeavenGateRoots(roots) {
    const normalized = cloneHeavenGateRoots(roots);
    if (!normalized) {
        return null;
    }
    return ELEMENT_KEYS.some((element) => normalized[element] > 0) ? normalized : null;
}

export function getInventoryCount(player, itemId) {
    let total = 0;
    for (const entry of player.inventory.items) {
        if (entry.itemId === itemId) {
            total += Math.max(0, Math.trunc(Number(entry.count ?? 0) || 0));
        }
    }
    return total;
}

export function hasInventoryItemCountAtLeast(player, itemId, requiredCount) {
    return getInventoryCount(player, itemId) >= Math.max(1, Math.floor(Number(requiredCount) || 1));
}

export function getMissingBreakthroughItemRequirements(player, items) {
    const requirements = new Map();
    for (const item of items ?? []) {
        const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
        if (!itemId) {
            continue;
        }
        const requiredCount = Math.max(1, Math.floor(Number(item.count) || 1));
        requirements.set(itemId, (requirements.get(itemId) ?? 0) + requiredCount);
    }
    const missingItems = [];
    for (const [itemId, requiredCount] of requirements.entries()) {
        const ownedCount = getInventoryCount(player, itemId);
        const missingCount = Math.max(0, requiredCount - ownedCount);
        if (missingCount <= 0) {
            continue;
        }
        missingItems.push({
            itemId,
            count: requiredCount,
            ownedCount,
            missingCount,
        });
    }
    return missingItems;
}

export function buildPathSeveredBreakthroughRequirement(realmLv) {
    return {
        id: `realm_${realmLv}_path_severed`,
        type: 'root',
        label: PATH_SEVERED_BREAKTHROUGH_LABEL,
        completed: false,
        hidden: false,
        blocksBreakthrough: true,
        detail: PATH_SEVERED_BREAKTHROUGH_REASON,
    };
}

export function getBreakthroughRequirementIncreasePct(requirement) {
    if (requirement.type !== 'item' && requirement.type !== 'technique') {
        return 0;
    }
    return Math.max(0, Math.floor(Number(requirement.increasePct ?? 0) || 0));
}

export function isOptionalBreakthroughRequirementIncreaser(requirement) {
    return requirement.type === 'technique' && getBreakthroughRequirementIncreasePct(requirement) > 0;
}

export function doesBreakthroughRequirementBlock(requirement) {
    return !isOptionalBreakthroughRequirementIncreaser(requirement);
}

export function getEffectiveAttributeRequirement(baseValue, increaseMultiplier) {
    return Math.max(1, Math.ceil(Math.max(1, Math.floor(Number(baseValue) || 1)) * Math.max(1, increaseMultiplier)));
}

export function isBreakthroughRequirementCompleted(player, requirement, increaseMultiplier = 1) {
    if (requirement.type === 'item') {
        return hasInventoryItemCountAtLeast(player, requirement.itemId, requirement.count);
    }
    if (requirement.type === 'technique') {
        return isTechniqueRequirementCompleted(player, requirement);
    }
    if (requirement.type === 'attribute_total') {
        return getPlayerTotalAttributes(player) >= getEffectiveAttributeRequirement(requirement.minTotalValue, increaseMultiplier);
    }
    if (requirement.type === 'root') {
        return getMaxSpiritualRootValue(player) >= requirement.minValue;
    }
    return false;
}

export function normalizeBreakthroughTransition(entry) {
    const fromRealmLv = normalizePositiveInt(entry?.fromRealmLv, 0);
    const toRealmLv = normalizePositiveInt(entry?.toRealmLv, 0);
    if (fromRealmLv <= 0 || toRealmLv <= fromRealmLv) {
        return null;
    }
    const requirements = [];
    for (const rawRequirement of entry?.requirements ?? []) {
        const requirement = normalizeBreakthroughRequirement(rawRequirement);
        if (requirement) {
            requirements.push(requirement);
        }
    }
    const rootFoundationItems = [];
    for (const rawItem of entry?.rootFoundationItems ?? []) {
        const item = normalizeBreakthroughItemRequirement(rawItem);
        if (item) {
            rootFoundationItems.push(item);
        }
    }
    return {
        fromRealmLv,
        toRealmLv,
        title: typeof entry?.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined,
        rootFoundationItems,
        requirements,
    };
}

function normalizeBreakthroughItemRequirement(raw) {
    const itemId = typeof raw?.itemId === 'string' && raw.itemId.trim() ? raw.itemId.trim() : '';
    const count = normalizePositiveInt(raw?.count, 0);
    if (!itemId || count <= 0) {
        return null;
    }
    return { itemId, count };
}

function normalizeBreakthroughRequirement(raw) {
    const id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const label = typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined;
    const increasePct = normalizePositiveInt(raw?.increaseAttrRequirementPct, 0);
    if (!id) {
        return null;
    }
    if (raw?.type === 'item') {
        const itemId = typeof raw.itemId === 'string' && raw.itemId.trim() ? raw.itemId.trim() : '';
        const count = normalizePositiveInt(raw.count, 0);
        if (!itemId || count <= 0) {
            return null;
        }
        return { id, type: 'item', itemId, count, label, increasePct };
    }
    if (raw?.type === 'technique') {
        const minLevel = normalizePositiveInt(raw.minLevel, 0);
        const count = Math.max(1, normalizePositiveInt(raw.count, 1));
        const minGrade = normalizeTechniqueGrade(raw.minGrade);
        const minRealm = normalizeTechniqueRealm(raw.minRealm);
        return { id, type: 'technique', minGrade, minLevel, minRealm, count, label, increasePct };
    }
    if (raw?.type === 'attribute_total') {
        const minTotalValue = normalizePositiveInt(raw.minTotalValue, 0);
        return minTotalValue > 0 ? { id, type: 'attribute_total', minTotalValue, label } : null;
    }
    if (raw?.type === 'root') {
        const minValue = normalizePositiveInt(raw.minValue, 0);
        return minValue > 0 ? { id, type: 'root', minValue, label } : null;
    }
    return null;
}

export function getBreakthroughItemRequirements(transition) {
    return transition.rootFoundationItems ?? [];
}

function isTechniqueRequirementCompleted(player, requirement) {
    let matchedCount = 0;
    for (const technique of player.techniques.techniques) {
        const level = Math.max(0, Math.floor(Number(technique.level ?? 0) || 0));
        if (requirement.minLevel > 0 && level < requirement.minLevel) {
            continue;
        }
        const realm = technique.realm ?? TechniqueRealm.Entry;
        if (requirement.minRealm !== undefined && realm < requirement.minRealm) {
            continue;
        }
        if (requirement.minGrade && compareTechniqueGrade(technique.grade, requirement.minGrade) < 0) {
            continue;
        }
        matchedCount += 1;
        if (matchedCount >= requirement.count) {
            return true;
        }
    }
    return false;
}

export function getPlayerTotalAttributes(player) {
    const attrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs ?? player.attrs?.rawBaseAttrs;
    if (!attrs) {
        return 0;
    }
    let total = 0;
    for (const key of ATTR_KEYS) {
        const value = Number(attrs[key]);
        if (Number.isFinite(value)) {
            total += Math.floor(value);
        }
    }
    return total;
}

export function getRootFoundationCap(realmLv) {
    const normalized = Math.max(1, Math.floor(Number(realmLv) || 1));
    return Math.floor((normalized * (normalized + 1)) / 2);
}

export function getMaxSpiritualRootValue(player) {
    const roots = normalizeHeavenGateRoots(player.spiritualRoots);
    if (!roots) {
        return 0;
    }
    let maxValue = 0;
    for (const element of ELEMENT_KEYS) {
        maxValue = Math.max(maxValue, roots[element]);
    }
    return maxValue;
}

export function formatTechniqueRequirementLabel(requirement) {
    const parts = [];
    if (requirement.minGrade) {
        parts.push(`${formatTechniqueGradeLabel(requirement.minGrade)}功法`);
    }
    else {
        parts.push('功法');
    }
    if (requirement.minLevel > 0) {
        parts.push(`修至 ${requirement.minLevel} 级`);
    }
    if (requirement.minRealm !== undefined) {
        parts.push(`功法境界达到${formatTechniqueRealmLabel(requirement.minRealm)}`);
    }
    return `至少有 ${requirement.count} 门${parts.join('，')}`;
}

function normalizeTechniqueGrade(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const grade = value.trim();
    return TECHNIQUE_GRADE_ORDER.includes(grade) ? grade : undefined;
}

function compareTechniqueGrade(value, minimum) {
    const grade = normalizeTechniqueGrade(value) ?? 'mortal';
    return TECHNIQUE_GRADE_ORDER.indexOf(grade) - TECHNIQUE_GRADE_ORDER.indexOf(minimum);
}

function formatTechniqueGradeLabel(value) {
    switch (value) {
        case 'yellow':
            return '黄阶';
        case 'mystic':
            return '玄阶';
        case 'earth':
            return '地阶';
        case 'heaven':
            return '天阶';
        case 'spirit':
            return '灵阶';
        case 'saint':
            return '圣阶';
        case 'emperor':
            return '帝阶';
        case 'mortal':
        default:
            return '凡阶';
    }
}

function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return clamp(Math.floor(value), TechniqueRealm.Entry, TechniqueRealm.Perfection);
    }
    switch (value) {
        case 'Minor':
        case 'minor':
            return TechniqueRealm.Minor;
        case 'Major':
        case 'major':
            return TechniqueRealm.Major;
        case 'Perfection':
        case 'perfection':
            return TechniqueRealm.Perfection;
        case 'Entry':
        case 'entry':
            return TechniqueRealm.Entry;
        default:
            return undefined;
    }
}
export function normalizePositiveInt(value, fallback) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}
export function normalizeProgressionAmount(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}

export function resolvePlayerComprehensionSpeedRate(player: any, options: any = {}): number {
    return resolveFiniteNumber(resolvePlayerCraftEffectStat(player, 'transmission', 'speedRate'))
        + resolveTechniqueExpRateAsComprehensionSpeedRate(player)
        + resolveStandingBuildingTransmissionSpeedRate(player, options);
}

function resolveTechniqueExpRateAsComprehensionSpeedRate(player: any): number {
    return resolveFiniteNumber(player?.attrs?.numericStats?.techniqueExpRate) / 10000;
}

function resolveStandingBuildingTransmissionSpeedRate(player: any, options: any = {}): number {
    const instanceId = normalizeProgressionText(player?.instanceId);
    if (!instanceId) {
        return 0;
    }
    const instance = typeof options.getInstanceRuntime === 'function'
        ? options.getInstanceRuntime(instanceId)
        : options.instanceRuntime;
    if (!instance || typeof instance !== 'object') {
        return 0;
    }
    const x = Math.floor(Number(player?.x) || 0);
    const y = Math.floor(Number(player?.y) || 0);
    const cellIndex = typeof instance.toTileIndex === 'function'
        ? Math.trunc(Number(instance.toTileIndex(x, y)))
        : Math.trunc(Number(instance.tilePlane?.getCellIndex?.(x, y)));
    if (!Number.isFinite(cellIndex) || cellIndex < 0) {
        return 0;
    }
    const buildingIds = instance.buildingIdByCell?.get?.(cellIndex);
    if (!buildingIds || typeof buildingIds[Symbol.iterator] !== 'function') {
        return 0;
    }
    let speedRate = 0;
    for (const buildingId of buildingIds as Iterable<unknown>) {
        const building = instance.buildingById?.get?.(buildingId);
        if (!building || building.state !== 'active') {
            continue;
        }
        const compiled = resolveCompiledBuildingDefinition(instance.buildingCatalog, building);
        speedRate += resolveFiniteNumber(readCraftEffectStat(compiled?.craftEffectStats, 'transmission', 'speedRate'));
    }
    return speedRate;
}

function resolveFiniteNumber(value: unknown): number {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : 0;
}

function normalizeProgressionText(value: unknown): string {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : '';
}
export function normalizeProgressionTicks(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
export function normalizeCombatExpMultiplier(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

export function isSameHeavenGateRoots(left, right) {
    if (!left && !right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.metal === right.metal
        && left.wood === right.wood
        && left.water === right.water
        && left.fire === right.fire
        && left.earth === right.earth;
}
export function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
