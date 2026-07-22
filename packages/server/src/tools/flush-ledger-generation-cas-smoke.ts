import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { FlushLedgerService } from '../persistence/flush-ledger.service';
import { PlayerFlushLedgerService } from '../persistence/player-flush-ledger.service';
import type { FlushTask } from '../persistence/flush-task.types';

interface LedgerRow {
  ctid: string;
  priority: string;
  latest_version: string;
  flushed_version: string;
  claimed_by: string | null;
  runtime_owner_id: string | null;
  fencing_token: string | null;
  payload_jsonb: unknown;
  failure_category: string | null;
  updated_at: Date;
}

async function main(): Promise<void> {
  verifyStaticSchemaContract();

  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(JSON.stringify({
      ok: true,
      skippedDb: true,
      answers: '静态契约已验证；with-db 环境下继续覆盖 latest-wins、物理 no-op、claim CAS、续租与完成清 payload。',
      excludes: '当前未提供 SERVER_DATABASE_URL/DATABASE_URL，未执行数据库竞争语义验证。',
      completionMapping: 'flush-ledger.latest-wins-claim-cas',
    }, null, 2));
    return;
  }

  const suffix = Date.now().toString(36);
  const playerId = `flush_ledger_cas_player_${suffix}`;
  const instanceId = `public:flush_ledger_cas_instance_${suffix}`;
  const baseDomain = `flush_ledger_cas_base_${suffix}`;
  const claimDomain = `flush_ledger_cas_claim_${suffix}`;
  const fenceDomain = `flush_ledger_cas_fence_${suffix}`;
  const batchPlayerDomain = `flush_ledger_cas_batch_player_${suffix}`;
  const batchInstanceDomain = `flush_ledger_cas_batch_instance_${suffix}`;
  const replayDomain = `flush_ledger_cas_replay_${suffix}`;
  const missingReplayDomain = `flush_ledger_cas_replay_missing_${suffix}`;
  const legacyDomain = `flush_ledger_cas_legacy_${suffix}`;
  const quarantineDomain = `flush_ledger_cas_quarantine_${suffix}`;
  const pool = new Pool({ connectionString: databaseUrl });
  const ledger = new FlushLedgerService({ getPool: () => pool } as never);
  const legacyLedger = new PlayerFlushLedgerService({ getPool: () => pool } as never);

  try {
    await ledger.onModuleInit();
    await legacyLedger.onModuleInit();
    assert.equal(ledger.isEnabled(), true);
    await cleanup(pool, playerId, instanceId);

    await verifyPlayerLatestWins(pool, ledger, playerId, baseDomain);
    await verifyInstanceLatestWins(pool, ledger, instanceId, baseDomain);
    await verifyOldClaimCannotAck(pool, ledger, playerId, claimDomain);
    await verifyFenceChangeInvalidatesClaim(pool, ledger, playerId, fenceDomain);
    await verifyBatchClaimCas(
      pool,
      ledger,
      playerId,
      instanceId,
      batchPlayerDomain,
      batchInstanceDomain,
    );
    await verifyRecoveryClaimControls(pool, ledger, playerId, replayDomain, missingReplayDomain);
    await verifyLegacyPlayerClaimCas(pool, legacyLedger, playerId, legacyDomain);
    await verifyAssetConflictQuarantineSticky(pool, ledger, playerId, quarantineDomain);

    console.log(JSON.stringify({
      ok: true,
      answers: '已验证玩家和实例 latest-wins、equal/older 物理 no-op、同版本缺失 payload 修复、批量去重、统一与旧 player ledger 的唯一 claimOwnerId/CAS、30 秒认领、续租、旧 claim 拒绝 ack/retry、仅 complete 清 payload，以及启动 replay 的 delayed/payload 过滤与全局计数。',
      excludes: '不包含生产并发压测，也不在线删除历史重复索引。',
      completionMapping: 'flush-ledger.latest-wins-claim-cas',
    }, null, 2));
  } finally {
    await cleanup(pool, playerId, instanceId).catch(() => undefined);
    await legacyLedger.onModuleDestroy().catch(() => undefined);
    await ledger.onModuleDestroy().catch(() => undefined);
    await pool.end().catch(() => undefined);
  }
}

