// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeFrameService } = require("../runtime/world/world-runtime-frame.service");
/**
 * testFrameDelegations：执行test帧Delegation相关逻辑。
 * @returns 无返回值，直接更新test帧Delegation相关状态。
 */


function testFrameDelegations() {
    const log = [];
    const service = new WorldRuntimeFrameService({    
    /**
 * advanceFrame：执行advance帧相关逻辑。
 * @param deps 运行时依赖。
 * @param frameDurationMs 参数说明。
 * @param getInstanceTickSpeed 参数说明。
 * @returns 无返回值，直接更新advance帧相关状态。
 */

        advanceFrame(deps, frameDurationMs, getInstanceTickSpeed) {
            log.push(['advanceFrame', deps.marker, frameDurationMs, typeof getInstanceTickSpeed]);
            return 7;
        },
    }, {    
    /**
 * recordSyncFlushDuration：处理record同步刷新耗时并更新相关状态。
 * @param durationMs 参数说明。
 * @returns 无返回值，直接更新recordSyncFlushDuration相关状态。
 */

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
