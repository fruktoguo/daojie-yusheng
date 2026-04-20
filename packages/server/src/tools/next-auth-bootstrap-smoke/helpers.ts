// @ts-nocheck

Object.defineProperty(exports, "__esModule", { value: true });
const HELPER_EXCLUDES = new Set([
    'main',
    'collectExports',
]);
/**
 * buildHelperFunctionNames：构建并返回目标对象。
 * @param declaredFunctionNames 参数说明。
 * @param fixtureFunctionNames 参数说明。
 * @returns 函数返回值。
 */


function buildHelperFunctionNames(declaredFunctionNames, fixtureFunctionNames = []) {
    const fixtureSet = new Set(Array.isArray(fixtureFunctionNames) ? fixtureFunctionNames : []);
    return Array.from(new Set(Array.isArray(declaredFunctionNames) ? declaredFunctionNames : []))
        .filter((name) => !HELPER_EXCLUDES.has(name))
        .filter((name) => !fixtureSet.has(name))
        .filter((name) => !/^verify/.test(name));
}

module.exports = {
    buildHelperFunctionNames,
};
