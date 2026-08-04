import assert from 'node:assert/strict';

import { WorldSessionReaperService } from '../network/world-session-reaper.service';
import { WorldSessionService } from '../network/world-session.service';
import { ActivityRuntimeService } from '../runtime/activity/activity-runtime.service';
import { CraftPanelRuntimeService } from '../runtime/craft/craft-panel-runtime.service';
import { PlayerRuntimeService } from '../runtime/player/player-runtime.service';
import { WorldRuntimeCraftTickService } from '../runtime/world/world-runtime-craft-tick.service';
import { OfflineHangingRuntimeCleanupService } from '../runtime/world/world-runtime-offline-hanging-cleanup.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

const HOUR_MS = 60 * 60 * 1000;
const NOW_MS = 2_000_000_000_000;
const TECHNIQUE_KINDS = [
  'alchemy',
  'forging',
  'enhancement',
  'transmission',
  'formation',
  'gather',
  'mining',
  'building',
] as const;

type TechniqueKind = typeof TECHNIQUE_KINDS[number];
type TestPlayer = {
  playerId: string;
  sessionId: string | null;
  instanceId: string;
  sectId: string | null;
  sessionEpoch: number;
  offlineSinceAt: number;
  offlineHangingExpiredAt?: number | null;
  offlineHangingReapReadyAt?: number | null;
  transferState?: string | null;
  transferTargetNodeId?: string | null;
  combat: Record<string, unknown>;
  techniqueActivityQueue: Array<Record<string, unknown>>;
  alchemyJob?: Record<string, unknown> | null;
  forgingJob?: Record<string, unknown> | null;
  enhancementJob?: Record<string, unknown> | null;
  transmissionJob?: Record<string, unknown> | null;
  formationJob?: Record<string, unknown> | null;
  gatherJob?: Record<string, unknown> | null;
  miningJob?: Record<string, unknown> | null;
  buildingJob?: Record<string, unknown> | null;
};

async function main(): Promise<void> {
  assertPlayerRuntimeExpiryMarker();
  assertCraftCleanupHelpers();
  assertExpiredRuntimeDoesNotEnterCraftTick();
  const cleanupProof = await assertEntitlementCleanupAndReaperHandoff();
  await assertEntitlementFailureStopsWholeSweep();
  await assertActivityEntitlementReadsFailClosed();
  assertReconnectCancelsSyntheticReap();

  console.log(JSON.stringify({
    ok: true,
    case: 'offline-hanging-runtime-cleanup',
    cleanupProof,
  }, null, 2));
}

function assertPlayerRuntimeExpiryMarker(): void {
  const runtime = Object.create(PlayerRuntimeService.prototype) as PlayerRuntimeService;
  let recalculateCount = 0;
  const player = {
    playerId: 'marker-player',
    sessionId: null,
    templateId: 'map:marker',
    offlineSinceAt: NOW_MS - 49 * HOUR_MS,
    offlineHangingExpiredAt: null,
    offlineHangingReapReadyAt: null,
    transferState: null,
    transferTargetNodeId: null,
    sessionEpoch: 3,
    runtimeOwnerId: 'owner:marker',
    lastHeartbeatAt: null,
    persistentRevision: 4,
    dirtyDomains: new Set<string>(),
    persistenceDomainRevisionByDomain: new Map<string, number>(),
    combat: {
      cultivationActive: true,
      autoRootFoundation: true,
      autoBattle: true,
      manualEngagePending: true,
      combatTargetId: 'monster:1',
      combatTargetLocked: true,
      retaliatePlayerTargetId: 'player:2',
      retaliatePlayerTargetLastAttackTick: 5,
    },
  };
  (runtime as unknown as { players: Map<string, unknown> }).players = new Map([[player.playerId, player]]);
  (runtime as unknown as { offlineGainSessionsByPlayerId: Map<string, unknown> }).offlineGainSessionsByPlayerId = new Map();
  (runtime as unknown as { playerAttributesService: { recalculate(): void } }).playerAttributesService = {
    recalculate() {
      recalculateCount += 1;
    },
  };

  assert.equal(runtime.markOfflineHangingRuntimeExpired(player.playerId, NOW_MS), true);
  assert.equal(player.offlineHangingExpiredAt, NOW_MS);
  assert.equal(player.combat.cultivationActive, false);
  assert.equal(player.combat.autoRootFoundation, false);
  assert.equal(player.combat.autoBattle, false);
  assert.equal(player.combat.manualEngagePending, false);
  assert.equal(player.combat.combatTargetId, null);
  assert.equal(recalculateCount, 1);
  assert.equal(player.persistentRevision, 5);
  assert.equal(player.dirtyDomains.has('presence'), false);
  assert.equal(player.dirtyDomains.has('combat_pref'), true);
  assert.equal(player.dirtyDomains.has('attr'), true);
  assert.equal(runtime.describePersistencePresence(player.playerId)?.inWorld, true);
  assert.equal(runtime.canUnloadDetachedPlayerRuntime(player.playerId), false);
  assert.equal(runtime.markOfflineHangingRuntimeExpired(player.playerId, NOW_MS + 1), true);
  assert.equal(player.persistentRevision, 5, '重复标记必须幂等');
  assert.equal(runtime.markOfflineHangingRuntimeReadyForReap(player.playerId, NOW_MS + 2), true);
  assert.equal(player.offlineHangingReapReadyAt, NOW_MS + 2);
  assert.equal(player.persistentRevision, 6);
  assert.equal(player.dirtyDomains.has('presence'), true);
  assert.equal(runtime.describePersistencePresence(player.playerId)?.inWorld, false);
  assert.equal(runtime.canUnloadDetachedPlayerRuntime(player.playerId), true);
  assert.equal(runtime.markOfflineHangingRuntimeReadyForReap(player.playerId, NOW_MS + 3), true);
  assert.equal(player.persistentRevision, 6, '重复开放 reaper 必须幂等');
}

