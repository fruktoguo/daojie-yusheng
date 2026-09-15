/**
 * 玩家进阶服务游离模块函数集合。
 *
 * 从 player-progression.service.ts 迁出的全部模块级游离函数：
 * 境界阶段解析、突变构建/合并、功法进度快照、怪物击杀经验调整、
 * 灵根种子初始化、天门重摇、修炼光环倍率归一化等。
 * 原 service 文件 import 回来使用。
 *
 * 纯重构迁移，不改变任何方法签名、公开 API、持久化语义或 tick 语义。
 */
import {
  DEFAULT_PLAYER_REALM_STAGE,
  PLAYER_REALM_ORDER,
  PLAYER_REALM_STAGE_LEVEL_RANGES,
  TechniqueRealm,
  computeCraftSkillExpGain,
  deriveTechniqueRealm,
  getMonsterKillExpLevelAdjustment,
  getTechniquePassiveExpToNext,
  getTechniqueTrainingMaxLevel,
  isPassiveTechnique,
  normalizeTechniqueLearnMaxLevel,
  normalizeTechniqueStrengthPercent,
  resolvePlayerFacingContentName,
} from '@mud/shared';
import {
  applyPlayerCraftExpRate,
  resolvePlayerCraftRealmLevel,
} from '../craft/craft-effect-runtime.helpers';
import {
  ELEMENT_KEYS,
  normalizeHeavenGateRoots,
  normalizeProgressionAmount,
} from './player-progression-rule.helpers';

/** 单人战斗境界经验上限倍率。仅被尾部游离函数使用，从原 service 迁出。 */
const SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER = 5;

/** 天门最大断根数。与原 service 共享，此处导出供 helper 使用，原 service 保留自己的副本。 */
export const HEAVEN_GATE_MAX_SEVERED = 4;

/** 天门重摇平均加成。与原 service 共享，此处导出供 helper 使用，原 service 保留自己的副本。 */
export const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
export function resolveStageForRealmLevel(realmLv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedRealmLv = Math.max(1, Math.floor(Number(realmLv) || 1));
    for (let index = PLAYER_REALM_ORDER.length - 1; index >= 0; index -= 1) {
        const stage = PLAYER_REALM_ORDER[index];
        const range = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
        if (range && normalizedRealmLv >= range.levelFrom) {
            return stage;
        }
    }
    return DEFAULT_PLAYER_REALM_STAGE;
}
/**
 * resolveRealmLevelFromStage：规范化或转换Realm等级FromStage。
 * @param stage 参数说明。
 * @returns 无返回值，直接更新Realm等级FromStage相关状态。
 */

export function resolveRealmLevelFromStage(stage) {
    return PLAYER_REALM_STAGE_LEVEL_RANGES[stage]?.levelFrom ?? 1;
}
/**
 * createEmptyMutation：构建并返回目标对象。
 * @returns 无返回值，直接更新EmptyMutation相关状态。
 */

export function createEmptyMutation() {
    return {
        changed: false,
        panelDirty: false,
        attrRecalculated: false,
        techniquesDirty: false,
        bodyTrainingDirty: false,
        professionDirty: false,
        combatPrefDirty: false,
        actionsDirty: false,
        pendingTechniqueComprehensionRemovedIds: [],
        notices: [],
    };
}

export function describeProgressionDirtyDomains(mutation) {
    if (!mutation?.changed) {
        return [];
    }
    const domains = ['progression'];
    // realm_payload 存储在 player_attr_state 表中，realm progress 变化时必须标记 'attr' dirty
    if (mutation.attrRecalculated || mutation.realmChanged) {
        domains.push('attr');
    }
    if (mutation.techniquesDirty) {
        domains.push('technique');
    }
    if (mutation.bodyTrainingDirty) {
        domains.push('body_training');
    }
    if (mutation.professionDirty) {
        domains.push('profession');
    }
    if (mutation.combatPrefDirty) {
        domains.push('combat_pref');
    }
    return domains;
}

