import assert from 'node:assert/strict';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { FlushWakeupService } from '../persistence/flush-wakeup.service';
import { InstanceDomainPersistenceService } from '../persistence/instance-domain-persistence.service';
import { InstanceTileDamageFlushWorker } from '../runtime/world/instance-tile-damage-flush.worker';

const databaseUrl = resolveServerDatabaseUrl();

async function main(): Promise<void> {
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'with-db 下可验证 instance tile damage worker 会独立认领 instance_flush_ledger，并写入 instance_tile_damage_state',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'replace-ready:proof:with-db.instance-tile-damage-flush-worker',
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
  const instanceId = `instance:tile-damage:${process.pid}:${Date.now().toString(36)}`;
  const instanceRevision = 79;
  const tileDamageEntries = [
    { tileIndex: 5, hp: 0, maxHp: 100, destroyed: true, respawnLeft: 45, modifiedAt: Date.now() },
  ];
  const worker = new InstanceTileDamageFlushWorker(
    {
      listDirtyPersistentInstances() {
        return [instanceId];
      },
      async flushInstanceDomains() {
        await instanceDomainPersistenceService.saveTileDamageStates(instanceId, tileDamageEntries);
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
      domain: 'tile_damage',
      ownershipEpoch: 0,
      latestVersion: instanceRevision,
    });

    const processedCount = await worker.runOnce('instance-tile-damage-worker-smoke');
    assert.ok(wakeup.listWakeupKeys().some((key) => key.includes(instanceId)));

    const damageStates = await instanceDomainPersistenceService.loadTileDamageStates(instanceId);
    assert.equal(damageStates.length, 1);
    assert.equal(damageStates[0]?.tileIndex, 5);
    assert.equal(damageStates[0]?.destroyed, true);

    const ledgerRows = await ledger.claimInstanceFlushLedger({
      workerId: 'instance-tile-damage-worker-smoke:probe-version',
      domain: 'tile_damage',
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
          tileDamageCount: damageStates.length,
          answers: 'instance tile damage worker 可独立认领 instance_flush_ledger，并写入 instance_tile_damage_state',
          excludes: '不证明多节点 worker 竞争、完整 dead-letter 或 Redis 唤醒',
          completionMapping: 'replace-ready:proof:with-db.instance-tile-damage-flush-worker',
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
  await pool.query('DELETE FROM instance_tile_damage_state WHERE instance_id = ANY($1::varchar[])', [instanceIds]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
