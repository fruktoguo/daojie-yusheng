// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveMonsterCombatExpEquivalentFallback = resolveMonsterCombatExpEquivalentFallback;
exports.getMonsterCombatExpGradeFactor = getMonsterCombatExpGradeFactor;
exports.resolveMonsterCombatExpTierFactor = resolveMonsterCombatExpTierFactor;

const fs = require("fs");
const shared_1 = require("@mud/shared");
const project_path_1 = require("../../common/project-path");

const REALM_LEVELS_PATH = ['packages', 'server', 'data', 'content', 'realm-levels.json'];

let realmCombatExpByLevel = null;

function loadRealmCombatExpByLevel() {
    if (realmCombatExpByLevel) {
        return realmCombatExpByLevel;
    }
    const next = new Map();
    const filePath = (0, project_path_1.resolveProjectPath)(...REALM_LEVELS_PATH);
    try {
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const expMultiplier = normalizePositiveInt(raw?.expMultiplier, 1);
        for (const entry of raw?.levels ?? []) {
            const realmLv = normalizePositiveInt(entry?.realmLv, 0);
            if (realmLv <= 0) {
                continue;
            }
            const expToNext = normalizePositiveInt(entry?.expToNext, 0) * expMultiplier;
            const grade = typeof entry?.grade === 'string' ? entry.grade : 'mortal';
            const gradeIndex = Math.max(0, shared_1.TECHNIQUE_GRADE_ORDER.indexOf(grade));
            const gradeFactor = getMonsterCombatExpGradeFactor(gradeIndex);
            next.set(realmLv, Math.max(0, Math.floor(expToNext * gradeFactor)));
        }
    }
    catch {
        // 启动期或测试桩缺少内容文件时保持 0，调用方不再退回旧的 level * 100 口径。
    }
    realmCombatExpByLevel = next;
    return realmCombatExpByLevel;
}

function resolveMonsterCombatExpEquivalentFallback(monsterOrLevel) {
    const level = Math.max(1, Math.floor(Number(typeof monsterOrLevel === 'object' ? monsterOrLevel?.level : monsterOrLevel) || 1));
    const tierFactor = resolveMonsterCombatExpTierFactor(typeof monsterOrLevel === 'object' ? monsterOrLevel?.tier : undefined);
    return Math.max(0, Math.floor((loadRealmCombatExpByLevel().get(level) ?? 0) * tierFactor));
}

function normalizePositiveInt(value, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
}

function getMonsterCombatExpGradeFactor(gradeIndex) {
    return 0.25 * (2 ** Math.max(0, Math.floor(Number(gradeIndex) || 0)));
}

function resolveMonsterCombatExpTierFactor(tier) {
    if (tier === 'demon_king') {
        return 4;
    }
    if (tier === 'variant') {
        return 2;
    }
    return 1;
}

export { getMonsterCombatExpGradeFactor, resolveMonsterCombatExpEquivalentFallback, resolveMonsterCombatExpTierFactor };
