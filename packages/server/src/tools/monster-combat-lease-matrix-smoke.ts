// @ts-nocheck

import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

import assert from 'node:assert/strict';

import { WorldRuntimeInstanceTickOrchestrationService } from '../runtime/world/world-runtime-instance-tick-orchestration.service';
import {
  fenceInstanceRuntime,
  isInstanceLeaseWritable,
} from '../runtime/world/world-runtime-instance-lease.helpers';

const LOCAL_NODE_ID = 'monster-combat-lease-smoke:local';
const REMOTE_NODE_ID = 'monster-combat-lease-smoke:remote';
const INSTANCE_ID = 'public:monster-combat-lease-smoke';

async function main(): Promise<void> {
  const localWritable = await verifyLocalWritableMonsterActionApplies();
  const remoteOwned = await verifyRemoteOwnedLeaseBlocksMonsterAction();
  const localExpired = await verifyLocalExpiredLeaseDegradesBeforeMonsterAction();
  const lostDuringTick = await verifyLeaseLostDuringTickBlocksMonsterAction();

  console.log(
    JSON.stringify(
      {
        ok: true,
        localWritable,
        remoteOwned,
        localExpired,
        lostDuringTick,
        answers:
          'monster-combat 在持久化 instance lease 可写时会执行 tick 内怪物 action；远端持有、本节点 lease 过期、tick 中失租时都会在怪物 action 写入前 fencing/degrade 并阻断权威状态推进',
        excludes:
          '不证明真实多节点 socket 导流、Redis pending cast 恢复、真实 AOI emit、数据库 instance_catalog 认领事务或跨节点玩家迁移缓冲',
        completionMapping: 'combat.monster-combat.persistent-lease-matrix',
      },
      null,
      2,
    ),
  );
}

async function verifyLocalWritableMonsterActionApplies(): Promise<Record<string, unknown>> {
  const fixture = createFixture({
    assignedNodeId: LOCAL_NODE_ID,
    leaseToken: 'lease:local:writable',
    leaseExpireAt: futureIso(60_000),
    runtimeStatus: 'leased',
    playerIds: ['player:lease-target'],
  });

  const ticks = await advanceFixture(fixture);

  assert.equal(ticks, 1);
  assert.equal(fixture.instance.tick, 1);
  assert.equal(fixture.appliedMonsterActions.length, 1);
  assert.deepEqual(fixture.fenceReasons, []);
  assert.equal(fixture.instance.meta.runtimeStatus, 'leased');

  return {
    ticks,
    appliedMonsterActions: fixture.appliedMonsterActions.length,
    runtimeStatus: fixture.instance.meta.runtimeStatus,
  };
}

async function verifyRemoteOwnedLeaseBlocksMonsterAction(): Promise<Record<string, unknown>> {
  const fixture = createFixture({
    assignedNodeId: REMOTE_NODE_ID,
    leaseToken: 'lease:remote:writable',
    leaseExpireAt: futureIso(60_000),
    runtimeStatus: 'leased',
    playerIds: ['player:lease-target'],
  });

  const ticks = await advanceFixture(fixture);

  assert.equal(ticks, 0);
  assert.equal(fixture.instance.tick, 0);
  assert.equal(fixture.appliedMonsterActions.length, 0);
  assert.deepEqual(fixture.fenceReasons, ['advance_frame_lease_check_failed']);
  assert.equal(fixture.instance.meta.runtimeStatus, 'fenced');
  assert.equal(fixture.instance.meta.status, 'lease_lost');

  return {
    ticks,
    appliedMonsterActions: fixture.appliedMonsterActions.length,
    runtimeStatus: fixture.instance.meta.runtimeStatus,
    fenceReasons: fixture.fenceReasons,
  };
}

