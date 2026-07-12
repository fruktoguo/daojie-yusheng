import assert from 'node:assert/strict';
import type { Pool, PoolClient, QueryResult } from 'pg';

import {
  persistDurableSectMutation,
  persistDurableSectMutationUntilSettled,
  repairPersistedSectCoreState,
  SectDurableCommitOutcomeUnknownError,
  SectDurableMutationStoppedError,
  type DurableSectSnapshot,
} from '../persistence/sect-durable-persistence';
import type { PersistedPlayerSnapshot } from '../persistence/player-persistence.service';

interface RecordedQuery {
  sql: string;
  params: unknown[];
}

class RecordingClient {
  readonly queries: RecordedQuery[] = [];
  released = false;
  destroyed = false;

  constructor(
    private readonly options: {
      failOn?: string;
      failError?: Error;
      persistedSectUpdatedAt?: number;
      sectExists?: boolean;
      presenceExists?: boolean;
      watermarkVersion?: number;
      membershipSectId?: string | null;
      failRollback?: boolean;
    } = {},
  ) {}

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<QueryResult<T>> {
    const normalizedSql = sql.replace(/\s+/g, ' ').trim();
    this.queries.push({ sql: normalizedSql, params });
    if (this.options.failOn && normalizedSql.includes(this.options.failOn)) {
      throw this.options.failError ?? new Error('injected_sect_persistence_failure');
    }
    if (this.options.failRollback && normalizedSql === 'ROLLBACK') {
      throw new Error('injected_sect_rollback_failure');
    }
    if (normalizedSql.startsWith('SELECT updated_at_ms FROM server_sect')) {
      if (this.options.sectExists === false) {
        return result([]);
      }
      const updatedAt = this.options.persistedSectUpdatedAt ?? 10;
      return result([{ updated_at_ms: updatedAt } as unknown as T]);
    }
    if (normalizedSql.includes('FROM player_presence')) {
      if (this.options.presenceExists === false) {
        return result([]);
      }
      return result([{
        runtime_owner_id: 'node:smoke',
        session_epoch: 7,
      } as unknown as T]);
    }
    if (normalizedSql.includes('FROM player_inventory_item') && normalizedSql.includes('FOR UPDATE')) {
      return result([]);
    }
    if (normalizedSql.includes('FROM player_recovery_watermark')) {
      const version = this.options.watermarkVersion;
      return version === undefined
        ? result([])
        : result([{
          inventory_version: version,
          sect_membership_version: version,
        } as unknown as T]);
    }
    if (normalizedSql.startsWith('SELECT sect_id FROM player_sect_membership')) {
      return result([{ sect_id: this.options.membershipSectId ?? null } as unknown as T]);
    }
    if (normalizedSql.includes('INSERT INTO player_inventory_item')) {
      return result([], decodeArrayLength(params[1]));
    }
    return result([]);
  }

  release(destroy?: boolean): void {
    this.released = true;
    this.destroyed = destroy === true;
  }
}

class RecordingPool {
  constructor(readonly client: RecordingClient) {}

  async connect(): Promise<PoolClient> {
    return this.client as unknown as PoolClient;
  }
}

class SequencedPool {
  connectCount = 0;

  constructor(readonly clients: RecordingClient[]) {}

  async connect(): Promise<PoolClient> {
    const client = this.clients[this.connectCount];
    this.connectCount += 1;
    assert.ok(client, `缺少第 ${this.connectCount} 个数据库客户端夹具`);
    return client as unknown as PoolClient;
  }
}

async function main(): Promise<void> {
  await proveCoreRepairPreservesRollbackFailure();
  await proveSectInventoryAndMembershipShareOneTransaction();
  await proveFailureRollsBackWholeMutation();
  await proveRollbackFailureDestroysClient();
  await proveStaleSectRevisionIsRejected();
  await proveSectCreationRequiresAbsentRow();
  await proveSectRevisionMustAdvance();
  await proveCommitAcknowledgementLossIsNotRolledBack();
  await proveCommitAcknowledgementLossSettlesByReadback();
  await proveUnappliedCommitRetriesInsideCurrentMutation();
  await proveTransientRetryFailureKeepsReconciling();
  await proveRetryCasConflictConfirmsCommittedPostState();
  await proveRetryPresenceFenceConfirmsCommittedPostState();
  await proveInitialShutdownIsNotUnknownCommit();
  await proveShutdownInterruptsPendingReadback();
  console.log('sect-durable-mutation-smoke: ok');
}

