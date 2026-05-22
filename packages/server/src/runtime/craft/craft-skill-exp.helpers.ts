/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 制作技能经验工具函数。
 * 提供技能升级所需经验的查询，优先从境界配置服务读取，
 * 不可用时回退到固定默认值。
 */

/** main 兼容兜底：只有境界配置服务不可用时使用。生产阈值来自境界经验表。 */
export const DEFAULT_CRAFT_EXP_TO_NEXT = 60;

function normalizeCraftSkillLevel(level) {
    return Math.max(1, Math.floor(Number(level) || 1));
}

function resolveProgressionService(source) {
    if (!source) {
        return null;
    }
    if (typeof source.getRealmRuntimeExpToNext === 'function') {
        return source;
    }
    if (typeof source.playerProgressionService?.getRealmRuntimeExpToNext === 'function') {
        return source.playerProgressionService;
    }
    return null;
}

export function resolveCraftSkillExpToNextByLevel(source, level, fallback = 0) {
    const normalizedLevel = normalizeCraftSkillLevel(level);
    const progressionService = resolveProgressionService(source);
    if (progressionService) {
        if (typeof progressionService.getRealmRuntimeExpToNext === 'function') {
            const runtimeExpToNext = Number(progressionService.getRealmRuntimeExpToNext(normalizedLevel));
            if (Number.isFinite(runtimeExpToNext)) {
                return Math.max(0, Math.floor(runtimeExpToNext));
            }
        }
        return Math.max(0, Math.floor(Number(fallback) || 0));
    }
    return Math.max(0, Math.floor(Number(fallback) || DEFAULT_CRAFT_EXP_TO_NEXT));
}

export function resolveInitialCraftSkillExpToNext(source) {
    return resolveCraftSkillExpToNextByLevel(source, 1, DEFAULT_CRAFT_EXP_TO_NEXT);
}