function assertCraftCleanupHelpers(): void {
  const craft = Object.create(CraftPanelRuntimeService.prototype) as CraftPanelRuntimeService;
  const dirtyDomains: string[][] = [];
  let revisionBumps = 0;
  (craft as unknown as {
    playerRuntimeService: {
      markPersistenceDirtyDomains(player: unknown, domains: string[]): void;
      bumpPersistentRevision(player: unknown): void;
    };
  }).playerRuntimeService = {
    markPersistenceDirtyDomains(_player, domains) {
      dirtyDomains.push(domains);
    },
    bumpPersistentRevision() {
      revisionBumps += 1;
    },
  };
  (craft as unknown as { durableOperationService: null }).durableOperationService = null;
  const player: TestPlayer & { suppressImmediateDomainPersistence: boolean } = {
    ...createOfflinePlayer('craft-cleanup', 49),
    suppressImmediateDomainPersistence: true,
    techniqueActivityQueue: [{ queueId: 'queued:1' }, { malformed: true }],
  };
  for (const kind of TECHNIQUE_KINDS) {
    setTechniqueJob(player, kind, { remainingTicks: 0, jobVersion: 1 });
  }

  assert.deepEqual(craft.listCancelableTechniqueActivityKinds(player), TECHNIQUE_KINDS);
  assert.equal(craft.clearTechniqueActivityQueue(player), 2);
  assert.deepEqual(player.techniqueActivityQueue, []);
  assert.deepEqual(dirtyDomains, [['active_job']]);
  assert.equal(revisionBumps, 1);

  const legacyForgingPlayer: TestPlayer & { suppressImmediateDomainPersistence: boolean } = {
    ...createOfflinePlayer('legacy-forging-cleanup', 49),
    suppressImmediateDomainPersistence: true,
    alchemyJob: { jobType: 'forging', remainingTicks: 0, jobVersion: 1 },
    forgingJob: null,
  };
  assert.equal(craft.normalizeLegacyForgingJobSlot(legacyForgingPlayer), true);
  assert.equal(legacyForgingPlayer.alchemyJob, null);
  assert.equal(legacyForgingPlayer.forgingJob?.jobType, 'forging');
  assert.deepEqual(craft.listCancelableTechniqueActivityKinds(legacyForgingPlayer), ['forging']);
}

function assertExpiredRuntimeDoesNotEnterCraftTick(): void {
  const players = new Map<string, Record<string, unknown>>([
    ['expired', {
      playerId: 'expired',
      offlineHangingExpiredAt: NOW_MS,
      alchemyJob: { remainingTicks: 1 },
    }],
    ['active', {
      playerId: 'active',
      offlineHangingExpiredAt: null,
      alchemyJob: { remainingTicks: 1 },
    }],
  ]);
  const craftTick = new WorldRuntimeCraftTickService(
    {
      getPlayer(playerId: string) {
        return players.get(playerId) ?? null;
      },
    } as never,
    {
      isPlayerSessionFenceSuperseded() {
        return false;
      },
    } as never,
    {} as never,
  );
  assert.deepEqual(craftTick.listTickablePlayerIds(['expired', 'active']), ['active']);
}