export function toProgressionMutationResult(mutation) {
    return {
        changed: mutation?.changed === true,
        notices: Array.isArray(mutation?.notices) ? mutation.notices : [],
        actionsDirty: mutation?.actionsDirty === true,
        pendingTechniqueComprehensionRemovedIds: Array.isArray(mutation?.pendingTechniqueComprehensionRemovedIds)
            ? mutation.pendingTechniqueComprehensionRemovedIds
            : [],
        dirtyDomains: describeProgressionDirtyDomains(mutation),
    };
}
/**
 * mergeProgressionMutation：处理修炼进度Mutation并更新相关状态。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新修炼进度Mutation相关状态。
 */

export function mergeProgressionMutation(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!left.changed && left.notices.length === 0) {
        return right;
    }
    if (!right.changed && right.notices.length === 0) {
        return left;
    }
    return {
        changed: left.changed || right.changed,
        panelDirty: left.panelDirty || right.panelDirty,
        attrRecalculated: left.attrRecalculated || right.attrRecalculated,
        realmChanged: left.realmChanged || right.realmChanged,
        techniquesDirty: left.techniquesDirty || right.techniquesDirty,
        bodyTrainingDirty: left.bodyTrainingDirty || right.bodyTrainingDirty,
        professionDirty: left.professionDirty || right.professionDirty,
        combatPrefDirty: left.combatPrefDirty || right.combatPrefDirty,
        actionsDirty: left.actionsDirty || right.actionsDirty,
        pendingTechniqueComprehensionRemovedIds: [
            ...new Set([
                ...(Array.isArray(left.pendingTechniqueComprehensionRemovedIds) ? left.pendingTechniqueComprehensionRemovedIds : []),
                ...(Array.isArray(right.pendingTechniqueComprehensionRemovedIds) ? right.pendingTechniqueComprehensionRemovedIds : []),
            ]),
        ],

        notices: left.notices.length === 0
            ? right.notices
            : right.notices.length === 0
                ? left.notices
                : [...left.notices, ...right.notices],
    };
}

export function snapshotTechniqueProgressionInput(technique) {
    const layers = Array.isArray(technique?.layers) ? technique.layers : null;
    return {
        technique,
        techId: technique?.techId,
        level: technique?.level,
        expToNext: technique?.expToNext,
        learnTechniqueMaxLevel: technique?.learnTechniqueMaxLevel,
        layers,
        layerCount: layers?.length ?? 0,
        lastLayerLevel: layers && layers.length > 0 ? layers[layers.length - 1]?.level : undefined,
    };
}

export function hasSameTechniqueProgressionInputs(techniques, snapshots): boolean {
    if (!Array.isArray(snapshots) || techniques.length !== snapshots.length) {
        return false;
    }
    for (let index = 0; index < techniques.length; index += 1) {
        const technique = techniques[index];
        const snapshot = snapshots[index];
        if (technique !== snapshot?.technique) {
            return false;
        }
        if (!technique || typeof technique !== 'object') {
            continue;
        }
        const layers = Array.isArray(technique.layers) ? technique.layers : null;
        if (technique.techId !== snapshot.techId
            || technique.level !== snapshot.level
            || technique.expToNext !== snapshot.expToNext
            || technique.learnTechniqueMaxLevel !== snapshot.learnTechniqueMaxLevel
            || layers !== snapshot.layers
            || (layers?.length ?? 0) !== snapshot.layerCount
            || (layers && layers.length > 0 ? layers[layers.length - 1]?.level : undefined) !== snapshot.lastLayerLevel) {
            return false;
        }
    }
    return true;
}

export function beginMonsterKillProgressPerf(input): number | null {
    return typeof input?.recordTickSectionDuration === 'function'
        ? performance.now()
        : null;
}

export function recordMonsterKillProgressPerf(input, key, startedAt): number | null {
    const recorder = input?.recordTickSectionDuration;
    if (typeof recorder !== 'function' || startedAt === null) {
        return null;
    }
    const endedAt = performance.now();
    recorder(key, endedAt - startedAt, 1);
    return endedAt;
}

export function recordMonsterKillProgressCount(input, key, count = 1): void {
    const recorder = input?.recordTickSectionDuration;
    if (typeof recorder !== 'function' || count <= 0) {
        return;
    }
    recorder(key, 0, count);
}
/**
 * applyRateBonus：处理RateBonu并更新相关状态。
 * @param baseGain 参数说明。
 * @param bonusRateBp 参数说明。
 * @param minimumGain 参数说明。
 * @returns 无返回值，直接更新RateBonu相关状态。
 */

