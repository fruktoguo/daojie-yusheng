import assert from 'node:assert/strict';

import { TechniqueActivityPipelineService } from '../runtime/craft/pipeline/technique-activity-pipeline.service';
import { FormationStrategy } from '../runtime/craft/pipeline/strategies/formation.strategy';
import { WorldRuntimePlayerCommandService } from '../runtime/world/command/world-runtime-player-command.service';
import { WorldRuntimeGameplayWriteFacadeService } from '../runtime/world/world-runtime-gameplay-write-facade.service';
import { dispatchSectGuardianTechniqueActivity } from '../runtime/world/world-runtime-sect-domain.helpers';
import { ensureFormationMaintenanceActiveJobReady } from '../runtime/world/world-runtime-formation.service';
import { buildCraftTickErrorNotice } from '../runtime/world/world-runtime-craft-tick.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);


function testFormationStartAdvancesActiveJobDomainRevision(): void {
  const player = {
    playerId: 'player:formation-domain-revision',
    formationJob: null as Record<string, unknown> | null,
    dirtyDomains: new Set<string>(),
    persistentRevision: 1,
    techniqueActivityQueue: [] as Array<Record<string, unknown>>,
  };
  const markedDomains: string[][] = [];
  const pipeline = new TechniqueActivityPipelineService();
  pipeline.register(new FormationStrategy());
  const result = pipeline.start(player, 'formation', { formationInstanceId: 'formation:revision' }, {
    contentTemplateRepository: {
      getItemName(): string | null { return null; },
      normalizeItem(item: unknown): unknown { return item; },
    },
    resolveExpToNextByLevel(): number { return 60; },
    getInstanceRuntime(): unknown { return null; },
    deps: {
      worldRuntimeFormationService: {
        resolveMaintainableFormation(): Record<string, unknown> {
          return { id: 'formation:revision', name: '太玄封界阵' };
        },
        checkFormationMaintenanceCondition(): { satisfied: boolean } {
          return { satisfied: true };
        },
        createFormationMaintenanceJob(): Record<string, unknown> {
          return {
            jobRunId: 'job:formation:revision',
            jobType: 'formation',
            formationInstanceId: 'formation:revision',
            formationName: '太玄封界阵',
            phase: 'maintaining',
            totalTicks: 1,
            remainingTicks: 1,
            workTotalTicks: 1,
            workRemainingTicks: 1,
            jobVersion: 1,
          };
        },
      },
      playerRuntimeService: {
        markPersistenceDirtyDomains(target: typeof player, domains: string[]): void {
          markedDomains.push([...domains]);
          for (const domain of domains) target.dirtyDomains.add(domain);
        },
        bumpPersistentRevision(target: typeof player): void {
          target.persistentRevision += 1;
        },
      },
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(markedDomains, [['active_job']]);
  assert.equal(player.dirtyDomains.has('active_job'), true);
  assert.equal(player.persistentRevision, 2);
}

type FormationBoundaryPlayer = { playerId: string };

function createFormationBoundaryDeps(player: FormationBoundaryPlayer, log: string[]): Record<string, unknown> {
  return {
    playerRuntimeService: {
      getPlayerOrThrow(): FormationBoundaryPlayer { return player; },
    },
    worldRuntimeFormationService: {
      async flushPendingFormationMaintenanceForPlayer(): Promise<void> { log.push('checkpoint'); },
    },
    craftPanelRuntimeService: {
      startTechniqueActivity(): Record<string, unknown> {
        log.push('start');
        return { ok: true };
      },
      cancelTechniqueActivity(): Record<string, unknown> {
        log.push('cancel');
        return { ok: true };
      },
      async flushTechniqueActivityProjection(
        target: FormationBoundaryPlayer,
        options: { force?: boolean; reason?: string },
      ): Promise<boolean> {
        assert.equal(target, player);
        log.push(`projection:${options.reason}:${options.force === true}`);
        return true;
      },
    },
    worldRuntimeCraftMutationService: {
      flushCraftMutation(_playerId: string, _result: unknown, panel: string): void {
        log.push(`mutation:${panel}`);
      },
    },
  };
}

async function testFormationCommandBoundariesForceProjection(): Promise<void> {
  const player = { playerId: 'player:formation-command-boundary' };
  const log: string[] = [];
  const deps = createFormationBoundaryDeps(player, log);
  const service = Object.create(WorldRuntimePlayerCommandService.prototype) as WorldRuntimePlayerCommandService;
  (service as unknown as { playerRuntimeService: unknown }).playerRuntimeService = (deps as { playerRuntimeService: unknown }).playerRuntimeService;
  await service.dispatchStartTechniqueActivity(player.playerId, 'formation', { formationInstanceId: 'formation:command' }, deps);
  assert.deepEqual(log, ['checkpoint', 'start', 'mutation:formation', 'projection:formation_command_start:true']);
  log.length = 0;
  await service.dispatchCancelTechniqueActivity(player.playerId, 'formation', deps);
  assert.deepEqual(log, ['checkpoint', 'cancel', 'mutation:formation', 'projection:formation_command_cancel:true']);
}

async function testFormationFacadeBoundariesForceProjection(): Promise<void> {
  const player = { playerId: 'player:formation-facade-boundary' };
  const log: string[] = [];
  const deps = createFormationBoundaryDeps(player, log);
  const service = new WorldRuntimeGameplayWriteFacadeService();
  await service.dispatchStartTechniqueActivity(player.playerId, 'formation', { formationInstanceId: 'formation:facade' }, deps);
  assert.deepEqual(log, ['checkpoint', 'start', 'mutation:formation', 'projection:formation_facade_start:true']);
  log.length = 0;
  await service.dispatchCancelTechniqueActivity(player.playerId, 'formation', deps);
  assert.deepEqual(log, ['checkpoint', 'cancel', 'mutation:formation', 'projection:formation_facade_cancel:true']);
}

async function testSectGuardianBoundariesForceProjection(): Promise<void> {
  const player = { playerId: 'player:sect-formation-boundary' };
  const log: string[] = [];
  const deps = createFormationBoundaryDeps(player, log);
  await dispatchSectGuardianTechniqueActivity(player.playerId, 'start', 'formation:sect-guardian', deps);
  assert.deepEqual(log, ['checkpoint', 'start', 'mutation:formation', 'projection:sect_guardian_formation_start:true']);
  log.length = 0;
  await dispatchSectGuardianTechniqueActivity(player.playerId, 'cancel', 'formation:sect-guardian', deps);
  assert.deepEqual(log, ['checkpoint', 'cancel', 'mutation:formation', 'projection:sect_guardian_formation_cancel:true']);
}

async function main(): Promise<void> {
  testFormationStartAdvancesActiveJobDomainRevision();
  await testFormationCommandBoundariesForceProjection();
  await testFormationFacadeBoundariesForceProjection();
  await testSectGuardianBoundariesForceProjection();

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

  // 运行态重建（重新水合/克隆恢复）后：active_job 不脏且无域修订，
  // 守卫必须先补脏标记建立修订，否则强刷后复查永假、每息死循环。
  const rebuiltPlayer = { dirtyDomains: new Set<string>() };
  const rebuiltRevisions = new Map<string, number>();
  let rebuiltPersistedRevision = 0;
  let rebuiltMarkCount = 0;
  let rebuiltFlushCount = 0;
  await ensureFormationMaintenanceActiveJobReady(playerId, rebuiltPlayer, {
    playerRuntimeService: {
      isPersistenceDomainPersisted: () =>
        !rebuiltPlayer.dirtyDomains.has('active_job')
        && (rebuiltRevisions.get('active_job') ?? 0) > 0
        && rebuiltPersistedRevision === rebuiltRevisions.get('active_job'),
      getPersistenceDomainRevision: () => rebuiltRevisions.get('active_job') ?? 0,
      markPersistenceDirtyDomains: (_target: unknown, domains: string[]) => {
        rebuiltMarkCount += 1;
        for (const domain of domains) {
          rebuiltPlayer.dirtyDomains.add(domain);
          rebuiltRevisions.set(domain, (rebuiltRevisions.get(domain) ?? 0) + 1);
        }
      },
    },
    playerPersistenceFlushService: {
      flushPlayerDomains: async () => {
        rebuiltFlushCount += 1;
        rebuiltPlayer.dirtyDomains.delete('active_job');
        rebuiltPersistedRevision = rebuiltRevisions.get('active_job') ?? 0;
        return true;
      },
    },
  });
  assert.equal(rebuiltMarkCount, 1, '未跟踪的 active_job 必须先补脏标记建立域修订');
  assert.equal(rebuiltFlushCount, 1, '补标记后强刷一次即可收敛');

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
