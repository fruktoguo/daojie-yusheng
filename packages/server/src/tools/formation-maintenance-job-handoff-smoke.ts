import assert from 'node:assert/strict';

import { ensureFormationMaintenanceActiveJobReady } from '../runtime/world/world-runtime-formation.service';
import { buildCraftTickErrorNotice } from '../runtime/world/world-runtime-craft-tick.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const playerId = 'player:formation-handoff';
  const cleanPlayer = { dirtyDomains: new Set<string>() };
  let flushCount = 0;
  await ensureFormationMaintenanceActiveJobReady(playerId, cleanPlayer, {
    playerRuntimeService: {
      isPersistenceDomainPersisted: () => true,
    },
    playerPersistenceFlushService: {
      flushPlayerDomains: async () => {
        flushCount += 1;
        return true;
      },
    },
  });
  assert.equal(flushCount, 0, '已收敛的阵法任务不得每息额外刷 active_job');

  const handoffPlayer = { dirtyDomains: new Set<string>(['active_job']) };
  const calls: Array<{ playerId: string; domains: string[]; forceCurrentSnapshot: boolean }> = [];
  await ensureFormationMaintenanceActiveJobReady(playerId, handoffPlayer, {
    playerRuntimeService: {
      isPersistenceDomainPersisted: () => !handoffPlayer.dirtyDomains.has('active_job'),
    },
    playerPersistenceFlushService: {
      flushPlayerDomains: async (actualPlayerId: string, domains: string[], options?: { forceCurrentSnapshot?: boolean }) => {
        calls.push({
          playerId: actualPlayerId,
          domains: [...domains],
          forceCurrentSnapshot: options?.forceCurrentSnapshot === true,
        });
        handoffPlayer.dirtyDomains.delete('active_job');
        return true;
      },
    },
  });
  assert.deepEqual(calls, [{ playerId, domains: ['active_job'], forceCurrentSnapshot: true }]);

  const stagedPlayer = { dirtyDomains: new Set<string>() };
  let stagedPersisted = false;
  let stagedFlushCount = 0;
  await ensureFormationMaintenanceActiveJobReady(playerId, stagedPlayer, {
    playerRuntimeService: {
      isPersistenceDomainPersisted: () => stagedPersisted,
    },
    playerPersistenceFlushService: {
      flushPlayerDomains: async (_actualPlayerId: string, _domains: string[], options?: { forceCurrentSnapshot?: boolean }) => {
        assert.equal(options?.forceCurrentSnapshot, true, 'ledger 已暂存的 active_job 必须强制写当前快照');
        stagedFlushCount += 1;
        stagedPersisted = true;
        return true;
      },
    },
  });
  assert.equal(stagedFlushCount, 1, 'active_job 仅暂存未落库时必须补一次真源写');

  const failedPlayer = { dirtyDomains: new Set<string>(['active_job']) };
  await assert.rejects(
    ensureFormationMaintenanceActiveJobReady(playerId, failedPlayer, {
      playerRuntimeService: {
        isPersistenceDomainPersisted: () => false,
      },
      playerPersistenceFlushService: {
        flushPlayerDomains: async () => false,
      },
    }),
    /formation_maintenance_active_job_sync_pending/,
    '旧 mining job 未收敛时不得放宽 formation job CAS',
  );

  await assert.rejects(
    ensureFormationMaintenanceActiveJobReady(
      playerId,
      { dirtyDomains: new Set<string>(['active_job']) },
      {
        playerRuntimeService: {
          isPersistenceDomainPersisted: () => false,
        },
      },
    ),
    /formation_maintenance_active_job_sync_pending/,
    '缺少 active_job 刷盘边界时必须失败关闭',
  );

  const syncNotice = buildCraftTickErrorNotice(
    new Error('formation_maintenance_active_job_sync_pending'),
  );
  const structured = syncNotice.structured as { key?: string } | undefined;
  assert.equal(structured?.key, 'notice.craft.formation.sync-pending');
  assert.equal(syncNotice.kind, 'warn');

  const fencingNotice = buildCraftTickErrorNotice(
    new Error('formation_maintenance_job_fencing_conflict:expectedJobRunId=new:persistedJobRunId=old'),
  );
  const fencingStructured = fencingNotice.structured as { key?: string } | undefined;
  assert.equal(fencingStructured?.key, 'notice.craft.formation.sync-pending');
  assert.equal(fencingNotice.kind, 'warn');

  console.log('PROOF:FORMATION_MAINTENANCE_JOB_HANDOFF:PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