export function applyRateBonus(baseGain, bonusRateBp, minimumGain = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalizedBaseGain = Number(baseGain);
    if (!Number.isFinite(normalizedBaseGain) || normalizedBaseGain <= 0) {
        return 0;
    }

    const normalizedBonusRate = Number.isFinite(bonusRateBp)
        ? Math.max(0, Number(bonusRateBp)) / 10000
        : 0;

    const exactGain = Math.max(minimumGain, normalizedBaseGain * (1 + normalizedBonusRate));

    const guaranteed = Math.floor(exactGain);

    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
        return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
}

export function applyTechniqueRateBonus(baseGain, levelAdjustment = 1, options: any = {}) {
    const normalizedBaseGain = Number(baseGain);
    if (!Number.isFinite(normalizedBaseGain) || normalizedBaseGain <= 0) {
        return 0;
    }
    const normalizedLevelAdjustment = Number.isFinite(levelAdjustment)
        ? Math.max(0, Number(levelAdjustment))
        : 1;
    const adjustedGain = normalizedBaseGain * normalizedLevelAdjustment;
    if (adjustedGain <= 0) {
        return 0;
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'expBonus')) {
        return applyRateBonus(adjustedGain, options.expBonus, options.minimumGain ?? 1);
    }
    return normalizeProgressionAmount(adjustedGain);
}

export function applyTransmissionSkillExpFromTicks(player, elapsedTicks, targetLevel, getExpToNextByLevel) {
    const skill = player?.transmissionSkill;
    if (!skill) {
        return false;
    }
    const baseGain = computeCraftSkillExpGain({
        playerRealmLevel: resolvePlayerCraftRealmLevel(player),
        skillLevel: skill.level,
        targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
        baseActionTicks: elapsedTicks,
        getExpToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    }).finalGain;
    const gain = applyPlayerCraftExpRate(player, 'transmission', baseGain);
    return applyCraftSkillExpLocal(skill, gain, getExpToNextByLevel);
}

export function applyCraftSkillExpLocal(skill, amount, getExpToNextByLevel) {
    if (!skill) {
        return false;
    }
    let changed = false;
    const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
    if (skill.expToNext !== resolvedExpToNext) {
        skill.expToNext = resolvedExpToNext;
        changed = true;
    }
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) {
        return changed;
    }
    skill.exp += gain;
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
        changed = true;
    }
    return changed || gain > 0;
}

export function normalizeCultivationAuraMultiplier(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return 1;
    }
    return normalized;
}

export function capSingleCombatRealmExpGain(realm, gain) {
    const normalizedGain = normalizeProgressionAmount(gain);
    const progressToNext = Math.max(0, Math.floor(realm?.progressToNext ?? 0));
    if (normalizedGain <= 0 || progressToNext <= 0) {
        return normalizedGain;
    }
    return Math.min(normalizedGain, progressToNext * SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER);
}

export function calculateOverflowFoundationGain(player, realm, amount) {
    const normalized = normalizeProgressionAmount(amount);
    if (normalized <= 0) {
        return 0;
    }
    const referenceProgress = normalizeProgressionAmount(realm?.progressToNext);
    if (referenceProgress <= 0) {
        return normalized;
    }
    const currentFoundation = normalizeProgressionAmount(player?.foundation);
    const decayRate = Math.log(2) / (referenceProgress * 10);
    const decaySeed = Math.exp(-decayRate * currentFoundation);
    return rollFractionalGain(Math.log1p(decayRate * normalized * decaySeed) / decayRate);
}

