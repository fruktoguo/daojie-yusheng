"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.WORLD_RUNTIME_STATE_CONTRACT = void 0;

exports.WORLD_RUNTIME_STATE_CONTRACT = Object.freeze({
    inMemoryRuntime: Object.freeze([
        'instances',
        'playerLocations',
        'instanceTickProgressById',
    ]),
    restoreBackedRuntime: Object.freeze([
        'containerStatesByInstanceId',
        'dirtyContainerPersistenceInstanceIds',
    ]),
    databaseSourceOfTruth: Object.freeze([
        'map document persistence',
        'player identity / snapshot persistence',
        'gm maintenance parameters',
        'redeem codes',
    ]),
    deferredRealtimeLayer: Object.freeze([
        'cross-process online state / realtime fan-out',
    ]),
});
