/**
 * 宗门运行态严格烟测：待确认事务必须先收敛，审批时动态宗门归属必须纳入稳定锁集合。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { SectDurableCommitOutcomeUnknownError } from '../persistence/sect-durable-persistence';
import { WorldRuntimeFormationService } from '../runtime/world/world-runtime-formation.service';
import { WorldRuntimeSectService } from '../runtime/world/world-runtime-sect.service';

interface SectRuntimeHarness {
  sectsById: Map<string, any>;
  deletedSectSnapshotsById: Map<string, any>;
  sectMutationQueueBySectId: Map<string, Promise<void>>;
  commitDurableSectMutation(input: unknown): Promise<boolean>;
  commitDurableSectMutationLocked(input: unknown): Promise<boolean>;
  commitDurableSectMembershipMutation(
    beforeSectSnapshots: unknown[],
    membershipByPlayerId: Map<string, string | null>,
    formationWrites?: unknown[],
  ): Promise<boolean>;
  runExclusiveSectPlayerMutation(
    sectIds: unknown[],
    playerIds: unknown[],
    action: () => Promise<unknown>,
  ): Promise<unknown>;
  runExclusiveStableSectMembershipMutation(
    sectIds: unknown[],
    playerIds: unknown[],
    membershipPlayerId: unknown,
    action: () => Promise<unknown>,
  ): Promise<unknown>;
  resolvePlayerSectId(playerId: unknown): string | null;
  approveSectApplication(
    sect: { sectId: string },
    targetPlayerId: string,
    operatorPlayerId: string,
    deps: Record<string, unknown>,
  ): Promise<unknown>;
  leaveSect(sect: { sectId: string }, playerId: string, deps: Record<string, unknown>): Promise<unknown>;
  removeSectMember(
    sect: { sectId: string },
    targetPlayerId: string,
    operatorPlayerId: string,
    deps: Record<string, unknown>,
  ): Promise<unknown>;
  dissolveSect(sect: { sectId: string }, operatorPlayerId: string, deps: Record<string, unknown>): Promise<unknown>;
  transferSectLeadership(
    sect: { sectId: string },
    targetPlayerId: string,
    operatorPlayerId: string,
    deps: Record<string, unknown>,
  ): Promise<unknown>;
  runExclusiveSectCurrentMembersMutation(
    sectId: unknown,
    playerIds: unknown[],
    action: (sect: unknown, memberIds: unknown[]) => Promise<unknown>,
  ): Promise<unknown>;
  saveSectDocument(): Promise<void>;
  saveSectDocumentLocked(sectIds: string[]): Promise<void>;
  flushAllNow(): Promise<void>;
  beginShutdown(): void;
  persistenceClosing: boolean;
  unresolvedDurableCommitOutcome: boolean;
  expandSectBounds(sect: any, dirs: Record<string, number>, deps: Record<string, any>): boolean;
  refreshSectTemplateForBounds(sect: any, deps: Record<string, any>): void;
  persistSectsSoon(): void;
}

function createHarness(
  playerRuntime: Record<string, unknown> = {},
  durableOperationService: Record<string, unknown> | null = null,
  formationService: any = null,
): SectRuntimeHarness {
  return new WorldRuntimeSectService(
    {},
    {},
    playerRuntime,
    null,
    null,
    durableOperationService,
    formationService,
  ) as unknown as SectRuntimeHarness;
}

async function proveDurableMutationCannotBeOvertaken(): Promise<void> {
  const harness = createHarness();
  const first = { id: 'first' };
  const second = { id: 'second' };
  const order: string[] = [];
  let releaseFirst!: () => void;
  const firstGate = new Promise<void>((resolve) => {
    releaseFirst = resolve;
  });
  harness.commitDurableSectMutationLocked = async (input) => {
    order.push((input as { id: string }).id);
    if (input === first) {
      await firstGate;
    }
    return true;
  };

  const firstPromise = harness.commitDurableSectMutation(first);
  await Promise.resolve();
  const secondPromise = harness.commitDurableSectMutation(second);
  await Promise.resolve();
  assert.deepEqual(order, ['first']);
  releaseFirst();
  assert.deepEqual(await Promise.all([firstPromise, secondPromise]), [true, true]);
  assert.deepEqual(order, ['first', 'second']);
}

async function proveMembershipLockRetriesWithLatestSect(): Promise<void> {
  const harness = createHarness();
  const lockSets: string[][] = [];
  const membershipStates = ['sect:old', 'sect:new', 'sect:new'];
  let membershipReadIndex = 0;
  let actionCount = 0;
  harness.resolvePlayerSectId = () => membershipStates[membershipReadIndex++] ?? 'sect:new';
  harness.runExclusiveSectPlayerMutation = async (sectIds, playerIds, action) => {
    lockSets.push(sectIds.map(String));
    assert.deepEqual(playerIds, ['leader', 'applicant']);
    return action();
  };

  const result = await harness.runExclusiveStableSectMembershipMutation(
    ['sect:target'],
    ['leader', 'applicant'],
    'applicant',
    async () => {
      actionCount += 1;
      return 'approved';
    },
  );

  assert.equal(result, 'approved');
  assert.equal(actionCount, 1);
  assert.deepEqual(lockSets, [
    ['sect:target', 'sect:old'],
    ['sect:target', 'sect:new'],
  ]);
}

async function proveApprovalUsesStableMembershipLock(): Promise<void> {
  const harness = createHarness();
  let capturedSectIds: unknown[] = [];
  let capturedPlayerIds: unknown[] = [];
  let capturedMembershipPlayerId: unknown = null;
  harness.runExclusiveStableSectMembershipMutation = async (
    sectIds,
    playerIds,
    membershipPlayerId,
    _action,
  ) => {
    capturedSectIds = sectIds;
    capturedPlayerIds = playerIds;
    capturedMembershipPlayerId = membershipPlayerId;
    return 'stable-lock-route';
  };

  const result = await harness.approveSectApplication(
    { sectId: 'sect:target' },
    'applicant',
    'leader',
    {},
  );

  assert.equal(result, 'stable-lock-route');
  assert.deepEqual(capturedSectIds, ['sect:target']);
  assert.deepEqual(capturedPlayerIds, ['leader', 'applicant']);
  assert.equal(capturedMembershipPlayerId, 'applicant');
}

async function proveMembershipRemovalRoutesUseStableLocks(): Promise<void> {
  const harness = createHarness();
  const routes: Array<{ sectIds: unknown[]; playerIds: unknown[]; membershipPlayerId: unknown }> = [];
  harness.runExclusiveStableSectMembershipMutation = async (
    sectIds,
    playerIds,
    membershipPlayerId,
    _action,
  ) => {
    routes.push({ sectIds, playerIds, membershipPlayerId });
    return 'stable-lock-route';
  };

  assert.equal(await harness.leaveSect({ sectId: 'sect:target' }, 'member', {}), 'stable-lock-route');
  assert.equal(
    await harness.removeSectMember({ sectId: 'sect:target' }, 'member', 'leader', {}),
    'stable-lock-route',
  );
  assert.deepEqual(routes, [
    { sectIds: ['sect:target'], playerIds: ['member'], membershipPlayerId: 'member' },
    { sectIds: ['sect:target'], playerIds: ['leader', 'member'], membershipPlayerId: 'member' },
  ]);
}

async function proveDissolveLocksCurrentMembers(): Promise<void> {
  let lockedPlayerIds: string[] = [];
  const harness = createHarness({
    async runExclusiveAssetMutation(playerIds: string[], action: () => Promise<unknown>) {
      lockedPlayerIds = [...playerIds].sort();
      return action();
    },
  });
  harness.sectsById.set('sect:target', {
    sectId: 'sect:target',
    members: [
      { playerId: 'leader' },
      { playerId: 'member:b' },
      { playerId: 'member:a' },
    ],
  });
  const result = await harness.runExclusiveSectCurrentMembersMutation(
    'sect:target',
    ['leader'],
    async (_sect, memberIds) => memberIds,
  );
  assert.deepEqual(result, ['leader', 'member:b', 'member:a']);
  assert.deepEqual(lockedPlayerIds, ['leader', 'member:a', 'member:b']);
}

async function proveSaveWaitsForActiveSectMutation(): Promise<void> {
  const harness = createHarness();
  harness.sectsById.set('sect:target', { sectId: 'sect:target' });
  const order: string[] = [];
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  harness.saveSectDocumentLocked = async (sectIds) => {
    order.push(`save:${sectIds.join(',')}`);
  };
  const mutation = harness.runExclusiveSectPlayerMutation(['sect:target'], [], async () => {
    order.push('mutation:start');
    await mutationGate;
    order.push('mutation:end');
  });
  await waitUntil(() => order.includes('mutation:start'));
  const save = harness.saveSectDocument();
  await Promise.resolve();
  assert.deepEqual(order, ['mutation:start']);
  releaseMutation();
  await Promise.all([mutation, save]);
  assert.deepEqual(order, ['mutation:start', 'mutation:end', 'save:sect:target']);
}

async function proveTickExpansionQueuesBehindManagementMutation(): Promise<void> {
  const harness = createHarness();
  const sect = {
    sectId: 'sect:target',
    mapMinX: -1,
    mapMaxX: 1,
    mapMinY: -1,
    mapMaxY: 1,
    expansionRadius: 1,
    updatedAt: 1,
    sectInstanceId: 'sect:instance',
    entranceInstanceId: 'world:instance',
  };
  harness.sectsById.set(sect.sectId, sect);
  harness.refreshSectTemplateForBounds = () => undefined;
  harness.persistSectsSoon = () => undefined;
  let releaseMutation!: () => void;
  const mutationGate = new Promise<void>((resolve) => {
    releaseMutation = resolve;
  });
  const mutation = harness.runExclusiveSectPlayerMutation([sect.sectId], [], () => mutationGate);
  await waitUntil(() => harness.sectMutationQueueBySectId.has(sect.sectId));

  assert.equal(harness.expandSectBounds(sect, { left: 1 }, { getInstanceRuntime: () => null }), true);
  assert.equal(sect.mapMinX, -1);
  releaseMutation();
  await mutation;
  await waitUntil(() => !harness.sectMutationQueueBySectId.has(sect.sectId));
  assert.equal(sect.mapMinX, -2);
}

async function proveFinalFlushAllowedDuringShutdownButUnknownIsRejected(): Promise<void> {
  const harness = createHarness();
  harness.sectsById.set('sect:target', { sectId: 'sect:target' });
  let saveCount = 0;
  harness.saveSectDocumentLocked = async () => {
    saveCount += 1;
  };

  harness.beginShutdown();
  await harness.saveSectDocument();
  assert.equal(saveCount, 0, '关停后普通后台 save 不应继续落库');
  await harness.flushAllNow();
  assert.equal(saveCount, 1, '无 unknown 时 final flush 必须仍可执行');

  harness.unresolvedDurableCommitOutcome = true;
  await assert.rejects(harness.flushAllNow(), /sect_persistence_blocked_by_unresolved_commit/);
  assert.equal(saveCount, 1);
}

async function proveUnknownRegistersExactSharedFenceBeforeRelease(): Promise<void> {
  const registered: Array<{ affectedPlayerIds?: readonly string[]; affectedInstanceIds?: readonly string[] }> = [];
  const durableOperationService = {
    registerUnresolvedCommitOutcome(input: { affectedPlayerIds?: readonly string[]; affectedInstanceIds?: readonly string[] }) {
      registered.push(input);
    },
  };
  const formationOrder: string[] = [];
  const formationService = {
    async runExclusiveFormationPersistence(_ids: string[], action: () => Promise<unknown>) {
      formationOrder.push('formation:locked');
      try {
        return await action();
      } finally {
        formationOrder.push(`formation:released:registered=${registered.length}`);
      }
    },
  };
  const harness = createHarness({}, durableOperationService, formationService) as SectRuntimeHarness & {
    ensurePersistencePool(): Promise<unknown>;
  };
  let connectCount = 0;
  const pool = {
    async connect() {
      connectCount += 1;
      if (connectCount === 1) {
        return {
          async query(sql: string) {
            const normalized = sql.replace(/\s+/g, ' ').trim();
            if (normalized.startsWith('SELECT updated_at_ms FROM server_sect')) {
              return queryResult([{ updated_at_ms: 10 }]);
            }
            if (normalized === 'COMMIT') {
              throw new Error('commit_ack_lost');
            }
            return queryResult([]);
          },
          release() {},
        };
      }
      return {
        query: () => new Promise(() => undefined),
        release() {},
      };
    },
  };
  harness.ensurePersistencePool = async () => pool;
  const pending = harness.commitDurableSectMutation({
    sectWrites: [{
      sectId: 'sect:target',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
    membershipWrites: [{ playerId: 'player:offline', sectId: 'sect:target', updatedAtMs: 20 }],
    formationWrites: [{
      instanceId: 'world:new',
      formationInstanceId: 'formation:sect_guardian:sect:target',
      snapshot: createGuardianSnapshot(20),
    }],
    affectedInstanceIds: ['world:old'],
  });
  await waitUntil(() => connectCount >= 2);
  harness.beginShutdown();
  await assert.rejects(pending, SectDurableCommitOutcomeUnknownError);
  assert.deepEqual(registered, [{
    affectedPlayerIds: ['player:offline'],
    affectedInstanceIds: ['sect:target:main', 'world:new', 'world:old'],
  }]);
  assert.deepEqual(formationOrder, [
    'formation:locked',
    'formation:released:registered=1',
  ]);
}

async function proveFormationWritersRespectSharedInstanceFence(): Promise<void> {
  const blockedInstanceIds = new Set(['world:blocked']);
  const service = new WorldRuntimeFormationService({}, {}, null, {
    isInstanceCommitOutcomeUnresolved(instanceId: string) {
      return blockedInstanceIds.has(instanceId);
    },
  }) as unknown as {
    saveFormationSnapshot(formation: Record<string, unknown>): Promise<void>;
    deleteFormationSnapshot(formation: Record<string, unknown>): Promise<void>;
    saveInstanceFormations(instanceId: string): Promise<void>;
    markFormationInstanceDirty(instanceId: string): void;
    markFormationRemovalDirty(formation: Record<string, unknown>): void;
    dirtyFormationInstanceIds: Set<string>;
    removedFormationKeysByInstanceId: Map<string, Map<string, number>>;
    ensurePersistencePool(): Promise<never>;
  };
  service.ensurePersistencePool = async () => {
    throw new Error('blocked formation writer reached database');
  };
  const formation = createGuardianSnapshot(20);
  service.markFormationInstanceDirty('world:blocked');
  service.markFormationRemovalDirty(formation);
  await service.saveFormationSnapshot(formation);
  await service.deleteFormationSnapshot(formation);
  await service.saveInstanceFormations('world:blocked');
  assert.equal(service.dirtyFormationInstanceIds.has('world:blocked'), true);
  assert.equal(service.removedFormationKeysByInstanceId.has('world:blocked'), true);
}

async function proveLeadershipTransferCommitsGuardianAndRollbackOnlyTouchesMemory(): Promise<void> {
  const players = new Map([
    ['leader', { id: 'leader', name: '旧宗主', sectId: 'sect:target' }],
    ['target', { id: 'target', name: '新宗主', sectId: 'sect:target' }],
  ]);
  const playerRuntime = {
    getPlayer(playerId: string) {
      return players.get(playerId) ?? null;
    },
    async runExclusiveAssetMutation(_playerIds: string[], action: () => Promise<unknown>) {
      return action();
    },
  };
  const guardian = createGuardianSnapshot(20);
  const persistenceOptions: Array<{ deferPersistence?: boolean }> = [];
  const formationService = {
    findFormationInInstance() {
      return guardian;
    },
    upsertSectGuardianFormation(input: Record<string, unknown>, _deps: unknown, options: { deferPersistence?: boolean }) {
      persistenceOptions.push(options);
      Object.assign(guardian, input, { updatedAt: Number(guardian.updatedAt) + 1 });
      return guardian;
    },
    serializeFormationForDurableMutation(formation: Record<string, unknown>) {
      return { ...formation };
    },
  };
  const harness = createHarness(playerRuntime, null, formationService);
  const sect: any = {
    ...createSectSnapshot(10),
    members: [
      { playerId: 'leader', name: '旧宗主', roleId: 'leader', joinedAt: 1 },
      { playerId: 'target', name: '新宗主', roleId: 'deputy', joinedAt: 2 },
    ],
    rolePermissions: {},
  };
  harness.sectsById.set('sect:target', sect);
  let committedFormationWrites: unknown[] = [];
  harness.commitDurableSectMembershipMutation = async (_before, _membership, formationWrites = []) => {
    committedFormationWrites = formationWrites;
    return true;
  };
  const deps = {
    worldRuntimeFormationService: formationService,
    queuePlayerNotice() {},
  };

  await harness.transferSectLeadership({ sectId: 'sect:target' }, 'target', 'leader', deps);
  assert.equal(sect.leaderPlayerId, 'target');
  assert.equal(committedFormationWrites.length, 1);
  assert.equal((committedFormationWrites[0] as any).snapshot.ownerPlayerId, 'target');
  assert.deepEqual(persistenceOptions, [{ deferPersistence: true }]);

  harness.commitDurableSectMembershipMutation = async () => {
    throw new Error('injected_transfer_failure');
  };
  await assert.rejects(
    harness.transferSectLeadership({ sectId: 'sect:target' }, 'leader', 'target', deps),
    /injected_transfer_failure/,
  );
  assert.equal(sect.leaderPlayerId, 'target');
  assert.equal(persistenceOptions.at(-1)?.deferPersistence, true);
  assert.ok(persistenceOptions.every((options) => options.deferPersistence === true));
}

async function proveSectInstallsFormationTicketBeforeAsyncCommit(): Promise<void> {
  const formationService = new WorldRuntimeFormationService({}, {});
  const harness = createHarness({}, null, formationService);
  const order: string[] = [];
  let releaseCommit!: () => void;
  const commitGate = new Promise<void>((resolve) => {
    releaseCommit = resolve;
  });
  harness.commitDurableSectMutationLocked = async () => {
    order.push('sect:commit');
    await commitGate;
    return true;
  };
  const formationId = 'formation:sect_guardian:sect:target';
  const sectCommit = harness.commitDurableSectMutation({
    formationWrites: [{ formationInstanceId: formationId }],
  });
  const writer = formationService.runExclusiveFormationPersistence([formationId], async () => {
    order.push('formation:writer');
  });
  await waitUntil(() => order.includes('sect:commit'));
  assert.deepEqual(order, ['sect:commit']);
  releaseCommit();
  await Promise.all([sectCommit, writer]);
  assert.deepEqual(order, ['sect:commit', 'formation:writer']);
}

async function proveDelayedFormationWriterUsesImmutablePreAwaitSnapshot(): Promise<void> {
  const service = new WorldRuntimeFormationService({}, {}) as any;
  const formation = createGuardianSnapshot(20);
  formation.ownerPlayerId = 'leader:before';
  service.formationsByInstanceId.set('world:blocked', [formation]);
  let queryCount = 0;
  service.ensurePersistencePool = async () => ({
    async connect() {
      return {
        async query() {
          queryCount += 1;
          return queryResult([]);
        },
        release() {},
      };
    },
  });
  let releaseBlocker!: () => void;
  const blockerGate = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  const formationId = String(formation.id);
  const blocker = service.runExclusiveFormationPersistence([formationId], () => blockerGate);
  await Promise.resolve();
  const delayedWriter = service.saveFormationSnapshot(formation);
  formation.ownerPlayerId = 'leader:uncommitted';
  formation.updatedAt = 21;
  releaseBlocker();
  await Promise.all([blocker, delayedWriter]);
  assert.equal(queryCount, 0, '延迟 writer 不得跨 await 读取后来出现的宗门未提交后态');
}

async function proveFormationRuntimeWritesDoNotRepeatDdlOrCloseFlush(): Promise<void> {
  const source = readFileSync(
    'packages/server/src/runtime/world/world-runtime-formation.service.ts',
    'utf8',
  );
  assert.equal(
    (source.match(/await ensureInstanceFormationStateTable\(/g) ?? []).length,
    1,
    '阵法表 DDL 只能在初始化边界执行一次',
  );

  const service = new WorldRuntimeFormationService({}, {}) as any;
  let saveCount = 0;
  service.persistenceReady = true;
  service.persistencePool = {};
  service.formationsByInstanceId.set('world:close', [createGuardianSnapshot(20)]);
  service.saveInstanceFormations = async () => {
    saveCount += 1;
  };
  await service.closePersistencePool();
  assert.equal(saveCount, 0, 'closePersistencePool 不得在协调器 final flush 后再次写盘');
  assert.equal(service.persistencePool, null);
  assert.equal(service.persistenceReady, false);
}

function createSectSnapshot(updatedAt: number): Record<string, unknown> {
  return {
    sectId: 'sect:target',
    name: '烟测宗',
    mark: '烟',
    founderPlayerId: 'leader',
    leaderPlayerId: 'leader',
    status: 'active',
    entranceInstanceId: 'world:new',
    entranceTemplateId: 'world',
    entranceX: 1,
    entranceY: 2,
    sectInstanceId: 'sect:target:main',
    sectTemplateId: 'sect_domain:target',
    createdAt: 1,
    updatedAt,
  };
}

function createGuardianSnapshot(updatedAt: number): Record<string, unknown> {
  return {
    id: 'formation:sect_guardian:sect:target',
    instanceId: 'world:blocked',
    ownerPlayerId: 'leader',
    ownerSectId: 'sect:target',
    formationId: 'sect_guardian_barrier',
    lifecycle: 'persistent',
    diskItemId: '',
    diskTier: 'mortal',
    diskMultiplier: 1,
    spiritStoneCount: 1,
    qiCost: 0,
    x: 1,
    y: 2,
    eyeInstanceId: 'sect:target:main',
    eyeX: 0,
    eyeY: 0,
    allocation: {},
    active: true,
    remainingAuraBudget: 10,
    remainingQiBudget: 10,
    remainingSpiritStoneBudget: 1,
    createdAt: 1,
    updatedAt,
  };
}

function queryResult(rows: Array<Record<string, unknown>>) {
  return { rows, rowCount: rows.length, command: '', oid: 0, fields: [] };
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error('sect_runtime_reconciliation_wait_timeout');
}

async function main(): Promise<void> {
  await proveDurableMutationCannotBeOvertaken();
  await proveMembershipLockRetriesWithLatestSect();
  await proveApprovalUsesStableMembershipLock();
  await proveMembershipRemovalRoutesUseStableLocks();
  await proveDissolveLocksCurrentMembers();
  await proveSaveWaitsForActiveSectMutation();
  await proveTickExpansionQueuesBehindManagementMutation();
  await proveFinalFlushAllowedDuringShutdownButUnknownIsRejected();
  await proveUnknownRegistersExactSharedFenceBeforeRelease();
  await proveFormationWritersRespectSharedInstanceFence();
  await proveLeadershipTransferCommitsGuardianAndRollbackOnlyTouchesMemory();
  await proveSectInstallsFormationTicketBeforeAsyncCommit();
  await proveDelayedFormationWriterUsesImmutablePreAwaitSnapshot();
  await proveFormationRuntimeWritesDoNotRepeatDdlOrCloseFlush();
  console.log('sect-runtime-durable-reconciliation-smoke: ok');
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
