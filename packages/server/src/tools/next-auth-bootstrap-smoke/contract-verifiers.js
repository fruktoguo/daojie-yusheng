"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function buildVerifyFunctionNames(declaredFunctionNames, helperFunctions, fixtureFunctions) {
    return Array.from(new Set(declaredFunctionNames))
        .filter((name) => /^verify/.test(name))
        .filter((name) => !(name in helperFunctions) && !(name in fixtureFunctions));
}

module.exports = {
    buildVerifyFunctionNames,
};
