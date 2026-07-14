import assert from 'node:assert/strict';

import { NativeGmWorldService } from '../http/native/native-gm-world.service';
import { InstanceCatalogService } from '../persistence/instance-catalog.service';
import { claimRecoverableCatalogInstances } from '../runtime/world/world-runtime-instance-lease.helpers';
import { WorldRuntimeLifecycleService } from '../runtime/world/world-runtime-lifecycle.service';
import { installSmokeTimeout } from './smoke-timeout';

installSmokeTimeout(__filename);

interface CatalogRow {
  instance_id: string;
  template_id: string;
  instance_type: string;
  persistent_policy: string;
  status: string;
  runtime_status: string;
  ownership_epoch: number;
  assigned_node_id: string | null;
  lease_token: string | null;
  lease_expire_at: string | null;
  destroy_at: string | null;
  route_domain: string | null;
}

interface QueryResult<Row extends Record<string, unknown> = Record<string, unknown>> {
  rowCount: number;
  rows: Row[];
}

interface AdvisoryLockState {
  locked: boolean;
  waiters: Array<() => void>;
}

class FakeCatalogDatabase {
  readonly rows = new Map<string, CatalogRow>();
  private readonly advisoryLocks = new Map<string, AdvisoryLockState>();

  constructor(initialRows: CatalogRow[]) {
    for (const row of initialRows) {
      this.rows.set(row.instance_id, { ...row });
    }
  }

  readonly pool = {
    connect: async () => new FakeCatalogClient(this),
    query: async (sql: string, params: unknown[] = []): Promise<QueryResult> => {
      const normalizedSql = normalizeSql(sql);
      if (normalizedSql.startsWith('UPDATE instance_catalog SET assigned_node_id = $2')) {
        const instanceId = String(params[0] ?? '');
        const row = this.rows.get(instanceId);
        const expectedEpoch = Number(params[4]);
        const expectedTemplateId = params[5] === null ? null : String(params[5] ?? '');
        const expectedInstanceType = params[6] === null ? null : String(params[6] ?? '');
        const expectedReservationToken = params[7] === null ? null : String(params[7] ?? '');
        const leaseExpireAt = row?.lease_expire_at ? new Date(row.lease_expire_at).getTime() : 0;
        const reservationMatches = expectedReservationToken !== null
          && row?.runtime_status === 'creating'
          && row?.assigned_node_id === null
          && row?.lease_token === expectedReservationToken
          && Number.isFinite(leaseExpireAt)
          && leaseExpireAt > Date.now();
        const ordinaryClaimable = expectedReservationToken === null
          && row?.runtime_status !== 'creating'
          && (!row?.assigned_node_id
            || !row?.lease_token
            || !Number.isFinite(leaseExpireAt)
            || leaseExpireAt < Date.now());
        if (!row
          || row.status === 'destroyed'
          || row.runtime_status === 'stopped'
          || row.ownership_epoch !== expectedEpoch
          || (expectedTemplateId !== null && row.template_id !== expectedTemplateId)
          || (expectedInstanceType !== null && row.instance_type !== expectedInstanceType)
          || (!reservationMatches && !ordinaryClaimable)) {
          return { rowCount: 0, rows: [] };
        }
        row.assigned_node_id = String(params[1] ?? '');
        row.lease_token = String(params[2] ?? '');
        row.lease_expire_at = params[3] instanceof Date ? params[3].toISOString() : String(params[3] ?? '');
        row.ownership_epoch += 1;
        row.runtime_status = 'leased';
        row.status = 'active';
        return { rowCount: 1, rows: [{ ownership_epoch: row.ownership_epoch }] };
      }
      if (normalizedSql.startsWith('UPDATE instance_catalog')
        && normalizedSql.includes("runtime_status = 'cleanup_pending'")) {
        const instanceId = String(params[0] ?? '');
        const row = this.rows.get(instanceId);
        if (!row
          || row.status !== 'active'
          || row.assigned_node_id !== String(params[1] ?? '')
          || row.lease_token !== String(params[2] ?? '')
          || row.ownership_epoch !== Number(params[3])) {
          return { rowCount: 0, rows: [] };
        }
        row.runtime_status = 'cleanup_pending';
        row.destroy_at = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }
      if (normalizedSql.startsWith('UPDATE instance_catalog') && normalizedSql.includes("runtime_status = 'creating'")) {
        if (normalizedSql.includes("lease_token LIKE 'reservation:%'")) {
          let cleaned = 0;
          for (const row of this.rows.values()) {
            const leaseExpireAt = row.lease_expire_at ? new Date(row.lease_expire_at).getTime() : 0;
            if (row.status === 'active'
              && row.runtime_status === 'creating'
              && row.assigned_node_id === null
              && row.lease_token?.startsWith('reservation:')
              && Number.isFinite(leaseExpireAt)
              && leaseExpireAt <= Date.now()
              && row.ownership_epoch === 0) {
              row.status = 'destroyed';
              row.runtime_status = 'stopped';
              row.lease_token = null;
              row.lease_expire_at = null;
              row.ownership_epoch += 1;
              row.destroy_at = row.destroy_at ?? new Date().toISOString();
              cleaned += 1;
            }
          }
          return {
            rowCount: cleaned,
            rows: Array.from(this.rows.values())
              .filter((row) => row.status === 'destroyed' && row.lease_token === null)
              .map((row) => ({ instance_id: row.instance_id })),
          };
        }
        const instanceId = String(params[0] ?? '');
        const reservationToken = String(params[1] ?? '');
        const row = this.rows.get(instanceId);
        if (normalizedSql.includes('SET last_active_at = now()')) {
          const leaseExpireAt = row?.lease_expire_at ? new Date(row.lease_expire_at).getTime() : 0;
          const matches = Boolean(row
            && row.template_id === String(params[2] ?? '')
            && row.instance_type === String(params[3] ?? '')
            && row.persistent_policy === String(params[4] ?? '')
            && row.status === 'active'
            && row.runtime_status === 'creating'
            && row.assigned_node_id === null
            && row.lease_token === reservationToken
            && Number.isFinite(leaseExpireAt)
            && leaseExpireAt > Date.now()
            && row.ownership_epoch === 0);
          return { rowCount: matches ? 1 : 0, rows: [] };
        }
        if (!row
          || row.status !== 'active'
          || row.runtime_status !== 'creating'
          || row.assigned_node_id !== null
          || row.lease_token !== reservationToken
          || row.ownership_epoch !== 0) {
          return { rowCount: 0, rows: [] };
        }
        row.status = 'destroyed';
        row.runtime_status = 'stopped';
        row.lease_token = null;
        row.lease_expire_at = null;
        row.ownership_epoch += 1;
        row.destroy_at = new Date().toISOString();
        return { rowCount: 1, rows: [] };
      }
      throw new Error(`unexpected pool query: ${normalizedSql}`);
    },
  };

