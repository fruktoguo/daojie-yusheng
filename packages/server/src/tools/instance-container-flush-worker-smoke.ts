import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
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
          answers: 'with-db 下可验证 instance container worker 会独立认领 instance_flush_ledger，并写入 instance_container_state/entry/timer',
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
  const instanceDomainPersistenceService = new InstanceDomainPersistenceService({
    getPool() {
      return pool;
    },
  } as never);
  const instanceId = `instance:container:${process.pid}:${Date.now().toString(36)}`;
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
        entries: [
          {
            item: { itemId: 'spirit_grass', count: 1 },
            createdTick: 1,
            visible: true,
          },
        ],
        activeSearch: {
          itemKey: 'spirit_grass',
          totalTicks: 6,
          remainingTicks: 4,
        },
      },
    ],
  };
  const worker = new InstanceContainerFlushWorker(
    {
      listDirtyPersistentInstances() {
        return [instanceId];
      },
      async flushInstanceDomains() {
        await instanceDomainPersistenceService.replaceContainerStates(
          instanceId,
          runtimeSnapshot.containerStates,
        );
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
      domain: 'container_state',
      ownershipEpoch: 0,
      latestVersion: instanceRevision,
    });

    const processedCount = await worker.runOnce('instance-container-worker-smoke');
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));

    const containerStates = await instanceDomainPersistenceService.loadContainerStates(instanceId);
    assert.equal(containerStates.length > 0, true);
    assert.deepEqual(containerStates[0]?.statePayload, {
      sourceId: 'legacy:container:1',
      containerId: 'legacy:container:1',
      generatedAtTick: 1,
      refreshAtTick: 2,
      entries: [
        {
          item: { itemId: 'spirit_grass', count: 1 },
          createdTick: 1,
          visible: true,
        },
      ],
      activeSearch: {
        itemKey: 'spirit_grass',
        totalTicks: 6,
        remainingTicks: 4,
      },
    });
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
          answers: 'instance container worker 可独立认领 instance_flush_ledger，并拆表写入 instance_container_state/entry/timer',
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
    await instanceDomainPersistenceService.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function cleanupRows(pool: Pool, instanceIds: string[]): Promise<void> {
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
  await pool.query('DELETE FROM instance_container_entry WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_timer WHERE instance_id = ANY($1::varchar[])', [instanceIds]).catch(() => undefined);
  await pool.query('DELETE FROM instance_container_state WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
