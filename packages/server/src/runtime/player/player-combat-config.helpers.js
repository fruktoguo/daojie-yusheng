"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePersistedCombatTargetingRules = exports.isSameCombatTargetingRules = exports.cloneCombatTargetingRules = exports.normalizePersistedAutoUsePills = exports.isSameAutoUsePillList = exports.cloneAutoUsePillList = void 0;

function cloneAutoUsePillCondition(input) {
    return {
        ...input,
    };
}
function cloneAutoUsePillEntry(input) {
    return {
        ...input,
        conditions: Array.isArray(input.conditions)
            ? input.conditions.map((condition) => cloneAutoUsePillCondition(condition))
            : [],
    };
}
function cloneAutoUsePillList(input) {
    return Array.isArray(input) ? input.map((entry) => cloneAutoUsePillEntry(entry)) : [];
}
exports.cloneAutoUsePillList = cloneAutoUsePillList;
function isSameAutoUsePillCondition(left, right) {
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
function isSameAutoUsePillEntry(left, right) {
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
function isSameAutoUsePillList(previous, current) {
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
function normalizePersistedAutoUsePills(input) {
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
function isSameCombatTargetingRules(left, right) {
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
function normalizePersistedCombatTargetingRules(input) {
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