async function proveCoreRepairPreservesRollbackFailure(): Promise<void> {
  const primaryOnlyClient = new RecordingClient({ failOn: 'WITH patched AS' });
  await assert.rejects(
    repairPersistedSectCoreState(new RecordingPool(primaryOnlyClient) as unknown as Pool),
    /injected_sect_persistence_failure/,
  );
  assert.equal(primaryOnlyClient.queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(primaryOnlyClient.released, true);
  assert.equal(primaryOnlyClient.destroyed, false);

  const rollbackFailureClient = new RecordingClient({
    failOn: 'WITH patched AS',
    failRollback: true,
  });
  await assert.rejects(
    repairPersistedSectCoreState(new RecordingPool(rollbackFailureClient) as unknown as Pool),
    (error: unknown) => {
      assert.ok(error instanceof AggregateError);
      assert.deepEqual(
        error.errors.map((entry: unknown) => entry instanceof Error ? entry.message : String(entry)),
        ['injected_sect_persistence_failure', 'injected_sect_rollback_failure'],
      );
      return true;
    },
  );
  assert.equal(rollbackFailureClient.released, true);
  assert.equal(rollbackFailureClient.destroyed, true);
}

async function proveRetryPresenceFenceConfirmsCommittedPostState(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  const negativeReadbackClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const disconnectedRetryClient = new RecordingClient({
    persistedSectUpdatedAt: 10,
    presenceExists: false,
  });
  const committedReadbackClient = new RecordingClient({
    persistedSectUpdatedAt: 20,
    watermarkVersion: 20,
    membershipSectId: 'sect:smoke',
  });
  const pool = new SequencedPool([
    commitClient,
    negativeReadbackClient,
    disconnectedRetryClient,
    committedReadbackClient,
  ]);

  await persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
    playerProjectionWrites: [{
      playerId: 'player:smoke',
      snapshot: createPlayerSnapshot(20),
      domains: ['sect_membership'],
      expectedRuntimeOwnerId: 'node:smoke',
      expectedSessionEpoch: 7,
    }],
  }, { retryDelayMs: 10 });

  assert.equal(pool.connectCount, 4);
  assert.equal(disconnectedRetryClient.queries.at(-1)?.sql, 'ROLLBACK');
}

async function proveInitialShutdownIsNotUnknownCommit(): Promise<void> {
  const pool = new SequencedPool([]);
  await assert.rejects(
    persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(20),
      }],
    }, { shouldContinue: () => false }),
    SectDurableMutationStoppedError,
  );
  assert.equal(pool.connectCount, 0);
}

async function proveTransientRetryFailureKeepsReconciling(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  const readbackClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const lockTimeoutClient = new RecordingClient({
    failOn: 'pg_advisory_xact_lock',
    failError: Object.assign(new Error('canceling statement due to lock timeout'), { code: '55P03' }),
  });
  const statementTimeoutClient = new RecordingClient({
    failOn: 'SELECT updated_at_ms FROM server_sect',
    failError: Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }),
  });
  const retryClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const pool = new SequencedPool([
    commitClient,
    readbackClient,
    lockTimeoutClient,
    statementTimeoutClient,
    retryClient,
  ]);

  await persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
  }, { retryDelayMs: 10 });

  assert.equal(pool.connectCount, 5);
  assert.equal(retryClient.queries.at(-1)?.sql, 'COMMIT');
}

async function proveRetryCasConflictConfirmsCommittedPostState(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  const negativeReadbackClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const staleRetryClient = new RecordingClient({ persistedSectUpdatedAt: 20 });
  const committedReadbackClient = new RecordingClient({ persistedSectUpdatedAt: 20 });
  const pool = new SequencedPool([
    commitClient,
    negativeReadbackClient,
    staleRetryClient,
    committedReadbackClient,
  ]);

  await persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
  }, { retryDelayMs: 10 });

  assert.equal(pool.connectCount, 4);
  assert.equal(staleRetryClient.queries.at(-1)?.sql, 'ROLLBACK');
}

async function proveShutdownInterruptsPendingReadback(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  let connectCount = 0;
  let stop!: () => void;
  const stopSignal = new Promise<void>((resolve) => {
    stop = resolve;
  });
  const pool = {
    async connect() {
      connectCount += 1;
      if (connectCount === 1) {
        return commitClient as unknown as PoolClient;
      }
      return {
        query: () => new Promise(() => undefined),
        release: () => undefined,
      } as unknown as PoolClient;
    },
  };
  const pending = persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
  }, { stopSignal, retryDelayMs: 10 });
  while (connectCount < 2) {
    await Promise.resolve();
  }
  stop();
  await assert.rejects(pending, SectDurableCommitOutcomeUnknownError);
}