  async acquireAdvisoryLock(key: string): Promise<void> {
    const state = this.advisoryLocks.get(key) ?? { locked: false, waiters: [] };
    this.advisoryLocks.set(key, state);
    if (!state.locked) {
      state.locked = true;
      return;
    }
    await new Promise<void>((resolve) => state.waiters.push(resolve));
  }

  releaseAdvisoryLock(key: string): void {
    const state = this.advisoryLocks.get(key);
    if (!state) {
      return;
    }
    const next = state.waiters.shift();
    if (next) {
      next();
      return;
    }
    state.locked = false;
    this.advisoryLocks.delete(key);
  }
}

class FakeCatalogClient {
  private advisoryLockKey: string | null = null;

  constructor(private readonly database: FakeCatalogDatabase) {}

  async query(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const normalizedSql = normalizeSql(sql);
    if (normalizedSql === 'BEGIN') {
      return { rowCount: 0, rows: [] };
    }
    if (normalizedSql.startsWith('SELECT pg_advisory_xact_lock')) {
      const key = String(params[0] ?? '');
      await this.database.acquireAdvisoryLock(key);
      this.advisoryLockKey = key;
      return { rowCount: 1, rows: [{}] };
    }
    if (normalizedSql.startsWith('SELECT instance_id FROM instance_catalog')) {
      const prefix = String(params[0] ?? '');
      const rows = Array.from(this.database.rows.keys())
        .filter((instanceId) => instanceId.startsWith(prefix))
        .map((instanceId) => ({ instance_id: instanceId }));
      return { rowCount: rows.length, rows };
    }
    if (normalizedSql.startsWith('INSERT INTO instance_catalog')) {
      const instanceId = String(params[0] ?? '');
      if (this.database.rows.has(instanceId)) {
        return { rowCount: 0, rows: [] };
      }
      this.database.rows.set(instanceId, {
        instance_id: instanceId,
        template_id: String(params[1] ?? ''),
        instance_type: 'public',
        persistent_policy: String(params[2] ?? ''),
        status: 'active',
        runtime_status: 'creating',
        ownership_epoch: 0,
        assigned_node_id: null,
        lease_token: String(params[5] ?? ''),
        lease_expire_at: params[6] instanceof Date ? params[6].toISOString() : String(params[6] ?? ''),
        destroy_at: typeof params[4] === 'string' ? params[4] : null,
        route_domain: typeof params[3] === 'string' ? params[3] : null,
      });
      return { rowCount: 1, rows: [{ instance_id: instanceId }] };
    }
    if (normalizedSql === 'COMMIT' || normalizedSql === 'ROLLBACK') {
      this.releaseAdvisoryLock();
      return { rowCount: 0, rows: [] };
    }
    throw new Error(`unexpected client query: ${normalizedSql}`);
  }