export function rollFractionalGain(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    const guaranteed = Math.floor(value);
    const remainder = value - guaranteed;
    if (remainder <= 0) {
        return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
}
/**
 * getMonsterKillRealmExpAdjustment：读取怪物KillRealmExpAdjustment。
 * @param playerRealmLv 参数说明。
 * @param monsterLevel 参数说明。
 * @param monsterTier 参数说明。
 * @returns 无返回值，完成怪物KillRealmExpAdjustment的读取/组装。
 */

export function getMonsterKillRealmExpAdjustment(playerRealmLv, monsterLevel, monsterTier) {
    return getMonsterKillExpLevelAdjustment(playerRealmLv, monsterLevel, monsterTier);
}
/**
 * snapshotCultivatingTechnique：执行快照Cultivating功法相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新快照Cultivating功法相关状态。
 */

export function snapshotCultivatingTechnique(player, resolvedTechnique = undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const techId = player.techniques.cultivatingTechId;
    if (!techId) {
        return {
            techId: null,
            name: null,
            kind: 'none',
            level: 0,
            exp: 0,
        };
    }

    const technique = resolvedTechnique === undefined
        ? player.techniques.techniques.find((entry) => entry.techId === techId)
        : resolvedTechnique;
    const pending = technique ? null : (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === techId);
    if (pending) {
        return {
            techId,
            name: resolvePlayerFacingContentName(techId, '未知功法', pending.name),
            kind: 'comprehension',
            level: 0,
            exp: Math.max(0, Number(pending.progress) || 0),
            technique: null,
        };
    }
    return {
        techId,
        kind: 'technique',
        name: resolvePlayerFacingContentName(techId, '未知功法', technique?.name),
        level: Math.max(0, Math.floor(technique?.level ?? 0)),
        exp: Math.max(0, Math.floor(technique?.exp ?? 0)),
        expToNext: Math.max(0, Math.floor(technique?.expToNext ?? 0)),
        technique: technique ?? null,
    };
}

/**
 * 仅为击杀推进的统计差分提供完整变更集合；功法集合变化或待领悟移除时必须回退全量扫描。
 */
export function resolveSingleTechniqueProgressStatisticChangedIds(
    player,
    beforeTechnique,
    afterTechnique,
    learnedTechniquesBefore,
    learnedTechniqueCountBefore,
    mutation,
) {
    const learnedTechniquesAfter = player?.techniques?.techniques;
    if (!Array.isArray(learnedTechniquesBefore)
        || learnedTechniquesAfter !== learnedTechniquesBefore
        || learnedTechniquesAfter.length !== learnedTechniqueCountBefore
        || (Array.isArray(mutation?.pendingTechniqueComprehensionRemovedIds)
            && mutation.pendingTechniqueComprehensionRemovedIds.length > 0)) {
        return null;
    }
    const changedIds = [];
    if (beforeTechnique?.technique && beforeTechnique.techId) {
        const current = beforeTechnique.technique;
        if (Math.max(0, Math.floor(Number(current.level) || 0)) !== beforeTechnique.level
            || Math.max(0, Math.floor(Number(current.exp) || 0)) !== beforeTechnique.exp
            || Math.max(0, Math.floor(Number(current.expToNext) || 0)) !== beforeTechnique.expToNext) {
            changedIds.push(beforeTechnique.techId);
        }
    }
    if (changedIds.length === 0
        && afterTechnique?.technique
        && afterTechnique.techId
        && afterTechnique.techId !== beforeTechnique?.techId) {
        changedIds.push(afterTechnique.techId);
    }
    return changedIds;
}

/** 修炼统计只需要学习中功法的三个数值，不解析名称或待领悟展示。 */
export function snapshotCultivatingTechniqueStatisticState(player, resolvedTechnique = undefined) {
    const techId = player?.techniques?.cultivatingTechId;
    if (!techId) {
        return {
            techId: null,
            level: 0,
            exp: 0,
            expToNext: 0,
            technique: null,
        };
    }
    const technique = resolvedTechnique === undefined
        ? player.techniques.techniques.find((entry) => entry.techId === techId)
        : resolvedTechnique;
    return {
        techId,
        level: Math.max(0, Math.floor(Number(technique?.level) || 0)),
        exp: Math.max(0, Math.floor(Number(technique?.exp) || 0)),
        expToNext: Math.max(0, Math.floor(Number(technique?.expToNext) || 0)),
        technique: technique ?? null,
    };
}

export function toTechniqueUpdateEntryLocal(technique, maxLevelInput = undefined) {
    const layers = Array.isArray(technique.layers) ? technique.layers : [];
    const passiveTechnique = isPassiveTechnique(technique);
    const learnTechniqueMaxLevel = passiveTechnique
        ? undefined
        : normalizeTechniqueLearnMaxLevel(maxLevelInput, layers, technique.level);
    const trainingMaxLevel = learnTechniqueMaxLevel ?? getTechniqueTrainingMaxLevel({
        level: technique.level,
        layers,
        skills: technique.skills,
    });
    const level = passiveTechnique
        ? Math.max(1, Math.floor(Number(technique.level) || 1))
        : Math.min(Math.max(1, Math.floor(Number(technique.level) || 1)), trainingMaxLevel);
    return {
        techId: technique.techId,
        level,
        exp: technique.exp,
        expToNext: passiveTechnique
            ? getTechniquePassiveExpToNext(level, layers)
            : learnTechniqueMaxLevel !== undefined && level >= learnTechniqueMaxLevel ? 0 : technique.expToNext,
        realmLv: technique.realmLv,
        strengthPercent: normalizeTechniqueStrengthPercent(technique.strengthPercent),
        realm: passiveTechnique ? TechniqueRealm.Entry : deriveTechniqueRealm(level, layers),
        skillsEnabled: technique.skillsEnabled !== false,
        name: technique.name,
        grade: technique.grade ?? null,
        category: technique.category ?? null,
        skills: technique.skills,
        layers,
        ...(learnTechniqueMaxLevel === undefined ? {} : { learnTechniqueMaxLevel }),
    };
}
/**
 * calculateRealmProgressGain：执行Realm进度Gain相关逻辑。
 * @param previousRealmLv 参数说明。
 * @param previousProgress 参数说明。
 * @param currentRealm 参数说明。
 * @returns 无返回值，直接更新Realm进度Gain相关状态。
 */

export function calculateRealmProgressGain(previousRealmLv, previousProgress, currentRealm) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!currentRealm) {
        return 0;
    }
    if (currentRealm.realmLv !== previousRealmLv) {
        return Math.max(0, currentRealm.progress);
    }
    return Math.max(0, currentRealm.progress - previousProgress);
}
/**
 * calculateTechniqueGain：执行功法Gain相关逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，直接更新功法Gain相关状态。
 */

