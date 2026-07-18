import assert from 'node:assert/strict';

import { ensureFormationMaintenanceActiveJobReady } from '../runtime/world/world-runtime-formation.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

async function main(): Promise<void> {
  const playerId = 'player:formation-handoff';
  const cleanPlayer = { dirtyDomains: new Set<string>() };
  let flushCount = 0;
  await ensureFormationMaintenanceActiveJobReady(playerId, cleanPlayer, {
    playerPersistenceFlushService: {
      flushPlayerDomains: async () => {
        flushCount += 1;
        return true;
      },
    },
  });
  assert.equal(flushCount, 0, '已收敛的阵法任务不得每息额外刷 active_job');

  const handoffPlayer = { dirtyDomains: new Set<string>(['active_job']) };
  const calls: Array<{ playerId: string; domains: string[] }> = [];
  await ensureFormationMaintenanceActiveJobReady(playerId, handoffPlayer, {
    playerPersistenceFlushService: {
      flushPlayerDomains: async (actualPlayerId: string, domains: string[]) => {
        calls.push({ playerId: actualPlayerId, domains: [...domains] });
        handoffPlayer.dirtyDomains.delete('active_job');
        return true;
      },
    },
  });
  assert.deepEqual(calls, [{ playerId, domains: ['active_job'] }]);

  const failedPlayer = { dirtyDomains: new Set<string>(['active_job']) };
  await assert.rejects(
    ensureFormationMaintenanceActiveJobReady(playerId, failedPlayer, {
      playerPersistenceFlushService: {
        flushPlayerDomains: async () => false,
      },
    }),
    /阵法维护任务状态正在同步/,
    '旧 mining job 未收敛时不得放宽 formation job CAS',
  );

  await assert.rejects(
    ensureFormationMaintenanceActiveJobReady(
      playerId,
      { dirtyDomains: new Set<string>(['active_job']) },
      {},
    ),
    /阵法维护任务状态正在同步/,
    '缺少 active_job 刷盘边界时必须失败关闭',
  );

  console.log('PROOF:FORMATION_MAINTENANCE_JOB_HANDOFF:PASS');
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