async function verifyLocalExpiredLeaseDegradesBeforeMonsterAction(): Promise<Record<string, unknown>> {
  const fixture = createFixture({
    assignedNodeId: LOCAL_NODE_ID,
    leaseToken: 'lease:local:expired',
    leaseExpireAt: pastIso(60_000),
    runtimeStatus: 'leased',
    playerIds: ['player:lease-target'],
  });

  const ticks = await advanceFixture(fixture);

  assert.equal(ticks, 0);
  assert.equal(fixture.instance.tick, 0);
  assert.equal(fixture.appliedMonsterActions.length, 0);
  assert.deepEqual(fixture.fenceReasons, ['advance_frame_lease_check_failed']);
  assert.equal(fixture.instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(fixture.instance.meta.status, 'active');

  return {
    ticks,
    appliedMonsterActions: fixture.appliedMonsterActions.length,
    runtimeStatus: fixture.instance.meta.runtimeStatus,
    fenceReasons: fixture.fenceReasons,
  };
}

async function verifyLeaseLostDuringTickBlocksMonsterAction(): Promise<Record<string, unknown>> {
  const fixture = createFixture({
    assignedNodeId: LOCAL_NODE_ID,
    leaseToken: 'lease:local:lost-during-tick',
    leaseExpireAt: futureIso(60_000),
    runtimeStatus: 'leased',
    playerIds: ['player:lease-target'],
  });

  let leaseChecks = 0;
  const ticks = await advanceFixture(fixture, {
    isWritable(instance: any): boolean {
      leaseChecks += 1;
      if (leaseChecks <= 1) {
        return isInstanceLeaseWritable(fixture.runtime, instance);
      }
      instance.meta.leaseExpireAt = pastIso(60_000);
      return isInstanceLeaseWritable(fixture.runtime, instance);
    },
  });

  assert.equal(ticks, 1);
  assert.equal(fixture.instance.tick, 0);
  assert.equal(fixture.appliedMonsterActions.length, 0);
  assert.deepEqual(fixture.fenceReasons, ['instance_tick_lease_check_failed']);
  assert.equal(fixture.instance.meta.runtimeStatus, 'lease_degraded');
  assert.equal(fixture.instance.meta.status, 'active');

  return {
    ticks,
    leaseChecks,
    appliedMonsterActions: fixture.appliedMonsterActions.length,
    runtimeStatus: fixture.instance.meta.runtimeStatus,
    fenceReasons: fixture.fenceReasons,
  };
}

async function advanceFixture(
  fixture: ReturnType<typeof createFixture>,
  overrides: {
    isWritable?: (instance: any) => boolean;
  } = {},
): Promise<number> {
  const service = new WorldRuntimeInstanceTickOrchestrationService();
  return service.advanceFrame(
    createTickDeps(fixture, overrides),
    1000,
    () => 1,
  );
}

function createFixture(input: {
  assignedNodeId: string;
  leaseToken: string;
  leaseExpireAt: string;
  runtimeStatus: string;
  playerIds: string[];
}) {
  const appliedMonsterActions: unknown[] = [];
  const fenceReasons: string[] = [];
  const deletedInstances: string[] = [];
  const players = new Map(
    input.playerIds.map((playerId, index) => [
      playerId,
      {
        playerId,
        instanceId: INSTANCE_ID,
        x: 10 + index,
        y: 10,
        worldTime: null,
      },
    ]),
  );
  const monsterAction = {
    kind: 'basic_attack',
    runtimeId: 'monster:lease-smoke',
    targetPlayerId: input.playerIds[0] ?? 'player:lease-target',
    instanceId: INSTANCE_ID,
  };
  const instance = {
    meta: {
      instanceId: INSTANCE_ID,
      assignedNodeId: input.assignedNodeId,
      leaseToken: input.leaseToken,
      leaseExpireAt: input.leaseExpireAt,
      runtimeStatus: input.runtimeStatus,
      status: 'active',
    },
    template: { id: 'monster-combat-lease-smoke', source: {} },
    tick: 0,
    tickOnce() {
      this.tick += 1;
      return {
        completedBuildings: [],
        transfers: [],
        monsterActions: [monsterAction],
      };
    },
    listPlayerIds() {
      return input.playerIds;
    },
    advanceTileResourceFlow() {},
    advanceTemporaryTiles() {},
    advanceTileRecovery() {},
  };
  const runtime = {
    instanceCatalogService: { isEnabled: () => true },
    nodeRegistryService: { getNodeId: () => LOCAL_NODE_ID },
    getInstanceRuntime: (instanceId: string) => (instanceId === INSTANCE_ID ? instance : null),
    worldRuntimeInstanceStateService: {
      deleteInstanceRuntime(instanceId: string) {
        deletedInstances.push(instanceId);
      },
    },
    worldRuntimeTickProgressService: {
      clearInstance() {},
    },
    worldRuntimeLootContainerService: {
      removeInstanceState() {},
    },
    logger: {
      warn() {},
      error() {},
    },
  };
  return {
    instance,
    runtime,
    players,
    appliedMonsterActions,
    fenceReasons,
    deletedInstances,
  };
}

function createTickDeps(
  fixture: ReturnType<typeof createFixture>,
  overrides: {
    isWritable?: (instance: any) => boolean;
  },
) {
  return {
    tick: 0,
    listInstanceRuntimes: () => [fixture.instance],
    isInstanceLeaseWritable: (instance: any) => (
      overrides.isWritable
        ? overrides.isWritable(instance)
        : isInstanceLeaseWritable(fixture.runtime, instance)
    ),
    fenceInstanceRuntime(instanceId: string, reason: string) {
      fixture.fenceReasons.push(reason);
      fenceInstanceRuntime(fixture.runtime, instanceId, reason);
    },
    worldRuntimeCombatEffectsService: { resetFrameEffects() {} },
    worldRuntimeTickProgressService: {
      progress: 0,
      getProgress() { return this.progress; },
      setProgress(value: number) { this.progress = value; },
    },
    worldRuntimeMetricsService: {
      recordIdleFrame() {},
      recordFrameResult() {},
    },
    processPendingRespawns() {},
    materializeNavigationCommands() {},
    materializeAutoUsePills() {},
    materializeAutoCombatCommands() {},
    async dispatchPendingCommands() {},
    dispatchPendingSystemCommands() {},
    worldRuntimeNavigationService: { getBlockedPlayerIds: () => new Set<string>() },
    worldRuntimeFormationService: {
      createTerrainStabilizationChecker: () => () => false,
      advanceInstanceFormations() {},
      isTerrainStabilized: () => false,
    },
    worldRuntimeSectService: { isSectInnateStabilized: () => false },
    applyTransfer() {},
    applyMonsterAction(action: unknown) {
      fixture.appliedMonsterActions.push(action);
    },
    playerRuntimeService: {
      getPlayer: (playerId: string) => fixture.players.get(playerId) ?? null,
      playerAttributesService: { recalculate() {} },
      advanceTickForPlayerIds(ids: string[]) {
        for (const playerId of ids) {
          const player = fixture.players.get(playerId);
          if (player) {
            (player as any).lastTickAdvanced = fixture.instance.tick;
          }
        }
      },
    },
    worldRuntimePlayerSkillDispatchService: {
      async resolvePendingPlayerSkillCast() {},
    },
    worldRuntimeCraftTickService: {
      async advanceCraftJobs() {},
    },
    worldRuntimeTongtianTowerService: {
      advanceInstance() {},
      async cleanupIdleInstances() {},
    },
    worldRuntimeLootContainerService: {
      advanceContainerSearches() {},
    },
    getInstanceRuntime: (instanceId: string) => (instanceId === INSTANCE_ID ? fixture.instance : null),
    listConnectedPlayerIds: () => Array.from(fixture.players.keys()),
    getPlayerLocation: (playerId: string) => {
      const player = fixture.players.get(playerId);
      return player
        ? { instanceId: INSTANCE_ID, x: player.x, y: player.y }
        : null;
    },
    refreshQuestStates() {},
  };
}

function futureIso(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function pastIso(ms: number): string {
  return new Date(Date.now() - ms).toISOString();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
