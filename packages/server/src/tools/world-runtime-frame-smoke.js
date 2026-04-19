"use strict";

const assert = require("node:assert/strict");

const { WorldRuntimeFrameService } = require("../runtime/world/world-runtime-frame.service");

function testFrameDelegations() {
    const log = [];
    const service = new WorldRuntimeFrameService({
        advanceFrame(deps, frameDurationMs, getInstanceTickSpeed) {
            log.push(['advanceFrame', deps.marker, frameDurationMs, typeof getInstanceTickSpeed]);
            return 7;
        },
    }, {
        recordSyncFlushDuration(durationMs) {
            log.push(['recordSyncFlushDuration', durationMs]);
        },
    });
    const deps = { marker: 'deps' };
    assert.equal(service.tickAll(deps), 7);
    assert.equal(service.advanceFrame(deps, 250, null), 7);
    service.recordSyncFlushDuration(18.5);
    assert.deepEqual(log, [
        ['advanceFrame', 'deps', 1000, 'object'],
        ['advanceFrame', 'deps', 250, 'object'],
        ['recordSyncFlushDuration', 18.5],
    ]);
}

testFrameDelegations();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-frame' }, null, 2));