export function calculateTechniqueGain(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!previous.techId || previous.techId !== current.techId) {
        return {
            name: current.name,
            gained: 0,
        };
    }
    if (current.level !== previous.level) {
        return {
            name: current.name,
            gained: 0,
        };
    }
    return {
        name: current.name,
        kind: current.kind,
        gained: Math.max(0, current.exp - previous.exp),
    };
}

export function formatProgressionGainAmount(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return '0';
    }
    if (Number.isInteger(normalized)) {
        return String(normalized);
    }
    return normalized.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
/**
 * createEmptyRoots：构建并返回目标对象。
 * @returns 无返回值，直接更新Empty根容器相关状态。
 */

export function createEmptyRoots() {
    return {
        metal: 0,
        wood: 0,
        water: 0,
        fire: 0,
        earth: 0,
    };
}

export function createSpiritualRootSeedRoots(tier) {
    const roots = createEmptyRoots();
    if (tier === 'divine') {
        for (const element of ELEMENT_KEYS) {
            roots[element] = 100;
        }
        return roots;
    }

    let promoted = false;
    for (const element of ELEMENT_KEYS) {
        const value = Math.random() < 0.5 ? 100 : 99;
        roots[element] = value;
        promoted = promoted || value === 100;
    }
    if (!promoted) {
        roots[ELEMENT_KEYS[Math.floor(Math.random() * ELEMENT_KEYS.length)]] = 100;
    }
    return roots;
}

export function getHeavenGateRerollCount(averageBonus) {
    return Math.max(0, Math.floor(Math.max(0, Number(averageBonus) || 0) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
}

export function getHeavenGateAverageBonusFromRerollCount(rerollCount) {
    return Math.max(0, Math.floor(Number(rerollCount) || 0)) * HEAVEN_GATE_REROLL_AVERAGE_BONUS;
}
/**
 * normalizeHeavenGateState：规范化或转换HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

export function normalizeHeavenGateState(state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!state) {
        return null;
    }

    const severed = state.severed
        .filter((element) => ELEMENT_KEYS.includes(element))
        .slice(0, HEAVEN_GATE_MAX_SEVERED);

    const roots = normalizeHeavenGateRoots(state.roots);

    const entered = state.entered === true;

    const averageBonus = Math.max(0, Math.floor(Number(state.averageBonus) || 0));

    const unlocked = state.unlocked === true || entered || roots !== null || severed.length > 0;
    if (!unlocked && severed.length === 0 && roots === null) {
        return null;
    }
    return {
        unlocked,
        severed,
        roots,
        entered,
        averageBonus,
    };
}