async function assertEntitlementCleanupAndReaperHandoff(): Promise<Record<string, unknown>> {
  const sessionService = new WorldSessionService();
  const events: string[] = [];
  let assetMutationDepth = 0;
  let deferredAssetStatisticScope = false;
  let observedDeferredOuterScope = false;
  const players = new Map<string, TestPlayer>([
    ['ordinary-expired', createOfflinePlayer('ordinary-expired', 49, true)],
    ['month-retained', createOfflinePlayer('month-retained', 60)],
    ['month-expired', createOfflinePlayer('month-expired', 73)],
    ['eternal-retained', createOfflinePlayer('eternal-retained', 120)],
    ['ordinary-retained', createOfflinePlayer('ordinary-retained', 47)],
    ['online-player', { ...createOfflinePlayer('online-player', 100), sessionId: 'session:online' }],
    ['reconnected-during-cleanup', createOfflinePlayer('reconnected-during-cleanup', 49, true)],
  ]);
  const playerRuntimeService = {
    listPlayerIds() {
      return Array.from(players.keys());
    },
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    async runExclusiveAssetMutation<T>(
      _playerIds: readonly string[],
      action: () => Promise<T> | T,
      options: { deferAssetStatisticsUntilSuccess?: boolean } = {},
    ): Promise<T> {
      if (assetMutationDepth > 0) {
        if (options.deferAssetStatisticsUntilSuccess === true && !deferredAssetStatisticScope) {
          throw new Error('player_asset_statistic_deferred_scope_required');
        }
        return await action();
      }
      assetMutationDepth += 1;
      deferredAssetStatisticScope = options.deferAssetStatisticsUntilSuccess === true;
      observedDeferredOuterScope ||= deferredAssetStatisticScope;
      try {
        return await action();
      } finally {
        deferredAssetStatisticScope = false;
        assetMutationDepth -= 1;
      }
    },
    markOfflineHangingRuntimeExpired(playerId: string, expiredAt: number) {
      const player = players.get(playerId);
      if (!player || player.sessionId) {
        return false;
      }
      events.push(`mark:${playerId}`);
      player.offlineHangingExpiredAt = expiredAt;
      player.offlineHangingReapReadyAt = null;
      player.combat.cultivationActive = false;
      player.combat.autoBattle = false;
      return true;
    },
    markOfflineHangingRuntimeReadyForReap(playerId: string, readyAt: number) {
      const player = players.get(playerId);
      if (!player || player.sessionId || !player.offlineHangingExpiredAt) {
        return false;
      }
      events.push(`ready:${playerId}`);
      player.offlineHangingReapReadyAt = readyAt;
      return true;
    },
    async finalizeOfflineGainSessionForPlayer(player: TestPlayer) {
      events.push(`finalize:${player.playerId}`);
    },
    canUnloadDetachedPlayerRuntime(playerId: string) {
      return players.has(playerId);
    },
  };
  const craftPanelRuntimeService = {
    normalizeLegacyForgingJobSlot() {
      return false;
    },
    clearTechniqueActivityQueue(player: TestPlayer) {
      const count = player.techniqueActivityQueue.length;
      player.techniqueActivityQueue = [];
      events.push(`clear-queue:${player.playerId}`);
      return count;
    },
    listCancelableTechniqueActivityKinds(player: TestPlayer | null): TechniqueKind[] {
      return player
        ? TECHNIQUE_KINDS.filter((kind) => Boolean(getTechniqueJob(player, kind)))
        : [];
    },
    async flushTechniqueActivityProjection(player: TestPlayer) {
      events.push(`projection:${player.playerId}`);
      return true;
    },
  };
  const commandService = {
    async dispatchCancelTechniqueActivity(playerId: string, kind: TechniqueKind) {
      const player = players.get(playerId);
      if (!player) {
        throw new Error(`missing_player:${playerId}`);
      }
      const cancel = () => {
        events.push(`cancel:${playerId}:${kind}`);
        setTechniqueJob(player, kind, null);
        if (playerId === 'reconnected-during-cleanup' && kind === 'alchemy') {
          const binding = sessionService.registerSocket(createMockSocket('reconnect-socket'), playerId);
          player.sessionId = binding.sessionId;
          player.offlineHangingExpiredAt = null;
          player.offlineHangingReapReadyAt = null;
        }
      };
      if (kind === 'enhancement') {
        await playerRuntimeService.runExclusiveAssetMutation([playerId], cancel, {
          deferAssetStatisticsUntilSuccess: true,
        });
        return;
      }
      cancel();
    },
  };
  const activityPersistenceService = {
    isEnabled() {
      return true;
    },
    async listActiveMonthCardPlayerIds() {
      return ['month-retained', 'month-expired'];
    },
    async listEternalMonthCardPlayerIds() {
      return ['eternal-retained'];
    },
  };
  const cleanup = new OfflineHangingRuntimeCleanupService(
    playerRuntimeService as never,
    activityPersistenceService as never,
    craftPanelRuntimeService as never,
    commandService as never,
    {} as never,
    sessionService,
  );

  const result = await cleanup.sweepExpiredOfflineHangingPlayers(NOW_MS);
  assert.deepEqual(result, {
    scanned: 7,
    candidates: 3,
    queuedForReap: 2,
    retainedByMonthCard: 1,
    retainedByEternalCard: 1,
    skipped: 1,
    failed: 0,
  });
  assert.equal(sessionService.hasDetachedRuntimePendingReap('ordinary-expired'), true);
  assert.equal(sessionService.hasDetachedRuntimePendingReap('month-expired'), true);
  assert.equal(sessionService.hasDetachedRuntimePendingReap('reconnected-during-cleanup'), false);
  assert.ok(sessionService.getBinding('reconnected-during-cleanup')?.connected);
  assert.deepEqual(
    events.filter((entry) => entry.startsWith('cancel:ordinary-expired:')),
    TECHNIQUE_KINDS.map((kind) => `cancel:ordinary-expired:${kind}`),
  );
  assert.deepEqual(
    events.filter((entry) => entry.startsWith('cancel:reconnected-during-cleanup:')),
    TECHNIQUE_KINDS.map((kind) => `cancel:reconnected-during-cleanup:${kind}`),
  );
  assert.equal(observedDeferredOuterScope, true, '外层清理必须提供强化取消所需的延迟统计作用域');
  assert.ok(events.indexOf('clear-queue:ordinary-expired') > events.indexOf('cancel:ordinary-expired:formation'));
  assert.ok(events.indexOf('projection:ordinary-expired') > events.indexOf('clear-queue:ordinary-expired'));
  assert.ok(events.indexOf('finalize:ordinary-expired') > events.indexOf('projection:ordinary-expired'));
  assert.ok(events.indexOf('ready:ordinary-expired') > events.indexOf('finalize:ordinary-expired'));

  const eventsAfterFirstSweep = events.slice();
  const secondResult = await cleanup.sweepExpiredOfflineHangingPlayers(NOW_MS + 1);
  assert.deepEqual(secondResult, {
    scanned: 7,
    candidates: 0,
    queuedForReap: 0,
    retainedByMonthCard: 1,
    retainedByEternalCard: 1,
    skipped: 2,
    failed: 0,
  });
  assert.deepEqual(events, eventsAfterFirstSweep, '重复扫描不得再次取消任务或结算离线收益');

  const flushed: string[] = [];
  const unloaded: string[] = [];
  const routesCleared: string[] = [];
  const reaper = new WorldSessionReaperService(
    sessionService,
    {
      clearDetachedPlayerCaches(playerId: string) {
        events.push(`clear-cache:${playerId}`);
      },
      unloadDetachedPlayerRuntime(playerId: string) {
        unloaded.push(playerId);
        players.delete(playerId);
        return true;
      },
    } as never,
    {
      async flushPlayer(playerId: string) {
        assert.ok(players.get(playerId)?.offlineHangingExpiredAt);
        flushed.push(playerId);
      },
    } as never,
    {
      async clearLocalRoute(playerId: string) {
        routesCleared.push(playerId);
      },
    } as never,
    playerRuntimeService as never,
  );
  await reaper.reapExpiredSessions();

  assert.deepEqual(flushed.sort(), ['month-expired', 'ordinary-expired']);
  assert.deepEqual(unloaded.sort(), ['month-expired', 'ordinary-expired']);
  assert.deepEqual(routesCleared.sort(), ['month-expired', 'ordinary-expired']);
  assert.equal(players.has('ordinary-expired'), false);
  assert.equal(players.has('month-retained'), true);
  assert.equal(players.has('eternal-retained'), true);
  assert.equal(players.has('reconnected-during-cleanup'), true);

  return {
    result,
    cancelledKinds: TECHNIQUE_KINDS,
    flushed,
    unloaded,
    routesCleared,
  };
}