async function verifyLegacyPlayerClaimCas(
  pool: Pool,
  ledger: PlayerFlushLedgerService,
  playerId: string,
  domain: string,
): Promise<void> {
  const revision = Date.now();
  assert.equal(await ledger.seedDirtyPlayers({ playerIds: [playerId], domain, latestVersion: revision }), 1);
  const [oldClaim] = await ledger.claimReadyPlayers({
    workerId: 'flush-ledger-cas:legacy-old',
    domain,
    limit: 1,
    claimTtlMs: 1_000,
  });
  assert(oldClaim?.claimOwnerId);
  await pool.query(
    "UPDATE player_flush_ledger SET claim_until = now() - interval '1 second' WHERE player_id = $1 AND domain = $2",
    [playerId, domain],
  );
  const [currentClaim] = await ledger.claimReadyPlayers({
    workerId: 'flush-ledger-cas:legacy-current',
    domain,
    limit: 1,
    claimTtlMs: 1_000,
  });
  assert(currentClaim?.claimOwnerId);
  assert.notEqual(currentClaim.claimOwnerId, oldClaim.claimOwnerId);
  assert.equal(await ledger.markRetry({
    playerId,
    domain,
    retryDelayMs: 250,
    claimOwnerId: oldClaim.claimOwnerId,
  }), false);
  assert.equal(await ledger.markFlushed({
    playerId,
    domain,
    flushedVersion: oldClaim.latestVersion,
    claimOwnerId: oldClaim.claimOwnerId,
  }), false);
  assert.equal(await ledger.markFlushed({
    playerId,
    domain,
    flushedVersion: currentClaim.latestVersion,
    claimOwnerId: currentClaim.claimOwnerId,
  }), true);
  const completed = await readPlayerRow(pool, playerId, domain);
  assert.equal(Number(completed.flushed_version), revision);
  assert.equal(completed.claimed_by, null);
}

async function verifyRecoveryClaimControls(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  replayDomain: string,
  missingReplayDomain: string,
): Promise<void> {
  const delayedTask = playerTask(playerId, replayDomain, 500, 'replay-fence', 'replay');
  delayedTask.nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
  await ledger.upsertFlushTask(delayedTask);
  assert((await ledger.countPendingPayloadTasks({ scope: 'player', id: playerId })) > 0);
  assert.equal(await ledger.countPendingPayloadTasks({ scope: 'instance', id: `${playerId}:missing`, ownershipEpoch: 1 }), 0);
  assert.equal((await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:replay-default',
    scope: 'player',
    id: playerId,
    domain: replayDomain,
    payloadRequired: true,
    limit: 1,
  })).length, 0, 'default claim must respect delayed retry time');
  assert.equal((await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:replay-wrong-id',
    scope: 'player',
    id: `${playerId}:missing`,
    domain: replayDomain,
    payloadRequired: true,
    includeDelayed: true,
    limit: 1,
  })).length, 0, 'id filter must isolate replay ownership');
  const [replayTask] = await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:replay-drain',
    scope: 'player',
    id: playerId,
    domain: replayDomain,
    payloadRequired: true,
    includeDelayed: true,
    limit: 1,
  });
  assert(replayTask?.claimOwnerId);
  assert((await ledger.countPendingPayloadTasks()) > 0);
  assert((await ledger.countPendingPayloadTasks({ scope: 'player', id: playerId })) > 0, 'valid claim must remain visible to drain count');
  assert.equal(await ledger.markFlushTaskFlushed(replayTask), true);

  const missingPayload = playerTask(playerId, missingReplayDomain, 501, 'replay-fence', 'unused');
  missingPayload.nextAttemptAt = new Date(Date.now() + 60_000).toISOString();
  missingPayload.payloadJson = null;
  await ledger.upsertFlushTask(missingPayload);
  assert.equal((await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:replay-payload-required',
    scope: 'player',
    id: playerId,
    domain: missingReplayDomain,
    payloadRequired: true,
    includeDelayed: true,
    limit: 1,
  })).length, 0, 'payloadRequired must exclude unreplayable rows');
  const [legacyClaim] = await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:replay-payload-optional',
    scope: 'player',
    id: playerId,
    domain: missingReplayDomain,
    includeDelayed: true,
    limit: 1,
  });
  assert(legacyClaim?.claimOwnerId, 'default payload behavior must remain compatible');
  assert.equal(await ledger.markFlushTaskFlushed(legacyClaim), true);
  assert.equal((await readPlayerRow(pool, playerId, missingReplayDomain)).payload_jsonb, null);
}

