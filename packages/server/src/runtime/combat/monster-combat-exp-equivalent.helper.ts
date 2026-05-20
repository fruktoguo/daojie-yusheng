/**
 * 妖兽战斗经验等价值计算。
 *
 * 职责：
 * - 根据妖兽等级和品阶，计算其在战斗经验对抗系统中的等价经验值
 * - 用于战斗经验优势判定（resolveCombatExperienceAdvantage）中怪物侧的经验参数
 *
 * 数据来源：
 * - 从 realm-levels.json 读取各境界等级的升级经验
 * - 按功法品阶（grade）和妖兽品阶（tier）应用倍率
 *
 * 缓存策略：
 * - 首次调用时加载并缓存，后续直接读取内存 Map
 * - 启动期或测试桩缺少内容文件时保持 0，不回退旧口径
 */

import { readFileSync } from 'fs';
import { resolveProjectPath } from '../../common/project-path';
import {
    getRuntimeRealmGradeIndex,
    normalizeRuntimeRealmExpMultiplier,
    normalizeRuntimeRealmLevelEntry,
} from '../player/realm-runtime-exp.helpers';

const REALM_LEVELS_PATH = ['packages', 'server', 'data', 'content', 'realm-levels.json'];

/** 缓存：境界等级 → 战斗经验等价值。 */
let realmCombatExpByLevel: Map<number, number> | null = null;

/**
 * 加载并缓存境界等级对应的战斗经验等价值。
 * 公式：expToNext × expMultiplier × gradeFactor。
 */
function loadRealmCombatExpByLevel() {
    if (realmCombatExpByLevel) {
        return realmCombatExpByLevel;
    }
    const next = new Map();
    const filePath = resolveProjectPath(...REALM_LEVELS_PATH);
    try {
        const raw = JSON.parse(readFileSync(filePath, 'utf8'));
        const expMultiplier = normalizeRuntimeRealmExpMultiplier(raw?.expMultiplier);
        for (const entry of raw?.levels ?? []) {
            const runtimeEntry = normalizeRuntimeRealmLevelEntry(entry, expMultiplier);
            if (!runtimeEntry) {
                continue;
            }
            const gradeIndex = getRuntimeRealmGradeIndex(runtimeEntry.grade);
            const gradeFactor = getMonsterCombatExpGradeFactor(gradeIndex);
            next.set(runtimeEntry.realmLv, Math.max(0, Math.floor(runtimeEntry.runtimeExpToNext * gradeFactor)));
        }
    }
    catch (error) {
        // 启动期或测试桩缺少内容文件时保持 0，调用方不再退回旧的 level * 100 口径。
        if (error instanceof TypeError || error instanceof ReferenceError) {
            console.error('[妖兽战斗经验] 构建境界战斗经验表时发生意外错误：', error);
        }
    }
    realmCombatExpByLevel = next;
    return realmCombatExpByLevel;
}

/**
 * 根据妖兽等级和品阶计算战斗经验等价值。
 * @param monsterOrLevel 妖兽对象（含 level/tier）或直接的等级数值
 * @returns 等价战斗经验值，用于对抗率计算
 */
export function resolveMonsterCombatExpEquivalentFallback(monsterOrLevel: any) {
    const level = Math.max(1, Math.floor(Number(typeof monsterOrLevel === 'object' ? monsterOrLevel?.level : monsterOrLevel) || 1));
    const tierFactor = resolveMonsterCombatExpTierFactor(typeof monsterOrLevel === 'object' ? monsterOrLevel?.tier : undefined);
    return Math.max(0, Math.floor((loadRealmCombatExpByLevel().get(level) ?? 0) * tierFactor));
}

/**
 * 功法品阶对应的经验倍率。
 * 品阶越高倍率越大：0.25 × 2^gradeIndex（mortal=0.25, human=0.5, earth=1, heaven=2, ...）。
 */
export function getMonsterCombatExpGradeFactor(gradeIndex: number) {
    return 0.25 * (2 ** Math.max(0, Math.floor(Number(gradeIndex) || 0)));
}

/**
 * 妖兽品阶（tier）对应的经验倍率。
 * - demon_king（妖王）：4 倍
 * - variant（变异）：2 倍
 * - 普通：1 倍
 */
export function resolveMonsterCombatExpTierFactor(tier: unknown) {
    if (tier === 'demon_king') {
        return 4;
    }
    if (tier === 'variant') {
        return 2;
    }
    return 1;
}