  release(): void {
    this.releaseAdvisoryLock();
  }

  private releaseAdvisoryLock(): void {
    if (!this.advisoryLockKey) {
      return;
    }
    this.database.releaseAdvisoryLock(this.advisoryLockKey);
    this.advisoryLockKey = null;
  }
}

function createCatalogHarness(initialRows: CatalogRow[]): {
  database: FakeCatalogDatabase;
  service: InstanceCatalogService;
} {
  const database = new FakeCatalogDatabase(initialRows);
  return { database, service: createCatalogService(database) };
}

function createCatalogService(database: FakeCatalogDatabase): InstanceCatalogService {
  const service = new InstanceCatalogService(null);
  Object.assign(service as unknown as Record<string, unknown>, {
    pool: database.pool,
    enabled: true,
    __fakeCatalogDatabase: database,
  });
  return service;
}

function databaseForCatalogService(service: InstanceCatalogService): FakeCatalogDatabase | undefined {
  return (service as unknown as { __fakeCatalogDatabase?: FakeCatalogDatabase }).__fakeCatalogDatabase;
}

function createHistoricalTombstone(instanceId = 'line:yunlai_town:real:2'): CatalogRow {
  return {
    instance_id: instanceId,
    template_id: 'yunlai_town',
    instance_type: 'public',
    persistent_policy: 'persistent',
    status: 'destroyed',
    runtime_status: 'stopped',
    ownership_epoch: 4,
    assigned_node_id: null,
    lease_token: null,
    lease_expire_at: null,
    destroy_at: '2026-07-14T00:00:00.000Z',
    route_domain: 'real',
  };
}

