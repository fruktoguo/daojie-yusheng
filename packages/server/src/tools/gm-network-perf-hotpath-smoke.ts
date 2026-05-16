import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { S2C } from '@mud/shared';

import { RuntimeGmStateService } from '../runtime/gm/runtime-gm-state.service';

async function main(): Promise<void> {
  const originalEnabled = process.env.SERVER_GM_NETWORK_PERF_ENABLED;
  const originalCapture = process.env.SERVER_GM_NETWORK_CAPTURE_PAYLOADS;
  const originalStringify = JSON.stringify;

  try {
    const service = createRuntimeGmStateService();
    delete process.env.SERVER_GM_NETWORK_PERF_ENABLED;
    delete process.env.SERVER_GM_NETWORK_CAPTURE_PAYLOADS;

    assert.equal(service.shouldRecordNetworkPerf(), false);
    assert.equal(service.shouldCaptureNetworkPayloadBody(), false);
    JSON.stringify = throwIfStringifyUsed as typeof JSON.stringify;
    service.recordNetworkOut(S2C.WorldDelta, createLargeWorldDeltaPayload());
    assert.equal(service.networkOutBucketByKey.size, 0);

    process.env.SERVER_GM_NETWORK_PERF_ENABLED = 'true';
    assert.equal(service.shouldRecordNetworkPerf(), true);
    service.recordNetworkOut(S2C.WorldDelta, createLargeWorldDeltaPayload());
    assert.equal(service.networkOutBucketByKey.size, 1);
    const [envBucket] = Array.from(service.networkOutBucketByKey.values());
    assert.ok(envBucket.bytes > 0);
    assert.equal(envBucket.count, 1);
    assert.equal(envBucket.largePayloadSamples, undefined);

    service.resetNetworkPerfCounters();
    assert.equal(service.networkOutBucketByKey.size, 0);
    JSON.stringify = originalStringify;

    delete process.env.SERVER_GM_NETWORK_PERF_ENABLED;
    service.enableNetworkPerfCounters();
    assert.equal(service.shouldRecordNetworkPerf(), true);
    assert.equal(service.shouldCaptureNetworkPayloadBody(), true);
    service.recordNetworkOut(S2C.WorldDelta, createLargeWorldDeltaPayload());
    assert.equal(service.networkOutBucketByKey.size, 1);
    const [bucket] = Array.from(service.networkOutBucketByKey.values());
    assert.ok(bucket.bytes > 0);
    assert.equal(bucket.count, 1);
    assert.ok(Array.isArray(bucket.largePayloadSamples));
    assert.equal(bucket.largePayloadSamples.length, 1);
    assert.ok(String(bucket.largePayloadSamples[0]?.body ?? '').includes('测试玩家_0'));
  } finally {
    JSON.stringify = originalStringify;
    restoreEnv('SERVER_GM_NETWORK_PERF_ENABLED', originalEnabled);
    restoreEnv('SERVER_GM_NETWORK_CAPTURE_PAYLOADS', originalCapture);
  }

  console.log(JSON.stringify({
    ok: true,
    answers:
      'GM network perf 默认关闭；显式开启时 recordNetworkOut 不调用 JSON.stringify，避免把 WorldDelta 热路径变成重复序列化与大字符串分配。',
    excludes:
      '不证明正式服真实 RSS 曲线，只证明 GM 网络统计的默认开关语义和包体测量热路径不再依赖 JSON.stringify。',
  }, null, 2));
}

function createRuntimeGmStateService(): RuntimeGmStateService {
  return new RuntimeGmStateService(
    { listSummaries: () => [] } as never,
    { listPlayerSnapshots: () => [] } as never,
    { getRuntimeSummary: () => ({ lastTickDurationMs: 0 }) } as never,
    {} as never,
    {} as never,
  );
}

function createLargeWorldDeltaPayload(): Record<string, unknown> {
  return {
    t: 123,
    wr: 456,
    p: Array.from({ length: 128 }, (_, index) => ({
      id: `player_${index}`,
      x: index,
      y: index + 1,
      hp: 1000,
      name: `测试玩家_${index}`,
    })),
    m: Array.from({ length: 128 }, (_, index) => ({
      id: `monster_${index}`,
      x: index + 2,
      y: index + 3,
      hp: 2000,
      templateId: 'monster_template',
    })),
  };
}

function throwIfStringifyUsed(): string {
  throw new Error('JSON.stringify must not be used in GM network perf hot path');
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
