// @ts-nocheck

/**
 * 用途：执行 GM 节点列表与健康状态的冒烟验证。
 */
Object.defineProperty(exports, "__esModule", { value: true });

const assert = require('node:assert/strict');
const { NativeGmWorldService } = require('../http/native/native-gm-world.service');

function createService() {
  return new NativeGmWorldService(
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {},
    {
      isEnabled() {
        return true;
      },
      getNodeId() {
        return 'node:self';
      },
      async listNodes() {
        return [
          {
            nodeId: 'node:self',
            address: '127.0.0.1',
            port: 13001,
            status: 'running',
            heartbeatAt: '2026-04-23T00:00:00.000Z',
            startedAt: '2026-04-23T00:00:00.000Z',
            capacityWeight: 3,
          },
          {
            nodeId: 'node:suspect',
            address: '127.0.0.2',
            port: 13002,
            status: 'suspect',
            heartbeatAt: '2026-04-22T23:59:00.000Z',
            startedAt: '2026-04-22T23:00:00.000Z',
            capacityWeight: 1,
          },
          {
            nodeId: 'node:dead',
            address: '127.0.0.3',
            port: 13003,
            status: 'dead',
            heartbeatAt: null,
            startedAt: '2026-04-22T22:00:00.000Z',
            capacityWeight: 2,
          },
        ];
      },
    },
    {
      getRuntimeSummary() {
        return {};
      },
    },
  );
}

async function main() {
  const service = createService();
  const payload = await service.getNodeRegistryHealth();
  assert.equal(payload.enabled, true);
  assert.equal(payload.selfNodeId, 'node:self');
  assert.equal(payload.nodeCount, 3);
  assert.equal(payload.healthyNodeCount, 1);
  assert.equal(payload.suspectNodeCount, 1);
  assert.equal(payload.deadNodeCount, 1);
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-world-nodes',
    nodes: payload.nodes,
    summary: {
      nodeCount: payload.nodeCount,
      healthyNodeCount: payload.healthyNodeCount,
      suspectNodeCount: payload.suspectNodeCount,
      deadNodeCount: payload.deadNodeCount,
    },
  }, null, 2));
}

main();