async function proveCommitAcknowledgementLossSettlesByReadback(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  const readbackClient = new RecordingClient({ persistedSectUpdatedAt: 20 });
  const pool = new SequencedPool([commitClient, readbackClient]);

  await persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
  }, { retryDelayMs: 10 });

  assert.equal(pool.connectCount, 2);
  assert.equal(commitClient.queries.at(-1)?.sql, 'COMMIT');
  assert.ok(readbackClient.queries.some((entry) => entry.sql.startsWith('SELECT updated_at_ms FROM server_sect')));
}

async function proveUnappliedCommitRetriesInsideCurrentMutation(): Promise<void> {
  const commitClient = new RecordingClient({ failOn: 'COMMIT' });
  const readbackClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const retryClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  const pool = new SequencedPool([commitClient, readbackClient, retryClient]);

  await persistDurableSectMutationUntilSettled(pool as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
  }, { retryDelayMs: 10 });

  assert.equal(pool.connectCount, 3);
  assert.equal(retryClient.queries.at(-1)?.sql, 'COMMIT');
}

async function proveCommitAcknowledgementLossIsNotRolledBack(): Promise<void> {
  const client = new RecordingClient({ failOn: 'COMMIT' });
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(20),
      }],
    }),
    SectDurableCommitOutcomeUnknownError,
  );
  assert.equal(client.queries.at(-1)?.sql, 'COMMIT');
  assert.equal(client.destroyed, true);
}

async function proveRollbackFailureDestroysClient(): Promise<void> {
  const client = new RecordingClient({
    failOn: 'INSERT INTO player_inventory_item',
    failRollback: true,
  });
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(20),
      }],
      playerProjectionWrites: [{
        playerId: 'player:smoke',
        snapshot: createPlayerSnapshot(20),
        domains: ['inventory'],
      }],
    }),
    /injected_sect_persistence_failure/,
  );
  assert.equal(client.destroyed, true);
}

async function proveSectCreationRequiresAbsentRow(): Promise<void> {
  const conflictingClient = new RecordingClient({ persistedSectUpdatedAt: 10 });
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(conflictingClient) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: null,
        snapshot: createSectSnapshot(20),
      }],
    }),
    /sect_mutation_already_exists:sect:smoke/,
  );
  assert.equal(conflictingClient.queries.at(-1)?.sql, 'ROLLBACK');

  const absentClient = new RecordingClient({ sectExists: false });
  await persistDurableSectMutation(new RecordingPool(absentClient) as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:new',
      expectedUpdatedAtMs: null,
      snapshot: { ...createSectSnapshot(20), sectId: 'sect:new' },
    }],
  });
  assert.equal(absentClient.queries.at(-1)?.sql, 'COMMIT');
}

async function proveSectInventoryAndMembershipShareOneTransaction(): Promise<void> {
  const client = new RecordingClient();
  await persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
    sectWrites: [{
      sectId: 'sect:smoke',
      expectedUpdatedAtMs: 10,
      snapshot: createSectSnapshot(20),
    }],
    playerProjectionWrites: [{
      playerId: 'player:smoke',
      snapshot: createPlayerSnapshot(20),
      domains: ['inventory', 'sect_membership'],
      options: { allowInventoryEmptyOverwrite: true },
      expectedRuntimeOwnerId: 'node:smoke',
      expectedSessionEpoch: 7,
    }],
    formationWrites: [{
      instanceId: 'real:smoke',
      formationInstanceId: 'formation:sect_guardian:sect:smoke',
      snapshot: createGuardianSnapshot(),
    }],
  });

  const statements = client.queries.map((entry) => entry.sql);
  assert.equal(statements[0], 'BEGIN');
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO server_sect')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO player_inventory_item')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO player_sect_membership')));
  assert.ok(statements.some((sql) => sql.includes('DELETE FROM instance_formation_state')));
  assert.ok(statements.some((sql) => sql.includes('INSERT INTO instance_formation_state')));
  assert.equal(statements.at(-1), 'COMMIT');
  assert.equal(client.released, true);
}

async function proveSectRevisionMustAdvance(): Promise<void> {
  const client = new RecordingClient();
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(10),
      }],
    }),
    /sect_mutation_revision_not_advanced:sect:smoke/,
  );
  assert.equal(client.queries.length, 0);
}

async function proveFailureRollsBackWholeMutation(): Promise<void> {
  const client = new RecordingClient({ failOn: 'INSERT INTO player_inventory_item' });
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(20),
      }],
      playerProjectionWrites: [{
        playerId: 'player:smoke',
        snapshot: createPlayerSnapshot(20),
        domains: ['inventory', 'sect_membership'],
        options: { allowInventoryEmptyOverwrite: true },
      }],
    }),
    /injected_sect_persistence_failure/,
  );
  assert.equal(client.queries.at(-1)?.sql, 'ROLLBACK');
  assert.equal(client.released, true);
}