function verifyStaticSchemaContract(): void {
  const sourcePath = path.resolve(__dirname, '../../src/persistence/flush-ledger.service.ts');
  const source = readFileSync(sourcePath, 'utf8');
  assert.equal(source.includes('CREATE INDEX IF NOT EXISTS player_flush_ledger_domain_pending_idx'), false);
  assert.equal(source.includes('CREATE INDEX IF NOT EXISTS instance_flush_ledger_domain_pending_idx'), false);
  assert.equal(source.includes('CREATE INDEX IF NOT EXISTS player_flush_ledger_idempotency_idx'), false);
  assert.equal(source.includes('CREATE INDEX IF NOT EXISTS instance_flush_ledger_idempotency_idx'), false);
  assert.match(source, /SERVER_FLUSH_TASK_CLAIM_TTL_MS/);
  assert.match(source, /jsonb_to_recordset\(\$1::jsonb\)/);
  assert.match(source, /upsertFlushTasksDetailed/);
  assert.match(source, /RETURNING player_id, domain/);
  assert.match(source, /RETURNING instance_id, domain, ownership_epoch/);
}

async function verifyPlayerLatestWins(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  domain: string,
): Promise<void> {
  const initialTask = playerTask(playerId, domain, 100, 'generation-a', 'v100', 'high');
  initialTask.runtimeOwnerId = 'owner-a';
  const initialResult = await ledger.upsertFlushTasksDetailed([initialTask]);
  assert.equal(initialResult.changed, 1);
  assert.deepEqual(initialResult.accepted, [{
    scope: 'player',
    id: playerId,
    domain,
    ownershipEpoch: null,
  }]);
  const initial = await readPlayerRow(pool, playerId, domain);

  const equalResult = await ledger.upsertFlushTasksDetailed([
    playerTask(playerId, domain, 100, 'generation-a', 'equal-overwrite', 'low'),
  ]);
  assert.equal(equalResult.changed, 0);
  assert.deepEqual(equalResult.accepted, []);
  const afterEqual = await readPlayerRow(pool, playerId, domain);
  assert.equal(afterEqual.ctid, initial.ctid, 'equal upsert must not create a new heap tuple');
  assert.equal(afterEqual.updated_at.toISOString(), initial.updated_at.toISOString());
  assert.deepEqual(afterEqual.payload_jsonb, { value: 'v100' });
  assert.equal(afterEqual.priority, 'high');

  const olderChanged = await ledger.upsertFlushTasks([playerTask(playerId, domain, 99, 'generation-old', 'older')]);
  assert.equal(olderChanged, 0);
  const afterOlder = await readPlayerRow(pool, playerId, domain);
  assert.equal(afterOlder.ctid, initial.ctid);
  assert.equal(afterOlder.fencing_token, 'generation-a');
  assert.deepEqual(afterOlder.payload_jsonb, { value: 'v100' });

  const newerChanged = await ledger.upsertFlushTasks([playerTask(playerId, domain, 101, 'generation-b', 'v101', 'low')]);
  assert.equal(newerChanged, 1);
  const afterNewer = await readPlayerRow(pool, playerId, domain);
  assert.equal(Number(afterNewer.latest_version), 101);
  assert.equal(afterNewer.fencing_token, 'generation-b');
  assert.equal(afterNewer.runtime_owner_id, null, 'newer payload must be allowed to clear stale runtime owner metadata');
  assert.deepEqual(afterNewer.payload_jsonb, { value: 'v101' });
  assert.equal(afterNewer.priority, 'high', 'same domain priority must stay stable across newer revisions');

  const dedupChanged = await ledger.upsertFlushTasks([
    playerTask(playerId, domain, 102, 'generation-b', 'v102'),
    playerTask(playerId, domain, 104, 'generation-b', 'v104'),
    playerTask(playerId, domain, 103, 'generation-b', 'v103'),
  ], 1);
  assert.equal(dedupChanged, 1, 'same key must be collapsed before SQL batching');
  assert.equal(Number((await readPlayerRow(pool, playerId, domain)).latest_version), 104);

  await pool.query(
    'UPDATE player_flush_ledger SET payload_jsonb = NULL WHERE player_id = $1 AND domain = $2',
    [playerId, domain],
  );
  const repaired = await ledger.upsertFlushTasks([playerTask(playerId, domain, 104, 'generation-b', 'repair')]);
  assert.equal(repaired, 1);
  assert.deepEqual((await readPlayerRow(pool, playerId, domain)).payload_jsonb, { value: 'repair' });
  assert.equal(await ledger.upsertFlushTasks([playerTask(playerId, domain, 104, 'generation-b', 'repeat')]), 0);
}

