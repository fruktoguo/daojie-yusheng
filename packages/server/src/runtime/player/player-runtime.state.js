"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createPlayerRuntimeStateStore = void 0;

function createPlayerRuntimeStateStore() {
    return {
        players: new Map(),
        pendingCombatEffectsByPlayerId: new Map(),
    };
}
exports.createPlayerRuntimeStateStore = createPlayerRuntimeStateStore;
