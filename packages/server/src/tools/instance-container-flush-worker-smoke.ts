import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { MapPersistenceService } from '../persistence/map-persistence.service';
import { InstanceContainerFlushWorker } from '../runtime/world/instance-container-flush.worker';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 instance container worker 会独立认领 instance_flush_ledger，并驱动现有 map snapshot 刷盘',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'replace-ready:proof:with-db.instance-container-flush-worker',
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
  const mapPersistenceService = new MapPersistenceService();
  const instanceId = `instance:${Date.now().toString(36)}`;
  const instanceRevision = 73;
  const runtimeSnapshot = {
    version: 1,
    savedAt: Date.now(),
    templateId: 'yunlai_town',
    tileResourceEntries: [],
    groundPileEntries: [],
    containerStates: [
      {
        sourceId: 'legacy:container:1',
        containerId: 'legacy:container:1',
        generatedAtTick: 1,
        refreshAtTick: 2,
        entries: [],
      },
    ],
  };
  const worker = new InstanceContainerFlushWorker(
    {
      listDirtyPersistentInstances() {
        return [instanceId];
      },
      buildMapPersistenceSnapshot() {
        return runtimeSnapshot;
      },
      markMapPersisted() {
        return;
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
    mapPersistenceService,
    ledger,
    wakeup,
  );

  try {
    await ledger.onModuleInit();
    await mapPersistenceService.onModuleInit();
    await cleanupRows(pool, [instanceId]);
    await ledger.upsertInstanceFlushLedger({
      instanceId,
      domain: 'container_state',
      ownershipEpoch: 0,
      latestVersion: instanceRevision,
    });

    const processedCount = await worker.runOnce('instance-container-worker-smoke');
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));

    const snapshot = await mapPersistenceService.loadMapSnapshot(instanceId);
    assert(snapshot);
    const containerStates = Array.isArray((snapshot as Record<string, unknown>).containerStates)
      ? ((snapshot as Record<string, unknown>).containerStates as Array<Record<string, unknown>>)
      : [];
    assert.equal(containerStates.length > 0, true);
    const ledgerRows = await ledger.claimInstanceFlushLedger({
      workerId: 'instance-container-worker-smoke:probe-version',
      domain: 'container_state',
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
          containerStateCount: containerStates.length,
          answers: 'instance container worker 可独立认领 instance_flush_ledger，并驱动现有 map snapshot 刷盘',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'replace-ready:proof:with-db.instance-container-flush-worker',
        },
        null,
        2,
      ),
    );
  } finally {
    await cleanupRows(pool, [instanceId]).catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await mapPersistenceService.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
  await pool.query('DELETE FROM persistent_documents WHERE key = ANY($1::varchar[])', [instanceIds]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