async function verifyAssetConflictQuarantineSticky(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  domain: string,
): Promise<void> {
  await ledger.upsertFlushTask(playerTask(playerId, domain, 500, 'quarantine-generation', 'before-quarantine'));
  await pool.query(
    `UPDATE player_flush_ledger
     SET failure_category = 'startup_asset_conflict'
     WHERE player_id = $1 AND domain = $2`,
    [playerId, domain],
  );
  assert.equal(
    await ledger.upsertFlushTasks([playerTask(playerId, domain, 501, 'quarantine-generation', 'after-quarantine')]),
    1,
  );
  const row = await readPlayerRow(pool, playerId, domain);
  assert.equal(Number(row.latest_version), 501);
  assert.deepEqual(row.payload_jsonb, { value: 'after-quarantine' });
  assert.equal(row.failure_category, 'startup_asset_conflict', '普通 staging 不得隐式解除人工资产隔离');
}

async function verifyInstanceLatestWins(
  pool: Pool,
  ledger: FlushLedgerService,
  instanceId: string,
  domain: string,
): Promise<void> {
  const initialTask = instanceTask(instanceId, domain, 10, 'instance-generation', 'v10');
  initialTask.runtimeOwnerId = 'instance-owner-a';
  assert.equal(await ledger.upsertFlushTasks([initialTask]), 1);
  const initial = await readInstanceRow(pool, instanceId, domain);
  assert.equal(await ledger.upsertFlushTasks([instanceTask(instanceId, domain, 10, 'instance-generation', 'equal')]), 0);
  assert.equal((await readInstanceRow(pool, instanceId, domain)).ctid, initial.ctid);
  assert.equal(await ledger.upsertFlushTasks([instanceTask(instanceId, domain, 9, 'instance-old', 'older')]), 0);
  assert.deepEqual((await readInstanceRow(pool, instanceId, domain)).payload_jsonb, { value: 'v10' });
  assert.equal(await ledger.upsertFlushTasks([instanceTask(instanceId, domain, 11, 'instance-generation', 'v11')]), 1);
  const afterNewer = await readInstanceRow(pool, instanceId, domain);
  assert.deepEqual(afterNewer.payload_jsonb, { value: 'v11' });
  assert.equal(afterNewer.runtime_owner_id, null, 'newer instance payload must clear stale runtime owner metadata');
}

