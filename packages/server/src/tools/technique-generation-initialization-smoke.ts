/**
 * 本文件是可执行验证工具，覆盖服务端启动、持久化或运行时链路的最小回归场景。
 *
 * 维护时要让验证数据可控、可清理，并避免依赖线上外部服务。
 */
import assert from 'node:assert/strict';
import type { Pool } from 'pg';
import { S2C } from '@mud/shared';
import type { Socket } from 'socket.io';

import { TechniqueGenerationService } from '../runtime/technique-generation/technique-generation.service';
import type { GeneratedTechniqueStoreService } from '../runtime/technique-generation/generated-technique-store.service';
import { WorldGatewayTechniqueGenerationHelper } from '../network/world-gateway-technique-generation.helper';
import { ensureGeneratedTechniqueTables } from '../persistence/generated-technique-persistence.service';

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

function createFakeSchemaPool(records: QueryRecord[]): Pool {
  return {
    connect: async () => ({
      query: async (sql: unknown, params?: unknown[]) => {
        records.push({ sql: String(sql), params });
        return { rows: [], rowCount: 0 };
      },
      release: () => undefined,
    }),
  } as unknown as Pool;
}

async function testUninitializedServiceDoesNotConsumeItem(): Promise<void> {
  const service = new TechniqueGenerationService();
  let consumeCount = 0;

  const result = await service.requestGeneration({
    playerId: 'p_uninitialized_smoke',
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
    playerId: 'p_generation_smoke',
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
  const insertJobQuery = queries.find((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  assert.ok(insertJobQuery);
  assert.equal(insertJobQuery.params?.[1], 'p_generation_smoke');

  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(queries.some((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'NO_MODEL'));
}

async function testItemShortageMarksJobFailedAfterAudit(): Promise<void> {
  const queries: QueryRecord[] = [];
  const service = new TechniqueGenerationService();
  service.initialize({
    pool: createFakePool(queries),
    generatedStore: { refreshAfterPublish: async () => undefined } as unknown as GeneratedTechniqueStoreService,
    modelConfigResolver: async () => null,
  });

  const result = await service.requestGeneration({
    playerId: 'p_item_shortage_smoke',
    playerRealmLv: 31,
    category: 'internal',
    consumeItem: async () => false,
  });

  assert.equal(result.success, false);
  assert.equal(result.errorCode, 'ITEM_NOT_ENOUGH');
  const insertIndex = queries.findIndex((entry) => entry.sql.includes('INSERT INTO technique_generation_job'));
  const failedIndex = queries.findIndex((entry) => entry.sql.includes('UPDATE technique_generation_job') && entry.params?.[2] === 'ITEM_NOT_ENOUGH');
  assert.notEqual(insertIndex, -1);
  assert.notEqual(failedIndex, -1);
  assert.ok(insertIndex < failedIndex);
}

async function testSchemaMigratesPlayerIdsToVarchar(): Promise<void> {
  const queries: QueryRecord[] = [];
  await ensureGeneratedTechniqueTables(createFakeSchemaPool(queries));

  const normalizedSql = queries.map((entry) => entry.sql.replace(/\s+/g, ' ').trim().toLowerCase());
  assert.ok(normalizedSql.some((sql) => sql.includes('created_by_player_id varchar(120) not null')));
  assert.ok(normalizedSql.some((sql) => sql.includes('player_id varchar(120) not null')));
  assert.ok(normalizedSql.some((sql) => sql.includes('alter column created_by_player_id type varchar(120)')));
  assert.ok(normalizedSql.some((sql) => sql.includes('alter column player_id type varchar(120)')));
}

async function testGatewayGenerateExceptionEmitsFailureResult(): Promise<void> {
  const emitted: Array<{ event: string; payload: unknown }> = [];
  const helper = new WorldGatewayTechniqueGenerationHelper({
    gatewayGuardHelper: {
      requirePlayerId: () => 'p_gateway_smoke',
    },
    worldClientEventService: {
      emitGatewayError: (client: Socket, code: string, error: unknown) => {
        client.emit('gatewayError', { code, error });
      },
    },
    playerRuntimeService: {
      getPlayerRealmLv: () => 31,
      consumeItemByItemId: () => true,
      learnTechniqueById: () => true,
    },
  });
  helper.setService({
    requestGeneration: async () => {
      throw new Error('simulated_insert_failure');
    },
  } as unknown as TechniqueGenerationService);

  const result = await helper.handleTechniqueGeneration({
    emit: (event: string, payload: unknown) => {
      emitted.push({ event, payload });
      return true;
    },
  } as unknown as Socket, { action: 'generate', category: 'internal' });

  assert.deepEqual(result, { success: false, error: '功法领悟失败', errorCode: 'GENERATION_FAILED' });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0]?.event, S2C.TechniqueGenerationResult);
  assert.equal((emitted[0]?.payload as { result?: string; errorMessage?: string }).result, 'failed');
  assert.equal((emitted[0]?.payload as { result?: string; errorMessage?: string }).errorMessage, 'simulated_insert_failure');
}

async function main(): Promise<void> {
  await testUninitializedServiceDoesNotConsumeItem();
  await testInitializedServicePersistsJob();
  await testItemShortageMarksJobFailedAfterAudit();
  await testSchemaMigratesPlayerIdsToVarchar();
  await testGatewayGenerateExceptionEmitsFailureResult();
  console.log('technique-generation-initialization-smoke ok');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
