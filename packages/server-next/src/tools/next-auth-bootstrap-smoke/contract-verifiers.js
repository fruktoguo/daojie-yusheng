"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */

Object.defineProperty(exports, "__esModule", { value: true });

/** buildVerifyFunctionNames：执行对应的业务逻辑。 */
function buildVerifyFunctionNames(declaredFunctionNames, helperFunctions, fixtureFunctions) {
    return Array.from(new Set(declaredFunctionNames))
        .filter((name) => /^verify/.test(name))
        .filter((name) => !(name in helperFunctions) && !(name in fixtureFunctions));
}

module.exports = {
    buildVerifyFunctionNames,
};