function createGmWorldService(
  instanceCatalogService: InstanceCatalogService,
  createdInstanceIds: string[],
  runtimeInstanceIds: string[],
  options: {
    readinessOk?: boolean;
    destroyShouldFail?: boolean;
    fencedInstanceIds?: string[];
  } = {},
): NativeGmWorldService {
  const defaultRuntimeSummary = {
      instanceId: 'real:yunlai_town',
      displayName: '云来镇·真实',
      templateId: 'yunlai_town',
      templateName: '云来镇',
      linePreset: 'real',
      lineIndex: 1,
      instanceOrigin: 'bootstrap',
      defaultEntry: true,
      persistent: true,
      supportsPvp: true,
      canDamageTile: true,
      playerCount: 0,
  };
  const runtimeByInstanceId = new Map<string, {
    snapshot(): Record<string, unknown>;
    listPlayerIds(): string[];
    meta?: Record<string, unknown>;
  }>();
  runtimeInstanceIds.splice(0, runtimeInstanceIds.length, defaultRuntimeSummary.instanceId);
  const worldRuntimeService = {
    listInstances() {
      return [
        { ...defaultRuntimeSummary },
        ...Array.from(runtimeByInstanceId.values(), (runtime) => runtime.snapshot()),
      ];
    },
    createInstance(input: Record<string, unknown>) {
      const snapshot = {
        ...input,
        templateName: '云来镇',
        playerCount: 0,
        supportsPvp: true,
        canDamageTile: true,
      };
      const instanceId = String(input.instanceId);
      const database = databaseForCatalogService(instanceCatalogService);
      const catalogRow = database?.rows.get(instanceId);
      const leaseToken = `lease:${instanceId}:smoke`;
      if (catalogRow) {
        catalogRow.runtime_status = 'leased';
        catalogRow.assigned_node_id = 'node:smoke';
        catalogRow.lease_token = leaseToken;
        catalogRow.lease_expire_at = new Date(Date.now() + 60_000).toISOString();
        catalogRow.ownership_epoch = 1;
      }
      const runtime = {
        meta: {
          assignedNodeId: 'node:smoke',
          leaseToken,
          leaseExpireAt: new Date(Date.now() + 60_000).toISOString(),
          ownershipEpoch: 1,
          runtimeStatus: 'leased',
          status: 'active',
          destroyAt: input.destroyAt ?? null,
        },
        snapshot() {
          return { ...snapshot };
        },
        listPlayerIds() {
          return [];
        },
      };
      runtimeByInstanceId.set(instanceId, runtime);
      runtimeInstanceIds.push(instanceId);
      createdInstanceIds.push(instanceId);
      return runtime;
    },
    async waitForInstanceLeaseReady() {},
    instanceReadyForPlayerAttach() {
      return options.readinessOk === false
        ? { ok: false, reason: 'lease_not_local' }
        : { ok: true, reason: 'ready' };
    },
    getInstanceRuntime(instanceId: string) {
      return runtimeByInstanceId.get(instanceId) ?? null;
    },
    async destroyEmptyManagedInstance(instanceId: string) {
      const runtime = runtimeByInstanceId.get(instanceId);
      if (!runtime || runtime.listPlayerIds().length > 0) {
        return { ok: false, reason: runtime ? 'players_present' : 'instance_not_found' };
      }
      if (options.destroyShouldFail === true) {
        return { ok: false, reason: 'instance_catalog_fence_failed' };
      }
      const database = databaseForCatalogService(instanceCatalogService);
      const catalogRow = database?.rows.get(instanceId);
      if (!catalogRow) {
        return { ok: false, reason: 'instance_catalog_fence_failed' };
      }
      catalogRow.status = 'destroyed';
      catalogRow.runtime_status = 'stopped';
      catalogRow.assigned_node_id = null;
      catalogRow.lease_token = null;
      catalogRow.lease_expire_at = null;
      catalogRow.ownership_epoch += 1;
      catalogRow.destroy_at = new Date().toISOString();
      runtimeByInstanceId.delete(instanceId);
      const runtimeIndex = runtimeInstanceIds.indexOf(instanceId);
      if (runtimeIndex >= 0) {
        runtimeInstanceIds.splice(runtimeIndex, 1);
      }
      return { ok: true };
    },
    fenceInstanceRuntime(instanceId: string) {
      options.fencedInstanceIds?.push(instanceId);
      const runtime = runtimeByInstanceId.get(instanceId);
      if (!runtime || runtime.listPlayerIds().length > 0) {
        return;
      }
      runtimeByInstanceId.delete(instanceId);
      const runtimeIndex = runtimeInstanceIds.indexOf(instanceId);
      if (runtimeIndex >= 0) {
        runtimeInstanceIds.splice(runtimeIndex, 1);
      }
    },
    playerRuntimeService: { getPlayer() { return null; } },
    worldRuntimeGmQueueService: { hasPendingRespawn() { return false; } },
    worldRuntimeCommandIntakeFacadeService: { enqueueGmUpdatePlayer() { return { queued: true }; } },
  };

  return new NativeGmWorldService(
    { loadAll() {} } as never,
    { buildPerformanceSnapshot() { return {}; }, resetNetworkPerfCounters() {} } as never,
    {
      getOrThrow(mapId: string) {
        assert.equal(mapId, 'yunlai_town');
        return { id: mapId, name: '云来镇', source: { time: {} } };
      },
      loadAll() {},
      listSummaries() { return [{ id: 'yunlai_town' }]; },
    } as never,
    { updateMapTick() {}, updateMapTime() {}, pruneMapConfigs() {} } as never,
    { invalidatePlayerListCaches() {}, async listPlayers() { return { players: [] }; }, async getState() { return {}; } } as never,
    { getEditorCatalog() { return {}; } } as never,
    { getMaps() { return {}; } } as never,
    {} as never,
    { isEnabled() { return true; }, getNodeId() { return 'node:smoke'; }, async listNodes() { return []; } } as never,
    { async listRetryQueue() { return []; } } as never,
    { async getOperationReplay() { return { operation: null, outboxEvents: [], assetAuditLogs: [] }; } } as never,
    { async flushPlayer() {} } as never,
    { async flushInstance() {} } as never,
    null,
    worldRuntimeService as never,
    undefined,
    instanceCatalogService,
  );
}

