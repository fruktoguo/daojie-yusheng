// @ts-nocheck

Object.defineProperty(exports, "__esModule", { value: true });
/**
 * buildVerifyFunctionNames：构建并返回目标对象。
 * @param declaredFunctionNames 参数说明。
 * @param helperFunctions 参数说明。
 * @param fixtureFunctions 参数说明。
 * @returns 函数返回值。
 */

function buildVerifyFunctionNames(declaredFunctionNames, helperFunctions, fixtureFunctions) {
    return Array.from(new Set(declaredFunctionNames))
        .filter((name) => /^verify/.test(name))
        .filter((name) => !(name in helperFunctions) && !(name in fixtureFunctions));
}

module.exports = {
    buildVerifyFunctionNames,
};
