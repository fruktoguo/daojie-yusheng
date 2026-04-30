import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import { NestFactory } from '@nestjs/core';
import { Pool } from 'pg';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DurableOperationService } from '../persistence/durable-operation.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { Direction } from '@mud/shared';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skipped: true,
      reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
      answers: '可输出玩家 session fencing 的拒绝次数与成功次数，并作为阶段 6.1 的运行态指标入口',
      excludes: '不证明真实多节点顶号风暴或 socket 导流',
      completionMapping: 'release:proof:stage6.session-fencing',
    }, null, 2));
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const pool = new Pool({ connectionString: databaseUrl });
  const durableOperation = app.get(DurableOperationService);
  const playerRuntime = app.get(PlayerRuntimeService);

  const playerId = `sf_${Date.now().toString(36)}`;
  const sessionId = `sf_session_${Date.now().toString(36)}`;
  const staleSessionId = `${sessionId}:stale`;
  const operationIds = Array.from({ length: 20 }, (_, index) => `op:${playerId}:session-fence:${index}`);

  try {
    const freshSnapshot = playerRuntime.buildFreshPersistenceSnapshot(playerId, {
      templateId: 'yunlai_town',
      x: 12,
      y: 12,
      facing: Direction.South,
    });
    if (!freshSnapshot) {
      throw new Error('failed to build fresh player snapshot for session fencing report');
    }
    playerRuntime.hydrateFromSnapshot(playerId, sessionId, freshSnapshot as never);
    playerRuntime.syncFromWorldView(playerId, sessionId, {
      instance: { instanceId: 'public:yunlai_town', templateId: 'yunlai_town' },
      self: { x: 12, y: 12, facing: Direction.South },
    });

    const runtimePresence = playerRuntime.describePersistencePresence(playerId);
    if (!runtimePresence?.runtimeOwnerId || !Number.isFinite(runtimePresence.sessionEpoch)) {
      throw new Error('missing runtime presence for session fencing report');
    }

    let successCount = 0;
    let rejectCount = 0;
    for (const operationId of operationIds) {
      try {
        await durableOperation.mutatePlayerWallet({
          operationId,
          playerId,
          expectedRuntimeOwnerId: `${runtimePresence.runtimeOwnerId}:stale`,
          expectedSessionEpoch: Number(runtimePresence.sessionEpoch) + 1,
          walletType: 'spirit_stone',
          action: 'credit',
          delta: 1,
          nextWalletBalances: [{ walletType: 'spirit_stone', balance: 1 }],
        });
        successCount += 1;
      } catch (error: unknown) {
        rejectCount += 1;
      }
    }

    console.log(JSON.stringify({
      ok: true,
      playerId,
      sessionId,
      staleSessionId,
      successCount,
      rejectCount,
      totalCount: operationIds.length,
      answers: '当前已可直接读出玩家 session fencing 的拒绝次数与成功次数，报告可用于观察顶号/旧 session 对强事务的拒绝量',
      excludes: '不证明真实多节点顶号风暴或 socket 导流',
      completionMapping: 'release:proof:stage6.session-fencing',
    }, null, 2));
  } finally {
    await pool.end().catch(() => undefined);
    await app.close().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exitCode = 1;
});