async function verifyOldClaimCannotAck(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  domain: string,
): Promise<void> {
  await ledger.upsertFlushTask(playerTask(playerId, domain, 200, 'claim-generation', 'v200'));
  const [revision200] = await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:first',
    scope: 'player',
    domain,
    limit: 1,
    claimTtlMs: 30_000,
  });
  assert(revision200?.claimOwnerId);
  const ttlSeconds = await readClaimTtlSeconds(pool, 'player_flush_ledger', 'player_id', playerId, domain);
  assert(ttlSeconds > 20 && ttlSeconds <= 31, `expected approximately 30 second claim, got ${ttlSeconds}`);

  await ledger.upsertFlushTask(playerTask(playerId, domain, 201, 'claim-generation', 'v201'));
  assert.equal(await ledger.markFlushTaskFlushed(revision200), true);
  const partial = await readPlayerRow(pool, playerId, domain);
  assert.equal(Number(partial.flushed_version), 200);
  assert.equal(Number(partial.latest_version), 201);
  assert.deepEqual(partial.payload_jsonb, { value: 'v201' }, 'partial completion must retain the newer payload');

  const [oldClaim] = await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:old',
    scope: 'player',
    domain,
    limit: 1,
  });
  assert(oldClaim?.claimOwnerId);
  await pool.query(
    "UPDATE player_flush_ledger SET claim_until = now() - interval '1 second' WHERE player_id = $1 AND domain = $2",
    [playerId, domain],
  );
  const [currentClaim] = await ledger.claimReadyFlushTasks({
    workerId: 'flush-ledger-cas:current',
    scope: 'player',
    domain,
    limit: 1,
  });
  assert(currentClaim?.claimOwnerId);
  assert.notEqual(currentClaim.claimOwnerId, oldClaim.claimOwnerId);
  assert.equal(await ledger.renewFlushTaskClaim(oldClaim, 60_000), false);
  assert.equal(await ledger.markFlushTaskRetry(oldClaim), false);
  assert.equal(await ledger.markFlushTaskFlushed(oldClaim), false);
  assert.equal(await ledger.renewFlushTaskClaim(currentClaim, 60_000), true);
  assert.equal(await ledger.markFlushTaskFlushed(currentClaim), true);

  const completed = await readPlayerRow(pool, playerId, domain);
  assert.equal(Number(completed.flushed_version), 201);
  assert.equal(completed.payload_jsonb, null, 'complete must clear payload immediately');
  assert.equal(completed.claimed_by, null);
}

async function verifyFenceChangeInvalidatesClaim(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  domain: string,
): Promise<void> {
  await ledger.upsertFlushTask(playerTask(playerId, domain, 300, 'fence-a', 'v300'));
  const [oldTask] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:fence-old', scope: 'player', domain, limit: 1 });
  assert(oldTask?.claimOwnerId);
  await ledger.upsertFlushTask(playerTask(playerId, domain, 301, 'fence-b', 'v301'));
  assert.equal((await readPlayerRow(pool, playerId, domain)).claimed_by, null);
  assert.equal(await ledger.markFlushTaskFlushed(oldTask), false);
  const [currentTask] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:fence-current', scope: 'player', domain, limit: 1 });
  assert(currentTask?.claimOwnerId);
  assert.equal(await ledger.markFlushTaskFlushed(currentTask), true);
}

async function verifyBatchClaimCas(
  pool: Pool,
  ledger: FlushLedgerService,
  playerId: string,
  instanceId: string,
  playerDomain: string,
  instanceDomain: string,
): Promise<void> {
  assert.equal(await ledger.upsertFlushTasks([
    playerTask(playerId, playerDomain, 400, 'batch-player-fence', 'player'),
    instanceTask(instanceId, instanceDomain, 400, 'batch-instance-fence', 'instance'),
  ]), 2);
  const [playerClaim] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:batch-player', scope: 'player', id: playerId, domain: playerDomain, limit: 1 });
  const [instanceClaim] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:batch-instance', scope: 'instance', id: instanceId, domain: instanceDomain, ownershipEpoch: 1, limit: 1 });
  assert(playerClaim?.claimOwnerId);
  assert(instanceClaim?.claimOwnerId);

  const staleClaims = [playerClaim, instanceClaim].map((task) => ({ ...task, claimOwnerId: `${task.claimOwnerId}:stale` }));
  assert.equal(await ledger.markFlushTasksRetry(staleClaims, 250), 0);
  assert.equal(await ledger.markFlushTasksRetry([playerClaim, instanceClaim], 250), 2);
  await pool.query('UPDATE player_flush_ledger SET next_attempt_at = now(), retry_after = now() WHERE player_id = $1 AND domain = $2', [playerId, playerDomain]);
  await pool.query('UPDATE instance_flush_ledger SET next_attempt_at = now(), retry_after = now() WHERE instance_id = $1 AND domain = $2', [instanceId, instanceDomain]);

  const [playerReclaim] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:batch-player-reclaim', scope: 'player', id: playerId, domain: playerDomain, limit: 1 });
  const [instanceReclaim] = await ledger.claimReadyFlushTasks({ workerId: 'flush-ledger-cas:batch-instance-reclaim', scope: 'instance', id: instanceId, domain: instanceDomain, ownershipEpoch: 1, limit: 1 });
  assert(playerReclaim?.claimOwnerId);
  assert(instanceReclaim?.claimOwnerId);
  const staleReclaims = [playerReclaim, instanceReclaim].map((task) => ({ ...task, fencingToken: `${task.fencingToken}:stale` }));
  assert.equal(await ledger.markFlushTasksFlushed(staleReclaims), 0);
  assert.equal(await ledger.markFlushTasksFlushed([playerReclaim, instanceReclaim]), 2);
  assert.equal((await readPlayerRow(pool, playerId, playerDomain)).payload_jsonb, null);
  assert.equal((await readInstanceRow(pool, instanceId, instanceDomain)).payload_jsonb, null);
}

