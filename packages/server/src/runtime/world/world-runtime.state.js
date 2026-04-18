"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.createWorldRuntimeStateStore = void 0;

function createWorldRuntimeStateStore() {
    return {
        instances: new Map(),
        containerStatesByInstanceId: new Map(),
        dirtyContainerPersistenceInstanceIds: new Set(),
    };
}
exports.createWorldRuntimeStateStore = createWorldRuntimeStateStore;
