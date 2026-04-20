// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePersistedCombatTargetingRules = exports.isSameCombatTargetingRules = exports.cloneCombatTargetingRules = exports.normalizePersistedAutoUsePills = exports.isSameAutoUsePillList = exports.cloneAutoUsePillList = void 0;
/**
 * cloneAutoUsePillCondition：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */


function cloneAutoUsePillCondition(input) {
    return {
        ...input,
    };
}
/**
 * cloneAutoUsePillEntry：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
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
 * cloneAutoUsePillList：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function cloneAutoUsePillList(input) {
    return Array.isArray(input) ? input.map((entry) => cloneAutoUsePillEntry(entry)) : [];
}
exports.cloneAutoUsePillList = cloneAutoUsePillList;
/**
 * isSameAutoUsePillCondition：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
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
 * isSameAutoUsePillEntry：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
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
 * isSameAutoUsePillList：执行状态校验并返回判断结果。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 函数返回值。
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
 * normalizePersistedAutoUsePills：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
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
 * cloneCombatTargetingRules：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
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
 * isSameCombatTargetingRules：执行状态校验并返回判断结果。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
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
 * normalizePersistedCombatTargetingRules：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
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