async function assertEntitlementFailureStopsWholeSweep(): Promise<void> {
  const player = createOfflinePlayer('entitlement-query-failed', 49, true);
  let marked = 0;
  const sessionService = new WorldSessionService();
  const cleanup = new OfflineHangingRuntimeCleanupService(
    {
      listPlayerIds() {
        return [player.playerId];
      },
      getPlayer() {
        return player;
      },
      async runExclusiveAssetMutation<T>(_ids: readonly string[], action: () => Promise<T> | T) {
        return await action();
      },
      markOfflineHangingRuntimeExpired() {
        marked += 1;
        return true;
      },
      async finalizeOfflineGainSessionForPlayer() {},
      markOfflineHangingRuntimeReadyForReap() {
        return true;
      },
    } as never,
    {
      isEnabled() {
        return true;
      },
      async listActiveMonthCardPlayerIds() {
        throw new Error('simulated_entitlement_query_failure');
      },
      async listEternalMonthCardPlayerIds() {
        return [];
      },
    } as never,
    {
      normalizeLegacyForgingJobSlot() {
        return false;
      },
      clearTechniqueActivityQueue() {},
      listCancelableTechniqueActivityKinds() {
        return [];
      },
    } as never,
    { async dispatchCancelTechniqueActivity() {} } as never,
    {} as never,
    sessionService,
  );

  await assert.rejects(
    () => cleanup.sweepExpiredOfflineHangingPlayers(NOW_MS),
    /simulated_entitlement_query_failure/,
  );
  assert.equal(marked, 0);
  assert.equal(sessionService.hasDetachedRuntimePendingReap(player.playerId), false);
}

