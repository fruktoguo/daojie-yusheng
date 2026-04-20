// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePersistedCombatTargetingRules = exports.isSameCombatTargetingRules = exports.cloneCombatTargetingRules = exports.normalizePersistedAutoUsePills = exports.isSameAutoUsePillList = exports.cloneAutoUsePillList = void 0;
/**
 * cloneAutoUsePillCondition：构建AutoUsePillCondition。
 * @param input 输入参数。
 * @returns 无返回值，直接更新AutoUsePillCondition相关状态。
 */


function cloneAutoUsePillCondition(input) {
    return {
        ...input,
    };
}
/**
 * cloneAutoUsePillEntry：构建AutoUsePill条目。
 * @param input 输入参数。
 * @returns 无返回值，直接更新AutoUsePill条目相关状态。
 */

function cloneAutoUsePillEntry(input) {
    return {
        ...input,
        conditions: Array.isArray(input.conditions)
            ? input.conditions.map((condition) => cloneAutoUsePillCondition(condition))
            : [],
    };
}
/**
 * cloneAutoUsePillList：读取AutoUsePill列表并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，直接更新AutoUsePill列表相关状态。
 */

function cloneAutoUsePillList(input) {
    return Array.isArray(input) ? input.map((entry) => cloneAutoUsePillEntry(entry)) : [];
}
exports.cloneAutoUsePillList = cloneAutoUsePillList;
/**
 * isSameAutoUsePillCondition：判断SameAutoUsePillCondition是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameAutoUsePillCondition的条件判断。
 */

function isSameAutoUsePillCondition(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(right, key) || left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}
/**
 * isSameAutoUsePillEntry：判断SameAutoUsePill条目是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameAutoUsePill条目的条件判断。
 */

function isSameAutoUsePillEntry(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    if (left.itemId !== right.itemId) {
        return false;
    }
    const leftConditions = Array.isArray(left.conditions) ? left.conditions : [];
    const rightConditions = Array.isArray(right.conditions) ? right.conditions : [];
    if (leftConditions.length !== rightConditions.length) {
        return false;
    }
    for (let index = 0; index < leftConditions.length; index += 1) {
        if (!isSameAutoUsePillCondition(leftConditions[index], rightConditions[index])) {
            return false;
        }
    }
    return true;
}
/**
 * isSameAutoUsePillList：读取SameAutoUsePill列表并返回结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，完成SameAutoUsePill列表的条件判断。
 */

function isSameAutoUsePillList(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (previous === current) {
        return true;
    }
    const left = Array.isArray(previous) ? previous : [];
    const right = Array.isArray(current) ? current : [];
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameAutoUsePillEntry(left[index], right[index])) {
            return false;
        }
    }
    return true;
}
exports.isSameAutoUsePillList = isSameAutoUsePillList;
/**
 * normalizePersistedAutoUsePills：判断PersistedAutoUsePill是否满足条件。
 * @param input 输入参数。
 * @returns 无返回值，直接更新PersistedAutoUsePill相关状态。
 */

function normalizePersistedAutoUsePills(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    return input
        .filter((entry) => entry && typeof entry.itemId === 'string' && entry.itemId.trim().length > 0)
        .map((entry) => ({
        itemId: entry.itemId.trim(),
        conditions: Array.isArray(entry.conditions)
            ? entry.conditions
                .filter((condition) => condition && typeof condition.type === 'string')
                .map((condition) => cloneAutoUsePillCondition(condition))
            : [],
    }));
}
exports.normalizePersistedAutoUsePills = normalizePersistedAutoUsePills;
/**
 * cloneCombatTargetingRules：读取战斗TargetingRule并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，直接更新战斗TargetingRule相关状态。
 */

function cloneCombatTargetingRules(input) {
    return input
        ? {
            includeNormalMonsters: input.includeNormalMonsters !== false,
            includeEliteMonsters: input.includeEliteMonsters !== false,
            includeBosses: input.includeBosses !== false,
            includePlayers: input.includePlayers === true,
        }
        : undefined;
}
exports.cloneCombatTargetingRules = cloneCombatTargetingRules;
/**
 * isSameCombatTargetingRules：读取Same战斗TargetingRule并返回结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成Same战斗TargetingRule的条件判断。
 */

function isSameCombatTargetingRules(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left === right;
    }
    return left.includeNormalMonsters === right.includeNormalMonsters
        && left.includeEliteMonsters === right.includeEliteMonsters
        && left.includeBosses === right.includeBosses
        && left.includePlayers === right.includePlayers;
}
exports.isSameCombatTargetingRules = isSameCombatTargetingRules;
/**
 * normalizePersistedCombatTargetingRules：读取Persisted战斗TargetingRule并返回结果。
 * @param input 输入参数。
 * @returns 无返回值，直接更新Persisted战斗TargetingRule相关状态。
 */

function normalizePersistedCombatTargetingRules(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!input || typeof input !== 'object') {
        return undefined;
    }
    return cloneCombatTargetingRules({
        includeNormalMonsters: input.includeNormalMonsters,
        includeEliteMonsters: input.includeEliteMonsters,
        includeBosses: input.includeBosses,
        includePlayers: input.includePlayers,
    });
}
exports.normalizePersistedCombatTargetingRules = normalizePersistedCombatTargetingRules;
export {
    cloneAutoUsePillList,
    isSameAutoUsePillList,
    normalizePersistedAutoUsePills,
    cloneCombatTargetingRules,
    isSameCombatTargetingRules,
    normalizePersistedCombatTargetingRules,
};