async function proveStaleSectRevisionIsRejected(): Promise<void> {
  const client = new RecordingClient({ persistedSectUpdatedAt: 30 });
  await assert.rejects(
    persistDurableSectMutation(new RecordingPool(client) as unknown as Pool, {
      sectWrites: [{
        sectId: 'sect:smoke',
        expectedUpdatedAtMs: 10,
        snapshot: createSectSnapshot(20),
      }],
      membershipWrites: [{
        playerId: 'player:offline',
        sectId: 'sect:smoke',
        updatedAtMs: 20,
      }],
    }),
    /sect_mutation_stale_revision:sect:smoke/,
  );
  assert.equal(client.queries.at(-1)?.sql, 'ROLLBACK');
}

function createSectSnapshot(updatedAt: number): DurableSectSnapshot {
  return {
    sectId: 'sect:smoke',
    name: '烟测宗',
    mark: '烟',
    founderPlayerId: 'player:smoke',
    leaderPlayerId: 'player:smoke',
    status: 'active',
    entranceInstanceId: 'real:smoke',
    entranceTemplateId: 'smoke_world',
    entranceX: 1,
    entranceY: 2,
    sectInstanceId: 'sect:sect:smoke:main',
    sectTemplateId: 'sect_domain:sect:smoke',
    members: [{ playerId: 'player:smoke', roleId: 'leader' }],
    createdAt: 1,
    updatedAt,
  };
}

function createGuardianSnapshot(): Record<string, unknown> {
  return {
    id: 'formation:sect_guardian:sect:smoke',
    ownerPlayerId: 'player:smoke',
    ownerSectId: 'sect:smoke',
    formationId: 'sect_guardian_barrier',
    lifecycle: 'persistent',
    diskItemId: '',
    diskTier: 'mortal',
    diskMultiplier: 1,
    spiritStoneCount: 1000,
    qiCost: 0,
    x: 1,
    y: 2,
    eyeInstanceId: 'sect:sect:smoke:main',
    eyeX: 0,
    eyeY: 0,
    allocation: { radius: 1, durationHours: 24, effectValue: 1 },
    active: true,
    remainingAuraBudget: 100000,
    remainingQiBudget: 100000,
    remainingSpiritStoneBudget: 1000,
    createdAt: 1,
    updatedAt: 20,
  };
}

function createPlayerSnapshot(savedAt: number): PersistedPlayerSnapshot {
  return {
    version: 1,
    savedAt,
    placement: {
      templateId: 'smoke_world',
      instanceId: 'real:smoke',
      x: 1,
      y: 2,
      facing: 1,
    },
    sectId: 'sect:smoke',
    vitals: { hp: 1, maxHp: 1, qi: 1, maxQi: 1 },
    progression: {
      foundation: 0,
      combatExp: 0,
      bodyTraining: null,
      alchemySkill: null,
      gatherSkill: null,
      gatherJob: null,
      alchemyPresets: [],
      alchemyJob: null,
      enhancementSkill: null,
      enhancementSkillLevel: 1,
      enhancementJob: null,
      enhancementRecords: [],
      boneAgeBaseYears: 18,
      lifeElapsedTicks: 0,
      lifespanYears: null,
      realm: null,
      heavenGate: null,
      spiritualRoots: null,
    },
    unlockedMapIds: ['smoke_world'],
    inventory: {
      revision: 2,
      capacity: 24,
      items: [{ itemInstanceId: '00000000-0000-4000-8000-000000000001', itemId: 'spirit_stone', count: 3 }],
      lockedItems: [],
    },
    equipment: { revision: 1, slots: [] },
    artifacts: { revision: 1, slots: [] },
    techniques: { revision: 1, techniques: [], cultivatingTechId: null },
    buffs: { revision: 1, buffs: [] },
    quests: { revision: 1, entries: [] },
    combat: {
      autoBattle: false,
      autoRetaliate: true,
      autoBattleStationary: false,
      combatTargetId: null,
      combatTargetLocked: false,
      allowAoePlayerHit: false,
      autoIdleCultivation: false,
      autoSwitchCultivation: false,
      senseQiActive: false,
      autoUsePills: [],
      autoBattleSkills: [],
    },
    pendingLogbookMessages: [],
    runtimeBonuses: [],
  };
}

function result<T extends Record<string, unknown>>(
  rows: T[],
  rowCount = rows.length,
): QueryResult<T> {
  return {
    command: '',
    rowCount,
    oid: 0,
    fields: [],
    rows,
  };
}

function decodeArrayLength(value: unknown): number {
  if (typeof value !== 'string') {
    return 0;
  }
  const decoded = JSON.parse(value) as unknown;
  return Array.isArray(decoded) ? decoded.length : 0;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