async function assertActivityEntitlementReadsFailClosed(): Promise<void> {
  const activityRuntime = Object.create(ActivityRuntimeService.prototype) as ActivityRuntimeService;
  (activityRuntime as unknown as {
    activityPersistenceService: { isEnabled(): boolean };
  }).activityPersistenceService = {
    isEnabled() {
      return false;
    },
  };
  await assert.rejects(
    () => activityRuntime.listActiveMonthCardPlayerIds(NOW_MS),
    /activity_entitlement_persistence_unavailable/,
  );
  await assert.rejects(
    () => activityRuntime.listEternalMonthCardPlayerIds(),
    /activity_entitlement_persistence_unavailable/,
  );
}

function assertReconnectCancelsSyntheticReap(): void {
  const sessionService = new WorldSessionService();
  assert.equal(sessionService.enqueueDetachedRuntimeForReap({
    playerId: 'synthetic-reconnect',
    instanceId: 'instance:1',
    sessionEpoch: 9,
    detachedAt: NOW_MS - 49 * HOUR_MS,
  }), true);
  assert.equal(sessionService.hasDetachedRuntimePendingReap('synthetic-reconnect'), true);
  assert.equal(sessionService.enqueueDetachedRuntimeForReap({
    playerId: 'synthetic-reconnect',
    instanceId: 'instance:1',
    sessionEpoch: 9,
  }), true);
  sessionService.registerSocket(createMockSocket('synthetic-reconnect-socket'), 'synthetic-reconnect');
  assert.equal(sessionService.hasDetachedRuntimePendingReap('synthetic-reconnect'), false);
  assert.deepEqual(sessionService.consumeExpiredBindings(), []);
}

function createOfflinePlayer(playerId: string, offlineHours: number, withAllJobs = false): TestPlayer {
  const player: TestPlayer = {
    playerId,
    sessionId: null,
    instanceId: 'instance:offline',
    sectId: null,
    sessionEpoch: 7,
    offlineSinceAt: NOW_MS - offlineHours * HOUR_MS,
    offlineHangingReapReadyAt: null,
    combat: {
      cultivationActive: true,
      autoBattle: true,
    },
    techniqueActivityQueue: withAllJobs ? [{ queueId: `queue:${playerId}` }] : [],
  };
  if (withAllJobs) {
    for (const kind of TECHNIQUE_KINDS) {
      setTechniqueJob(player, kind, { remainingTicks: 0, jobVersion: 1 });
    }
  }
  return player;
}

function getTechniqueJob(player: TestPlayer, kind: TechniqueKind): Record<string, unknown> | null | undefined {
  return player[`${kind}Job` as keyof TestPlayer] as Record<string, unknown> | null | undefined;
}

function setTechniqueJob(
  player: TestPlayer,
  kind: TechniqueKind,
  job: Record<string, unknown> | null,
): void {
  (player as unknown as Record<string, unknown>)[`${kind}Job`] = job;
}

function createMockSocket(id: string): {
  id: string;
  emit(): void;
  disconnect(): void;
} {
  return {
    id,
    emit() {},
    disconnect() {},
  };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