async function testHistoricalTombstoneAdvancesManualLineId(): Promise<void> {
  const { database, service: catalogService } = createCatalogHarness([createHistoricalTombstone()]);
  const createdInstanceIds: string[] = [];
  const runtimeInstanceIds: string[] = [];
  const gmWorldService = createGmWorldService(catalogService, createdInstanceIds, runtimeInstanceIds);

  const result = await gmWorldService.createWorldInstance({
    templateId: 'yunlai_town',
    linePreset: 'real',
  }) as { instance: { instanceId: string } };

  assert.equal(result.instance.instanceId, 'line:yunlai_town:real:3');
  assert.deepEqual(createdInstanceIds, ['line:yunlai_town:real:3']);
  assert.equal(database.rows.get('line:yunlai_town:real:2')?.status, 'destroyed');
  assert.equal(database.rows.get('line:yunlai_town:real:2')?.runtime_status, 'stopped');
  assert.equal(database.rows.get('line:yunlai_town:real:3')?.route_domain, null);
}

async function testConcurrentManualLineCreationUsesDistinctIds(): Promise<void> {
  const { database, service: catalogService } = createCatalogHarness([createHistoricalTombstone()]);
  const secondNodeCatalogService = createCatalogService(database);
  const reservationInput = {
    instanceIdPrefix: 'line:yunlai_town:real:',
    templateId: 'yunlai_town',
    persistentPolicy: 'persistent',
    routeDomain: null,
    minimumLineIndex: 2,
    occupiedRuntimeInstanceIds: ['real:yunlai_town'],
  };
  const crossNodeReservations = await Promise.all([
    catalogService.reserveNextManualLineInstance(reservationInput),
    secondNodeCatalogService.reserveNextManualLineInstance(reservationInput),
  ]);
  assert.deepEqual(
    crossNodeReservations.map((reservation) => reservation?.instanceId).sort(),
    ['line:yunlai_town:real:3', 'line:yunlai_town:real:4'],
  );

  const gmCatalogService = createCatalogService(database);
  const createdInstanceIds: string[] = [];
  const runtimeInstanceIds: string[] = [];
  const gmWorldService = createGmWorldService(gmCatalogService, createdInstanceIds, runtimeInstanceIds);

  const results = await Promise.all([
    gmWorldService.createWorldInstance({ templateId: 'yunlai_town', linePreset: 'real' }),
    gmWorldService.createWorldInstance({ templateId: 'yunlai_town', linePreset: 'real' }),
  ]) as Array<{ instance: { instanceId: string } }>;

  assert.deepEqual(
    results.map((result) => result.instance.instanceId).sort(),
    ['line:yunlai_town:real:5', 'line:yunlai_town:real:6'],
  );
  assert.equal(new Set(createdInstanceIds).size, 2);
}

async function testReadinessFailureCleansRuntimeAndReservation(): Promise<void> {
  const { database, service: catalogService } = createCatalogHarness([createHistoricalTombstone()]);
  const createdInstanceIds: string[] = [];
  const runtimeInstanceIds: string[] = [];
  const gmWorldService = createGmWorldService(
    catalogService,
    createdInstanceIds,
    runtimeInstanceIds,
    { readinessOk: false },
  );

  await assert.rejects(
    async () => {
      await gmWorldService.createWorldInstance({ templateId: 'yunlai_town', linePreset: 'real' });
    },
    /手动分线创建后未就绪：lease_not_local/,
  );
  assert.deepEqual(createdInstanceIds, ['line:yunlai_town:real:3']);
  assert.deepEqual(runtimeInstanceIds, ['real:yunlai_town']);
  assert.equal(database.rows.get('line:yunlai_town:real:3')?.status, 'destroyed');
  assert.equal(database.rows.get('line:yunlai_town:real:3')?.runtime_status, 'stopped');
}

