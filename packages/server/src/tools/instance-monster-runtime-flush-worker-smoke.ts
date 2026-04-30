import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { InstanceMonsterRuntimeFlushWorker } from '../runtime/world/instance-monster-runtime-flush.worker';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 instance monster runtime worker 会独立认领 instance_flush_ledger，并写入 instance_monster_runtime_state',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'release:proof:with-db.instance-monster-runtime-flush-worker',
        },
        null,
        2,
      ),
    );
    return;
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = new FlushLedgerService({
    getPool() {
      return pool;
    },
  } as never);
  const wakeup = new FlushWakeupService();
  const instanceDomainPersistenceService = new InstanceDomainPersistenceService({
    getPool() {
      return pool;
    },
  } as never);
  const instanceId = `instance:monster-runtime:${process.pid}:${Date.now().toString(36)}`;
  const instanceRevision = 89;
  const monsterStates = [
    {
      monsterRuntimeId: `${instanceId}:monster:1`,
      monsterId: 'm_demon_king_guard',
      monsterName: '镇渊妖将',
      monsterTier: 'demon_king',
      monsterLevel: 88,
      tileIndex: 9,
      x: 3,
      y: 3,
      hp: 9000,
      maxHp: 12000,
      alive: true,
      respawnLeft: 0,
      respawnTicks: 60,
      statePayload: { attackReadyTick: 7 },
    },
  ];
  const worker = new InstanceMonsterRuntimeFlushWorker(
    {
      listDirtyPersistentInstances() {
        return [instanceId];
      },
      async flushInstanceDomains() {
        await instanceDomainPersistenceService.replaceMonsterRuntimeStates(instanceId, monsterStates);
        return { skipped: false };
      },
      getInstanceRuntime() {
        return {
          meta: {
            persistent: true,
            ownershipEpoch: 0,
          },
          getPersistenceRevision() {
            return instanceRevision;
          },
        };
      },
    } as never,
    ledger,
    wakeup,
  );

  try {
    await ledger.onModuleInit();
    await instanceDomainPersistenceService.onModuleInit();
    await cleanupRows(pool, [instanceId]);
    await ledger.upsertInstanceFlushLedger({
      instanceId,
      domain: 'monster_runtime',
      ownershipEpoch: 0,
      latestVersion: instanceRevision,
    });

    const processedCount = await worker.runOnce('instance-monster-runtime-worker-smoke');
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));

    const rows = await instanceDomainPersistenceService.loadMonsterRuntimeStates(instanceId);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.monsterRuntimeId, `${instanceId}:monster:1`);
    assert.equal(rows[0]?.monsterTier, 'demon_king');

    const ledgerRows = await ledger.claimInstanceFlushLedger({
      workerId: 'instance-monster-runtime-worker-smoke:probe-version',
      domain: 'monster_runtime',
      ownershipEpoch: 0,
      limit: 10,
    });
    assert.equal(ledgerRows.length, 0);

    console.log(
      JSON.stringify(
        {
          ok: true,
          processedCount,
          instanceId,
          monsterRuntimeCount: rows.length,
          answers: 'instance monster runtime worker 可独立认领 instance_flush_ledger，并写入 instance_monster_runtime_state',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'release:proof:with-db.instance-monster-runtime-flush-worker',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRows(pool, [instanceId]).catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await instanceDomainPersistenceService.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
  await pool.query('DELETE FROM instance_monster_runtime_state WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
