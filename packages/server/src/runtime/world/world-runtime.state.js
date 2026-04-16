"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorldRuntimeStateStore = void 0;

function createWorldRuntimeStateStore() {
    return {
        instances: new Map(),
        playerLocations: new Map(),
        pendingCommands: new Map(),
        pendingSystemCommands: [],
        pendingRespawnPlayerIds: new Set(),
        navigationIntents: new Map(),
        instanceTickProgressById: new Map(),
        containerStatesByInstanceId: new Map(),
        dirtyContainerPersistenceInstanceIds: new Set(),
        latestCombatEffectsByInstanceId: new Map(),
    };
}
exports.createWorldRuntimeStateStore = createWorldRuntimeStateStore;