async function testDestroyCasFailurePreservesRuntimeAndActiveCatalog(): Promise<void> {
  const { database, service: catalogService } = createCatalogHarness([createHistoricalTombstone()]);
  const createdInstanceIds: string[] = [];
  const runtimeInstanceIds: string[] = [];
  const fencedInstanceIds: string[] = [];
  const gmWorldService = createGmWorldService(
    catalogService,
    createdInstanceIds,
    runtimeInstanceIds,
    {
      readinessOk: false,
      destroyShouldFail: true,
      fencedInstanceIds,
    },
  );

  await assert.rejects(
    async () => {
      await gmWorldService.createWorldInstance({ templateId: 'yunlai_town', linePreset: 'real' });
    },
    /手动分线创建后未就绪：lease_not_local/,
  );
  assert.deepEqual(createdInstanceIds, ['line:yunlai_town:real:3']);
  assert.deepEqual(runtimeInstanceIds, ['real:yunlai_town', 'line:yunlai_town:real:3']);
  assert.deepEqual(fencedInstanceIds, []);
  assert.equal(database.rows.get('line:yunlai_town:real:3')?.status, 'active');
  assert.equal(database.rows.get('line:yunlai_town:real:3')?.runtime_status, 'cleanup_pending');
  assert.ok(database.rows.get('line:yunlai_town:real:3')?.destroy_at);
}

async function testCreatingReservationIsNotRecoverable(): Promise<void> {
  const creatingEntry: CatalogRow = {
    ...createHistoricalTombstone('line:yunlai_town:real:9'),
    status: 'active',
    runtime_status: 'creating',
    ownership_epoch: 0,
    destroy_at: null,
  };
  let periodicCreateCount = 0;
  const claimed = await claimRecoverableCatalogInstances({
    instanceCatalogService: {
      isEnabled() { return true; },
      async listInstanceCatalogEntries() { return [{ ...creatingEntry }]; },
    },
    nodeRegistryService: { getNodeId() { return 'node:smoke'; } },
    getInstanceRuntime() { return null; },
    createInstance() {
      periodicCreateCount += 1;
      throw new Error('creating reservation must not materialize');
    },
  });
  assert.equal(claimed, 0);
  assert.equal(periodicCreateCount, 0);

  let startupCreateCount = 0;
  const lifecycleService = new WorldRuntimeLifecycleService();
  const lifecycleDeps = {
    worldRuntimeInstanceLeaseReadinessService: { reset() {} },
    instanceCatalogService: {
      isEnabled() { return true; },
      async listInstanceCatalogEntries() { return [{ ...creatingEntry }]; },
    },
    worldRuntimeTongtianTowerService: {
      restoreCatalogTowerTemplate() { return false; },
    },
    templateRepository: {
      list() { return []; },
      has() { return true; },
    },
    worldRuntimeInstanceStateService: { resetState() {} },
    worldRuntimePlayerLocationService: { resetState() {} },
    worldRuntimePendingCommandService: { resetState() {} },
    worldRuntimeGmQueueService: { resetState() {} },
    worldRuntimeNavigationService: { reset() {} },
    worldRuntimeTickProgressService: { resetState() {} },
    worldRuntimeLootContainerService: { reset() {} },
    worldRuntimeCombatEffectsService: { resetAll() {} },
    createInstance() {
      startupCreateCount += 1;
      throw new Error('creating reservation must not restore a startup shell');
    },
    listInstanceEntries() { return [] as Array<[string, unknown]>; },
    getInstanceRuntime() { return null; },
    getInstanceCount() { return 0; },
    async claimRecoverableCatalogInstances() { return 0; },
    async syncInstanceLease() {},
    logger: { log() {}, warn() {} },
  };
  await lifecycleService.rebuildPersistentRuntimeAfterRestore(lifecycleDeps, {
    restoreCatalogInstances: true,
    restoreInstanceDomains: false,
    restoreOfflinePlayers: false,
  });
  assert.equal(startupCreateCount, 0);
}

