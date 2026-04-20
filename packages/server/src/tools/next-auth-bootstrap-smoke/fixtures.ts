// @ts-nocheck

Object.defineProperty(exports, "__esModule", { value: true });
const FIXTURE_FUNCTION_PATTERN = /^(ensureLegacyCompat|seedLegacyCompat|hasLegacyCompat|cleanupLegacyCompat|drop|expect(?:LegacyCompat|Persisted)|readPersisted|write(?:Invalid|Persisted)|ensurePersisted|install|uninstall|ignoreMissingCompatCleanupError|normalizePersistedIdentity)/;
/**
 * buildFixtureFunctionNames：构建并返回目标对象。
 * @param declaredFunctionNames 参数说明。
 * @returns 函数返回值。
 */


function buildFixtureFunctionNames(declaredFunctionNames) {
    return Array.from(new Set(Array.isArray(declaredFunctionNames) ? declaredFunctionNames : []))
        .filter((name) => FIXTURE_FUNCTION_PATTERN.test(name));
}

module.exports = {
    buildFixtureFunctionNames,
};
