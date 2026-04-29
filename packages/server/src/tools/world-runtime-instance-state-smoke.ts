// @ts-nocheck

const assert = require("node:assert/strict");

const { WorldRuntimeInstanceStateService } = require("../runtime/world/world-runtime-instance-state.service");
/**
 * testOwnershipMethods：执行testOwnershipMethod相关逻辑。
 * @returns 无返回值，直接更新testOwnershipMethod相关状态。
 */


function testOwnershipMethods() {
    const service = new WorldRuntimeInstanceStateService();
    const runtimeA = { meta: { instanceId: 'instance:1' } };
    const runtimeB = { meta: { instanceId: 'instance:2' } };
    assert.equal(service.getInstanceRuntime('instance:1'), null);
    service.setInstanceRuntime('instance:1', runtimeA);
    service.setInstanceRuntime('instance:2', runtimeB);
    assert.equal(service.getInstanceRuntime('instance:1'), runtimeA);
    assert.equal(service.getInstanceCount(), 2);
    assert.deepEqual(Array.from(service.listInstanceRuntimes()), [runtimeA, runtimeB]);
    assert.deepEqual(Array.from(service.listInstanceEntries()), [['instance:1', runtimeA], ['instance:2', runtimeB]]);
}
/**
 * testResetState：执行testReset状态相关逻辑。
 * @returns 无返回值，直接更新testReset状态相关状态。
 */


function testResetState() {
    const service = new WorldRuntimeInstanceStateService();
    service.setInstanceRuntime('instance:1', { meta: { instanceId: 'instance:1' } });
    service.resetState();
    assert.equal(service.getInstanceRuntime('instance:1'), null);
    assert.equal(service.getInstanceCount(), 0);
    assert.deepEqual(Array.from(service.listInstanceEntries()), []);
}

testOwnershipMethods();
testResetState();

console.log(JSON.stringify({ ok: true, case: 'world-runtime-instance-state' }, null, 2));
