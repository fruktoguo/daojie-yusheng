/**
 * 本文件是可执行验证工具，覆盖服务端启动、持久化或运行时链路的最小回归场景。
 *
 * 维护时要让验证数据可控、可清理，并避免依赖线上外部服务。
 */
import assert from 'node:assert/strict';
import type { Pool } from 'pg';

import { TechniqueGenerationService } from '../runtime/technique-generation/technique-generation.service';
import type { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';

type QueryRecord = {
  sql: string;
  params: unknown[] | undefined;
};

function createFakePool(records: QueryRecord[]): Pool {
  return {
    query: async (sql: unknown, params?: unknown[]) => {
      records.push({ sql: String(sql), params });
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Pool;
}

async function testUninitializedServiceDoesNotConsumeItem(): Promise<void> {
  const service = new TechniqueGenerationService();
  let consumeCount = 0;

  const result = await service.requestGeneration({
    playerId: 1,
    playerRealmLv: 31,
    category: 'internal',
    consumeItem: async () => {
      consumeCount += 1;
      return true;
    },
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'SERVICE_UNAVAILABLE');
  assert.equal(consumeCount, 0);
}

async function testInitializedServicePersistsJob(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  let consumeCount = 0;
  const result = await service.requestGeneration({
    playerId: 7,
    playerRealmLv: 31,
    category: 'internal',
    playerContext: '  test context  ',
    consumeItem: async () => {
      consumeCount += 1;
      return true;
    },
  });

  assert.equal(result.success, true);
  assert.equal(typeof result.jobId, 'string');
  assert.equal(consumeCount, 1);
  assert.ok(queries.some((entry) => entry.sql.includes('INSERT INTO technique_generation_job')));

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'NO_MODEL'));
}

async function main(): Promise<void> {
  await testUninitializedServiceDoesNotConsumeItem();
  await testInitializedServicePersistsJob();
  console.log('technique-generation-initialization-smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