async function testExpiredCreatingReservationIsTombstoned(): Promise<void> {
  const expiredReservation: CatalogRow = {
    ...createHistoricalTombstone('line:yunlai_town:real:10'),
    status: 'active',
    runtime_status: 'creating',
    ownership_epoch: 0,
    assigned_node_id: null,
    lease_token: 'reservation:expired-smoke',
    lease_expire_at: new Date(Date.now() - 1_000).toISOString(),
    destroy_at: null,
  };
  const { database, service } = createCatalogHarness([expiredReservation]);
  assert.deepEqual(await service.cleanupStaleManualLineReservations(), [expiredReservation.instance_id]);
  const cleaned = database.rows.get(expiredReservation.instance_id);
  assert.equal(cleaned?.status, 'destroyed');
  assert.equal(cleaned?.runtime_status, 'stopped');
  assert.equal(cleaned?.lease_token, null);
  assert.equal(cleaned?.lease_expire_at, null);
  assert.equal(cleaned?.ownership_epoch, 1);
}

async function testReservationTokenSurvivesUntilExactClaim(): Promise<void> {
  const { database, service } = createCatalogHarness([]);
  const reservation = await service.reserveNextManualLineInstance({
    instanceIdPrefix: 'line:yunlai_town:real:',
    templateId: 'yunlai_town',
    persistentPolicy: 'persistent',
    minimumLineIndex: 2,
  });
  assert.ok(reservation);
  assert.equal(await service.confirmManualLineReservation({
    instanceId: reservation.instanceId,
    reservationToken: reservation.reservationToken,
    expectedTemplateId: 'yunlai_town',
    expectedInstanceType: 'public',
    expectedPersistentPolicy: 'persistent',
  }), true);
  const confirmed = database.rows.get(reservation.instanceId);
  assert.equal(confirmed?.runtime_status, 'creating');
  assert.equal(confirmed?.lease_token, reservation.reservationToken);

  const ordinaryClaim = await service.claimInstanceLease({
    instanceId: reservation.instanceId,
    nodeId: 'node:smoke',
    leaseToken: 'lease:ordinary',
    leaseExpireAt: new Date(Date.now() + 60_000),
    expectedOwnershipEpoch: 0,
  });
  assert.equal(ordinaryClaim.ok, false);

  const exactClaim = await service.claimInstanceLease({
    instanceId: reservation.instanceId,
    nodeId: 'node:smoke',
    leaseToken: 'lease:exact',
    leaseExpireAt: new Date(Date.now() + 60_000),
    expectedOwnershipEpoch: 0,
    expectedReservationToken: reservation.reservationToken,
  });
  assert.deepEqual(exactClaim, { ok: true, ownershipEpoch: 1 });
  const claimed = database.rows.get(reservation.instanceId);
  assert.equal(claimed?.runtime_status, 'leased');
  assert.equal(claimed?.assigned_node_id, 'node:smoke');
  assert.equal(claimed?.lease_token, 'lease:exact');
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

async function main(): Promise<void> {
  await testHistoricalTombstoneAdvancesManualLineId();
  await testConcurrentManualLineCreationUsesDistinctIds();
  await testReadinessFailureCleansRuntimeAndReservation();
  await testDestroyCasFailurePreservesRuntimeAndActiveCatalog();
  await testCreatingReservationIsNotRecoverable();
  await testExpiredCreatingReservationIsTombstoned();
  await testReservationTokenSurvivesUntilExactClaim();
  console.log(JSON.stringify({
    ok: true,
    case: 'gm-manual-line-catalog-fence',
    assertions: {
      historicalTombstoneAdvanced: true,
      concurrentIdsDistinct: true,
      readinessFailureCleaned: true,
      destroyCasFailurePreserved: true,
      creatingReservationNotRecoverable: true,
      expiredCreatingReservationTombstoned: true,
      reservationTokenExactClaimed: true,
    },
  }, null, 2));
}

void main();