function playerTask(
  playerId: string,
  domain: string,
  revision: number,
  fencingToken: string,
  value: string,
  priority: FlushTask['priority'] = 'normal',
): FlushTask {
  return {
    scope: 'player',
    id: playerId,
    domain,
    priority,
    latestRevision: revision,
    fencingToken,
    nextAttemptAt: new Date().toISOString(),
    payloadJson: { value },
  };
}

function instanceTask(
  instanceId: string,
  domain: string,
  revision: number,
  fencingToken: string,
  value: string,
): FlushTask {
  return {
    scope: 'instance',
    id: instanceId,
    domain,
    priority: 'normal',
    ownershipEpoch: 1,
    latestRevision: revision,
    fencingToken,
    nextAttemptAt: new Date().toISOString(),
    payloadJson: { value },
  };
}

async function readPlayerRow(pool: Pool, playerId: string, domain: string): Promise<LedgerRow> {
  const result = await pool.query<LedgerRow>(
    `SELECT ctid::text AS ctid, priority, latest_version, flushed_version, claimed_by,
      runtime_owner_id, fencing_token, payload_jsonb, failure_category, updated_at
     FROM player_flush_ledger WHERE player_id = $1 AND domain = $2`,
    [playerId, domain],
  );
  assert(result.rows[0]);
  return result.rows[0];
}

async function readInstanceRow(pool: Pool, instanceId: string, domain: string): Promise<LedgerRow> {
  const result = await pool.query<LedgerRow>(
    `SELECT ctid::text AS ctid, priority, latest_version, flushed_version, claimed_by,
      runtime_owner_id, fencing_token, payload_jsonb, failure_category, updated_at
     FROM instance_flush_ledger WHERE instance_id = $1 AND domain = $2 AND ownership_epoch = 1`,
    [instanceId, domain],
  );
  assert(result.rows[0]);
  return result.rows[0];
}

async function readClaimTtlSeconds(
  pool: Pool,
  tableName: 'player_flush_ledger' | 'instance_flush_ledger',
  idColumn: 'player_id' | 'instance_id',
  id: string,
  domain: string,
): Promise<number> {
  const result = await pool.query<{ ttl_seconds: string }>(
    `SELECT EXTRACT(EPOCH FROM (claim_until - now()))::text AS ttl_seconds
     FROM ${tableName} WHERE ${idColumn} = $1 AND domain = $2`,
    [id, domain],
  );
  return Number(result.rows[0]?.ttl_seconds ?? 0);
}

async function cleanup(pool: Pool, playerId: string, instanceId: string): Promise<void> {
  await pool.query('DELETE FROM player_flush_ledger WHERE player_id = $1', [playerId]);
  await pool.query('DELETE FROM instance_flush_ledger WHERE instance_id = $1', [instanceId]);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
