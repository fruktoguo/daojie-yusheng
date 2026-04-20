// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlayerRuntimeStateStore = void 0;
/**
 * createPlayerRuntimeStateStore：构建并返回目标对象。
 * @returns 函数返回值。
 */


function createPlayerRuntimeStateStore() {
    return {
        players: new Map(),
        pendingCombatEffectsByPlayerId: new Map(),
    };
}
exports.createPlayerRuntimeStateStore = createPlayerRuntimeStateStore;
export { createPlayerRuntimeStateStore };
