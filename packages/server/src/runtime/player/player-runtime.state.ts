// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlayerRuntimeStateStore = void 0;
/**
 * createPlayerRuntimeStateStore：构建并返回目标对象。
 * @returns 无返回值，直接更新玩家运行态状态存储相关状态。
 */


function createPlayerRuntimeStateStore() {
    return {
        players: new Map(),
        pendingCombatEffectsByPlayerId: new Map(),
    };
}
exports.createPlayerRuntimeStateStore = createPlayerRuntimeStateStore;
export { createPlayerRuntimeStateStore };
