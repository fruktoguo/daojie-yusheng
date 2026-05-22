/**
 * 本文件是服务端冷路径运维工具入口，用于迁移、预检、清理或后台任务手动执行。
 *
 * 维护时要让脚本参数、失败退出码和副作用范围清晰，避免误操作生产数据。
 */
// @ts-nocheck

Object.defineProperty(exports, "__esModule", { value: true });
const FIXTURE_FUNCTION_PATTERN = /^(ensureLegacyCompat|seedLegacyCompat|hasLegacyCompat|cleanupLegacyCompat|drop|expect(?:LegacyCompat|Persisted)|readPersisted|write(?:Invalid|Persisted)|ensurePersisted|install|uninstall|ignoreMissingCompatCleanupError|normalizePersistedIdentity)/;
/**
 * buildFixtureFunctionNames：构建并返回目标对象。
 * @param declaredFunctionNames 参数说明。
 * @returns 无返回值，直接更新FixtureFunction名称相关状态。
 */


function buildFixtureFunctionNames(declaredFunctionNames) {
    return Array.from(new Set(Array.isArray(declaredFunctionNames) ? declaredFunctionNames : []))
        .filter((name) => FIXTURE_FUNCTION_PATTERN.test(name));
}

module.exports = {
    buildFixtureFunctionNames,
};
