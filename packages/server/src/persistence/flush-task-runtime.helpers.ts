/**
 * flush-task-runtime.helpers.ts
 *
 * 从 flush-task-runtime.service.ts 拆出的模块级常量、接口定义与游离函数。
 * 包含：flush 运行时配置常量、payload 规范化/去重/分组 helper、围栏判定等纯函数。
 * 不包含 @Injectable provider，不修改持久化语义。
 */
import { createHash } from 'node:crypto';

import { readTrimmedEnv } from '../config/env-alias';
import type { BuildingRoomFengShuiPersistenceDomain } from './instance-domain-persistence.service';
import type { InstanceFlushLedgerClaim } from './instance-flush-ledger-fence';
import type { FlushTask, FlushTaskPriority, FlushTaskScope } from './flush-task.types';
import type { FlushTaskUpsertIdentity } from './flush-ledger.service';
import {
  PLAYER_RUNTIME_FLUSH_EXCLUDED_DOMAINS,
  PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
  type PlayerPresenceUpsertInput,
} from './player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';

// ── 配置常量 ──
export const INTERVAL_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_INTERVAL_MS', 'FLUSH_TASK_RUNTIME_INTERVAL_MS', 1_500, 250, 60_000);
export const CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_CLAIM_LIMIT', 64, 1, 256);
export const PLAYER_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_CLAIM_LIMIT', CLAIM_LIMIT, 1, 5_000);
export const INSTANCE_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_CLAIM_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_CLAIM_LIMIT', CLAIM_LIMIT, 1, 5_000);
export const PLAYER_HIGH_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_HIGH_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_HIGH_LIMIT', Math.max(1, Math.floor(PLAYER_CLAIM_LIMIT * 0.4)), 1, 5_000);
export const PLAYER_NORMAL_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_NORMAL_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_NORMAL_LIMIT', Math.max(1, Math.floor(PLAYER_CLAIM_LIMIT * 0.45)), 1, 5_000);
export const PLAYER_LOW_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_LOW_LIMIT', 'FLUSH_TASK_RUNTIME_PLAYER_LOW_LIMIT', Math.max(1, PLAYER_CLAIM_LIMIT - PLAYER_HIGH_CLAIM_LIMIT - PLAYER_NORMAL_CLAIM_LIMIT), 1, 5_000);
export const INSTANCE_HIGH_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_HIGH_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_HIGH_LIMIT', Math.max(1, Math.floor(INSTANCE_CLAIM_LIMIT * 0.25)), 1, 5_000);
export const INSTANCE_NORMAL_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_NORMAL_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_NORMAL_LIMIT', Math.max(1, Math.floor(INSTANCE_CLAIM_LIMIT * 0.45)), 1, 5_000);
export const INSTANCE_LOW_CLAIM_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_LOW_LIMIT', 'FLUSH_TASK_RUNTIME_INSTANCE_LOW_LIMIT', Math.max(1, INSTANCE_CLAIM_LIMIT - INSTANCE_HIGH_CLAIM_LIMIT - INSTANCE_NORMAL_CLAIM_LIMIT), 1, 5_000);
export const PLAYER_PARALLELISM = readInt('SERVER_FLUSH_TASK_RUNTIME_PLAYER_PARALLELISM', 'FLUSH_TASK_RUNTIME_PLAYER_PARALLELISM', 4, 1, 64);
export const INSTANCE_PARALLELISM = readInt('SERVER_FLUSH_TASK_RUNTIME_INSTANCE_PARALLELISM', 'FLUSH_TASK_RUNTIME_INSTANCE_PARALLELISM', 4, 1, 64);
export const RETRY_DELAY_MS = readInt('SERVER_FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 'FLUSH_TASK_RUNTIME_RETRY_DELAY_MS', 5_000, 250, 300_000);
export const COALESCE_MS = readInt('SERVER_MAP_PERSISTENCE_COALESCE_WINDOW_MS', 'MAP_PERSISTENCE_COALESCE_WINDOW_MS', 60_000, 0, 300_000);
export const TIME_CHECKPOINT_MS = readInt('SERVER_MAP_TIME_CHECKPOINT_INTERVAL_MS', 'MAP_TIME_CHECKPOINT_INTERVAL_MS', 300_000, 60_000, 3_600_000);
export const MONSTER_RUNTIME_MS = readInt('SERVER_MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 'MAP_MONSTER_RUNTIME_FLUSH_INTERVAL_MS', 60_000, 10_000, 600_000);
export const PLAYER_BACKGROUND_COALESCE_MS = readInt('SERVER_PLAYER_FLUSH_TASK_COALESCE_MS', 'PLAYER_FLUSH_TASK_COALESCE_MS', 60_000, 5_000, 300_000);
export const PLAYER_PRESENCE_COALESCE_MS = readInt('SERVER_PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS', 'PLAYER_PRESENCE_FLUSH_TASK_COALESCE_MS', 30_000, 1_000, 300_000);
export const PLAYER_LOCATION_COALESCE_MS = readInt('SERVER_PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS', 'PLAYER_LOCATION_FLUSH_TASK_COALESCE_MS', 5_000, 1_000, 60_000);
export const FLUSH_WAITING_LIMIT = readInt('SERVER_FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 'FLUSH_TASK_RUNTIME_POOL_WAITING_THRESHOLD', 8, 0, 100);
export const STALE_PAYLOAD_ABANDON_THRESHOLD = readInt('SERVER_FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 'FLUSH_TASK_STALE_PAYLOAD_ABANDON_THRESHOLD', 10, 2, 100);
// 确定性不可恢复的玩家 payload（如历史 incomplete fence）在运行期重试永远无法成功，
// 只能等玩家再次产生 dirty 由新 staging 覆盖；超过阈值后改为低频重试并停止 WARN 刷屏。
export const NON_RECOVERABLE_PLAYER_RETRY_DELAY_MS = readInt('SERVER_FLUSH_TASK_NON_RECOVERABLE_RETRY_DELAY_MS', 'FLUSH_TASK_NON_RECOVERABLE_RETRY_DELAY_MS', 300_000, 30_000, 3_600_000);
export const NON_RECOVERABLE_PLAYER_QUIET_AFTER = readInt('SERVER_FLUSH_TASK_NON_RECOVERABLE_QUIET_AFTER', 'FLUSH_TASK_NON_RECOVERABLE_QUIET_AFTER', 3, 1, 100);
export const STAGING_BATCH_SIZE = readInt('SERVER_FLUSH_TASK_STAGING_BATCH_SIZE', 'FLUSH_TASK_STAGING_BATCH_SIZE', 64, 1, 512);
export const PAYLOAD_CLAIM_RENEW_TTL_MS = readInt('SERVER_FLUSH_TASK_PAYLOAD_CLAIM_TTL_MS', 'FLUSH_TASK_PAYLOAD_CLAIM_TTL_MS', 30_000, 5_000, 300_000);
export const STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS = readInt('SERVER_STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS', 'STARTUP_PAYLOAD_REPLAY_TIMEOUT_MS', 60_000, 5_000, 300_000);
export const STARTUP_PAYLOAD_REPLAY_POLL_MS = readInt('SERVER_STARTUP_PAYLOAD_REPLAY_POLL_MS', 'STARTUP_PAYLOAD_REPLAY_POLL_MS', 100, 25, 2_000);
export const ASSET_CONFLICT_REPAIR_INTERVAL_MS = 60_000;
// 关服总预算为 28 秒；为后台 worker drain 和各领域 final flush 保留足够余量。
export const SHUTDOWN_PAYLOAD_REPLAY_TIMEOUT_MS = 10_000;
export const SHUTDOWN_STAGING_MAX_ROUNDS = 3;
export const INSTANCE_COALESCE_DOMAINS = new Set(['tile_damage', 'tile_resource', 'fengshui']);
export const PLAYER_HIGH_PRIORITY_DOMAINS = new Set(['presence', 'position_checkpoint', 'world_anchor', 'inventory', 'equipment', 'artifact', 'market', 'mail', 'gm_edit', 'gm']);
export const INSTANCE_LOW_PRIORITY_DOMAINS = new Set(['time', 'monster_runtime', 'tile_resource', 'tile_damage', 'fengshui']);
export const INSTANCE_NORMAL_PRIORITY_DOMAINS = new Set(['container_state', 'ground_item', 'overlay', 'room', 'building', 'temporary_tile', 'tile_cell']);
export const PLAYER_PROJECTABLE_DOMAIN_SET = new Set<string>(PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS);
export { PLAYER_RUNTIME_FLUSH_EXCLUDED_DOMAINS };
export const PLAYER_FALLBACK_SNAPSHOT_DOMAIN = 'snapshot';
export const PLAYER_PRESENCE_PAYLOAD_KIND = 'player_presence';
export const PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND = 'player_snapshot_projection';
export const PLAYER_GROUPED_CLAIM_DOMAINS = Object.freeze([
  'presence',
  PLAYER_FALLBACK_SNAPSHOT_DOMAIN,
  ...PLAYER_SNAPSHOT_PROJECTABLE_DIRTY_DOMAINS,
]);
export const PLAYER_GROUPED_CLAIM_DOMAIN_SET = new Set<string>(PLAYER_GROUPED_CLAIM_DOMAINS);
export const INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND = 'instance_domain_delta';
export const INSTANCE_DOMAIN_STATE_PAYLOAD_KIND = 'instance_domain_state';
export const INSTANCE_PAYLOAD_BATCH_DOMAINS = new Set(['tile_damage', 'tile_resource']);
export const INSTANCE_PAYLOAD_STATE_DOMAINS = new Set(['tile_cell', 'temporary_tile', 'ground_item', 'overlay', 'monster_runtime', 'container_state', 'building', 'room', 'fengshui', 'time']);
export const INSTANCE_BUILDING_COMPOSITE_DOMAINS = new Set(['building', 'room', 'fengshui']);
export interface PlayerPayloadMetadata {
  domainRevision: number;
  runtimeRevision: number;
  projectionVersion: number;
  stagingGenerationId: string;
  stagingDomain?: string;
  hasExplicitProjectionVersion?: boolean;
}

export interface PlayerPresenceFlushPayload extends PlayerPayloadMetadata {
  kind: typeof PLAYER_PRESENCE_PAYLOAD_KIND;
  presence: PlayerPresenceUpsertInput;
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
}

export interface PlayerSnapshotProjectionPayload extends PlayerPayloadMetadata {
  kind: typeof PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND;
  snapshot: PersistedPlayerSnapshot;
  projectedDomains: string[];
  runtimeOwnerId?: string | null;
  sessionEpoch?: number | null;
  /**
   * staging 时的 presence 记录快照。投影围栏裁定为 indeterminate（DB presence 落后于
   * payload epoch）时，用它把 DB presence 推进到本会话（CAS 保护），避免投影刷盘
   * 因 30s presence 合并延迟反复整组回滚。
   */
  presence?: PlayerPresenceUpsertInput | null;
}

export type PlayerProjectionFenceDecision = 'current' | 'stale' | 'indeterminate';

export interface InstanceDomainDeltaPayload {
  kind: typeof INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND;
  domain: string;
  fullReplace?: boolean;
  upserts: unknown[];
  deletes: unknown[];
  entries?: unknown[];
  revision?: number;
  domainRevisions?: Record<string, number>;
  stagedDomains?: string[];
  stagingGenerationId?: string;
  containerRevision?: number;
  watermarkPayload?: unknown;
}

export interface InstanceDomainStatePayload {
  kind: typeof INSTANCE_DOMAIN_STATE_PAYLOAD_KIND;
  domain: string;
  payload: unknown;
  revision?: number;
  domainRevisions?: Record<string, number>;
  stagedDomains?: string[];
  stagingGenerationId?: string;
  containerRevision?: number;
  watermarkPayload?: unknown;
}

export interface InstanceFlushSnapshotView {
  [key: string]: unknown;
  persistenceRevision?: number;
  domainRevisions?: Map<string, number>;
}

export interface PreparedInstancePayload {
  payload: InstanceDomainDeltaPayload | InstanceDomainStatePayload;
  latestRevision: number;
  flushSnapshot: InstanceFlushSnapshotView | null;
  stagedDomains: string[];
  containerRevision: number | null;
}

export interface PlayerRuntimeFlushTaskPort {
  listDirtyPlayerDomains?(): Map<string, Set<string>>;
  listUnstagedPlayerDomainRevisions?(stagingGenerationId: string): Map<string, Map<string, number>>;
  listDirtyPlayers?(): string[];
  getPersistenceRevision?(playerId: string): number | null;
  getPersistenceDomainRevision?(playerId: string, domain: string): number | null;
  getUnstagedPersistenceDomainRevision?(
    playerId: string,
    domain: string,
    stagingGenerationId: string,
  ): number | null;
  ensureRuntimeOwnershipClaimed?(playerId: string): Promise<{
    runtimeOwnerId?: string | null;
    sessionEpoch?: number | null;
  } | null>;
  describePersistencePresence?(playerId: string): PlayerPresenceUpsertInput | null;
  buildPersistenceSnapshot?(playerId: string, dirtyDomains?: ReadonlySet<string>): PersistedPlayerSnapshot | null;
  markPersistenceDomainsStaged?(
    playerId: string,
    domainRevisions: ReadonlyMap<string, number>,
    runtimeRevision: number,
    stagingGenerationId: string,
  ): void;
  markPersistenceDomainsPersistedByRevision?(
    playerId: string,
    domainRevisions: ReadonlyMap<string, number>,
    runtimeRevision: number,
    stagingGenerationId: string,
  ): void;
}

export interface PlayerPersistenceFlushPort {
  flushPlayerDomains(playerId: string, domains: Iterable<string>): Promise<boolean | void>;
}

export interface InstanceRuntimeView {
  meta?: { persistent?: boolean | null; ownershipEpoch?: number | null } | null;
  getPersistenceRevision?: () => number | null;
  getPersistenceDomainRevision?: (domain: string) => number | null;
  getStagedPersistenceDomainRevision?: (domain: string, stagingGenerationId: string) => number | null;
  isDirtyDomainHighPriority?: (domain: string) => boolean;
  capturePersistenceDomainFlushSnapshot?: (domains: string[]) => unknown;
  markPersistenceDomainsStaged?: (domains: string[], flushSnapshot: unknown, stagingGenerationId: string) => void;
  markPersistenceDomainsPersisted?: (domains: string[], flushSnapshot?: unknown) => void;
  isPersistenceDomainHeld?: (domain: string) => boolean;
  buildRuntimeTilePersistenceEntries?: () => unknown[];
  buildTemporaryTilePersistenceEntries?: () => unknown[];
  buildGroundPersistenceDelta?: (flushSnapshot?: unknown) => { fullReplace?: boolean; tileIndices?: unknown[]; entries?: unknown[] } | null;
  buildGroundPersistenceEntries?: () => unknown[];
  buildOverlayPersistenceChunks?: () => unknown[];
  buildMonsterRuntimePersistenceDelta?: (flushSnapshot?: unknown) => { fullReplace?: boolean; upserts?: unknown[]; deletes?: unknown[] } | null;
  buildMonsterRuntimePersistenceEntries?: () => unknown[];
  buildBuildingRoomFengShuiPersistenceState?: () => unknown;
}

export interface BatchPersistencePort {
  saveTileDamageStates?(instanceId: string, entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  saveTileDamageDeltaBatch?(deltas: Array<{ instanceId: string; upserts: unknown[]; deletes: unknown[]; ledgerClaim?: InstanceFlushLedgerClaim | null }>): Promise<void | string[]>;
  saveTileResourceDeltaBatch?(deltas: Array<{
    instanceId: string;
    upserts: unknown[];
    deletes: unknown[];
    ledgerClaim?: {
      ownershipEpoch: number;
      latestVersion: number;
      claimOwnerId: string;
      fencingToken?: string | null;
    };
  }>): Promise<void | string[]>;
  saveInstanceRecoveryWatermarkBatch?(rows: Array<{ instanceId: string; payload: unknown }>): Promise<void>;
  saveInstanceRecoveryWatermark?(instanceId: string, payload: unknown): Promise<void>;
  saveInstanceCheckpoint?(instanceId: string, payload: unknown): Promise<void>;
  replaceRuntimeTileCells?(instanceId: string, entries: unknown[]): Promise<void>;
  replaceTemporaryTileStates?(instanceId: string, entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  replaceGroundItems?(instanceId: string, entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  replaceGroundItemTiles?(instanceId: string, tileIndices: unknown[], entries: unknown[], ledgerClaim?: InstanceFlushLedgerClaim | null): Promise<void | boolean>;
  saveContainerState?(input: {
    instanceId: string;
    containerId?: unknown;
    sourceId?: unknown;
    statePayload: unknown;
    ledgerClaim?: InstanceFlushLedgerClaim | null;
  }): Promise<void | boolean>;
  replaceContainerStates?(
    instanceId: string,
    states: Array<{ containerId: string; sourceId: string; [key: string]: unknown }>,
    ledgerClaim?: InstanceFlushLedgerClaim | null,
  ): Promise<void | boolean>;
  saveOverlayChunk?(input: { instanceId: string; patchKind?: unknown; chunkKey?: unknown; patchVersion?: unknown; patchPayload?: unknown }): Promise<void>;
  saveMonsterRuntimeDelta?(instanceId: string, upserts: unknown[], deletes: unknown[]): Promise<void>;
  replaceMonsterRuntimeStates?(instanceId: string, states: unknown[]): Promise<void>;
  saveBuildingRoomFengShuiState?(
    instanceId: string,
    state: unknown,
    domains?: readonly BuildingRoomFengShuiPersistenceDomain[],
  ): Promise<void>;
}

export interface WorldRuntimeFlushTaskPort {
  instanceDomainPersistenceService?: BatchPersistencePort | null;
  worldRuntimeLootContainerService?: {
    buildContainerPersistenceStates(instanceId: string): unknown[];
    getContainerPersistenceRevision?(instanceId: string): number;
    clearPersisted?(instanceId: string, expectedRevision?: number | null): boolean;
  } | null;
  listDirtyPersistentInstanceDomains?(): Array<{ instanceId: string; domains: string[] }>;
  listDirtyPersistentInstances?(): string[];
  getInstanceRuntime?(instanceId: string): InstanceRuntimeView | null;
  flushInstanceDomains?(instanceId: string, domains?: string[] | null): Promise<{ skipped?: boolean } | null>;
  buildDomainDeltaBatch?(domain: string, instanceIds: string[]): Array<{
    instanceId: string;
    fullReplace?: boolean;
    upserts?: unknown[];
    deletes?: unknown[];
    entries?: unknown[];
    watermarkPayload?: unknown;
    flushSnapshot?: unknown;
  }>;
  markDomainBatchPersisted?(
    domain: string,
    instanceIds: string[],
    snapshots?: Array<{ instanceId: string; flushSnapshot?: unknown }>,
  ): void;
}
export function normalizeInstanceDomainStatePayload(value: unknown): InstanceDomainStatePayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== INSTANCE_DOMAIN_STATE_PAYLOAD_KIND || typeof record.domain !== 'string') {
    return null;
  }
  return {
    kind: INSTANCE_DOMAIN_STATE_PAYLOAD_KIND,
    domain: record.domain,
    payload: record.payload,
    revision: normalizeOptionalRevision(record.revision),
    domainRevisions: normalizeDomainRevisionRecord(record.domainRevisions),
    stagedDomains: normalizeStringArray(record.stagedDomains),
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? undefined,
    containerRevision: normalizeOptionalRevision(record.containerRevision),
    watermarkPayload: record.watermarkPayload,
  };
}

export function isPayloadRevisionCurrent(
  payload: { revision?: number; stagingGenerationId?: string },
  latestRevision: unknown,
): boolean {
  // 旧 ledger 的 latest_version 可能来自进程重启前的高水位，而 payload 已被历史 UPSERT
  // 以较低 runtime revision 覆盖；没有 generation 证据时只能依赖 ownership epoch replay。
  if (!normalizeNullableString(payload.stagingGenerationId)) {
    return true;
  }
  const payloadRevision = payload.revision;
  const taskRevision = normalizeOptionalRevision(latestRevision);
  return payloadRevision !== undefined && taskRevision !== undefined && payloadRevision === taskRevision;
}

export function isStaleGroundItemStatePayloadError(error: unknown): boolean {
  return error instanceof Error && error.message.startsWith('stale_ground_item_state_payload:');
}

export function normalizeOptionalRevision(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return Math.max(0, Math.trunc(parsed));
}

export function normalizeInstanceFlushSnapshot(value: unknown): InstanceFlushSnapshotView | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as { persistenceRevision?: unknown; domainRevisions?: unknown };
  const domainRevisions = record.domainRevisions instanceof Map
    ? new Map(Array.from(record.domainRevisions.entries(), ([domain, revision]) => [String(domain), Math.max(0, Math.trunc(Number(revision) || 0))]))
    : new Map(Object.entries(normalizeDomainRevisionRecord(record.domainRevisions)));
  return {
    ...(value as Record<string, unknown>),
    persistenceRevision: normalizeOptionalRevision(record.persistenceRevision),
    domainRevisions,
  };
}

export function serializeDomainRevisions(
  flushSnapshot: InstanceFlushSnapshotView | null,
  domains: string[],
): Record<string, number> {
  const revisions: Record<string, number> = {};
  for (const domain of domains) {
    const normalizedDomain = normalizeString(domain);
    const revision = normalizeOptionalRevision(flushSnapshot?.domainRevisions?.get(normalizedDomain)) ?? 0;
    if (normalizedDomain && revision > 0) {
      revisions[normalizedDomain] = revision;
    }
  }
  return revisions;
}

export function normalizeDomainRevisionRecord(value: unknown): Record<string, number> {
  const revisions: Record<string, number> = {};
  const entries = value instanceof Map
    ? Array.from(value.entries())
    : (value && typeof value === 'object' ? Object.entries(value as Record<string, unknown>) : []);
  for (const [domain, revision] of entries) {
    const normalizedDomain = normalizeString(domain);
    const normalizedRevision = normalizeOptionalRevision(revision) ?? 0;
    if (normalizedDomain && normalizedRevision > 0) {
      revisions[normalizedDomain] = normalizedRevision;
    }
  }
  return revisions;
}

export function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(new Set(value.map(normalizeString).filter(Boolean))).sort();
}

export function normalizePayloadStagedDomains(
  payload: InstanceDomainStatePayload | InstanceDomainDeltaPayload,
  fallbackDomain: string,
): string[] {
  const domains = normalizeStringArray(payload.stagedDomains);
  return domains.length > 0 ? domains : [fallbackDomain];
}

export function buildInstanceFlushSnapshotFromPayload(
  payload: InstanceDomainStatePayload | InstanceDomainDeltaPayload,
): InstanceFlushSnapshotView {
  return {
    persistenceRevision: payload.revision,
    domainRevisions: new Map(Object.entries(normalizeDomainRevisionRecord(payload.domainRevisions))),
  };
}

export function buildInstancePayloadFencingToken(
  stagingGenerationId: string,
  domain: string,
  ownershipEpoch: number,
): string {
  const source = `${stagingGenerationId}:${domain}:${ownershipEpoch}`;
  return `instance:${createHash('sha256').update(source).digest('hex')}`;
}

export function isPlayerPayloadVersionCurrent(
  payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload,
  latestRevision: unknown,
): boolean {
  if (payload.hasExplicitProjectionVersion !== true) {
    return true;
  }
  return normalizeOptionalRevision(payload.projectionVersion) === normalizeOptionalRevision(latestRevision);
}

export function hasCompletePlayerRuntimeFence(value: PlayerPresenceUpsertInput | null | undefined): boolean {
  return Boolean(
    normalizeNullableString(value?.runtimeOwnerId)
    && normalizeInt(value?.sessionEpoch, 0, 0, Number.MAX_SAFE_INTEGER) > 0,
  );
}

export function assertReplayablePlayerPayloads(tasks: FlushTask[]): void {
  for (const task of tasks) {
    const error = findNonReplayablePlayerPayloadError(task);
    if (error) {
      throw error;
    }
  }
}

export function findNonReplayablePlayerPayloadError(task: FlushTask): Error | null {
  if (task.domain === 'presence') {
    return normalizePlayerPresencePayload(task.payloadJson)
      ? null
      : new Error('startup_player_payload_unparseable:' + task.id + ':' + task.domain);
  }
  if ((!PLAYER_PROJECTABLE_DOMAIN_SET.has(task.domain) && task.domain !== PLAYER_FALLBACK_SNAPSHOT_DOMAIN)
    || !normalizePlayerSnapshotProjectionPayload(task.payloadJson)) {
    return new Error('startup_player_payload_unsupported:' + task.id + ':' + task.domain);
  }
  return null;
}

export function assertReplayableInstancePayloads(tasks: FlushTask[]): void {
  for (const task of tasks) {
    const error = findNonReplayableInstancePayloadError(task);
    if (error) {
      throw error;
    }
  }
}

export function findNonReplayableInstancePayloadError(task: FlushTask): Error | null {
  const statePayload = normalizeInstanceDomainStatePayload(task.payloadJson);
  const deltaPayload = normalizeInstanceDomainDeltaPayload(task.payloadJson);
  if (!statePayload && !deltaPayload) {
    return new Error('startup_instance_payload_unparseable:' + task.id + ':' + task.domain + ':' + String(task.ownershipEpoch ?? 0));
  }
  const payloadDomain = statePayload?.domain ?? deltaPayload?.domain ?? '';
  if (payloadDomain !== task.domain) {
    return new Error('startup_instance_payload_domain_mismatch:' + task.id + ':' + task.domain + ':' + payloadDomain);
  }
  if (statePayload && !INSTANCE_PAYLOAD_STATE_DOMAINS.has(payloadDomain)) {
    return new Error('startup_instance_state_payload_unsupported:' + task.id + ':' + payloadDomain);
  }
  if (deltaPayload && !INSTANCE_PAYLOAD_BATCH_DOMAINS.has(payloadDomain)) {
    return new Error('startup_instance_delta_payload_unsupported:' + task.id + ':' + payloadDomain);
  }
  return null;
}

export function waitForReplayPoll(delayMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, Math.max(25, Math.trunc(Number(delayMs) || STARTUP_PAYLOAD_REPLAY_POLL_MS)));
  });
}

export function normalizeInstanceDomainDeltaPayload(value: unknown): InstanceDomainDeltaPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND || typeof record.domain !== 'string') {
    return null;
  }
  return {
    kind: INSTANCE_DOMAIN_DELTA_PAYLOAD_KIND,
    domain: record.domain,
    fullReplace: record.fullReplace === true,
    upserts: Array.isArray(record.upserts) ? record.upserts : [],
    deletes: Array.isArray(record.deletes) ? record.deletes : [],
    entries: Array.isArray(record.entries) ? record.entries : [],
    revision: normalizeOptionalRevision(record.revision),
    domainRevisions: normalizeDomainRevisionRecord(record.domainRevisions),
    stagedDomains: normalizeStringArray(record.stagedDomains),
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? undefined,
    watermarkPayload: record.watermarkPayload,
  };
}

export function normalizePlayerPresencePayload(value: unknown): PlayerPresenceFlushPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  const presenceRecord = record.kind === PLAYER_PRESENCE_PAYLOAD_KIND
    && record.presence
    && typeof record.presence === 'object'
    ? record.presence as Record<string, unknown>
    : record;
  if (typeof presenceRecord.online !== 'boolean' || typeof presenceRecord.inWorld !== 'boolean') {
    return null;
  }
  const runtimeOwnerId = normalizeNullableString(record.runtimeOwnerId ?? presenceRecord.runtimeOwnerId);
  const sessionEpoch = normalizeNullableNumber(record.sessionEpoch ?? presenceRecord.sessionEpoch);
  const versionSeed = normalizeNullableNumber(presenceRecord.versionSeed);
  if ((sessionEpoch === null || sessionEpoch < 0) && versionSeed === null) {
    return null;
  }
  return {
    kind: PLAYER_PRESENCE_PAYLOAD_KIND,
    presence: {
      online: presenceRecord.online === true,
      inWorld: presenceRecord.inWorld === true,
      lastHeartbeatAt: normalizeNullableNumber(presenceRecord.lastHeartbeatAt),
      offlineSinceAt: normalizeNullableNumber(presenceRecord.offlineSinceAt),
      runtimeOwnerId,
      sessionEpoch,
      transferState: normalizeNullableString(presenceRecord.transferState),
      transferTargetNodeId: normalizeNullableString(presenceRecord.transferTargetNodeId),
      versionSeed,
    },
    domainRevision: normalizeOptionalRevision(record.domainRevision) ?? 0,
    runtimeRevision: normalizeOptionalRevision(record.runtimeRevision) ?? 0,
    projectionVersion: normalizeOptionalRevision(record.projectionVersion)
      ?? normalizeOptionalRevision(presenceRecord.versionSeed)
      ?? 0,
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? '',
    stagingDomain: normalizeNullableString(record.stagingDomain) ?? undefined,
    hasExplicitProjectionVersion: record.projectionVersion !== undefined,
    runtimeOwnerId,
    sessionEpoch,
  };
}

export function normalizePlayerSnapshotProjectionPayload(value: unknown): PlayerSnapshotProjectionPayload | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.kind !== PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND || !record.snapshot || typeof record.snapshot !== 'object') {
    return null;
  }
  const presenceRecord = record.presence && typeof record.presence === 'object'
    ? record.presence as Record<string, unknown>
    : null;
  const presence = presenceRecord
    && typeof presenceRecord.online === 'boolean'
    && typeof presenceRecord.inWorld === 'boolean'
    ? {
        online: presenceRecord.online === true,
        inWorld: presenceRecord.inWorld === true,
        lastHeartbeatAt: normalizeNullableNumber(presenceRecord.lastHeartbeatAt),
        offlineSinceAt: normalizeNullableNumber(presenceRecord.offlineSinceAt),
        runtimeOwnerId: normalizeNullableString(presenceRecord.runtimeOwnerId),
        sessionEpoch: normalizeNullableNumber(presenceRecord.sessionEpoch),
        transferState: normalizeNullableString(presenceRecord.transferState),
        transferTargetNodeId: normalizeNullableString(presenceRecord.transferTargetNodeId),
      }
    : null;
  return {
    kind: PLAYER_SNAPSHOT_PROJECTION_PAYLOAD_KIND,
    snapshot: record.snapshot as PersistedPlayerSnapshot,
    projectedDomains: normalizeStringArray(record.projectedDomains),
    domainRevision: normalizeOptionalRevision(record.domainRevision) ?? 0,
    runtimeRevision: normalizeOptionalRevision(record.runtimeRevision) ?? 0,
    projectionVersion: normalizeOptionalRevision(record.projectionVersion)
      ?? normalizeOptionalRevision((record.snapshot as Record<string, unknown>).savedAt)
      ?? 0,
    stagingGenerationId: normalizeNullableString(record.stagingGenerationId) ?? '',
    stagingDomain: normalizeNullableString(record.stagingDomain) ?? undefined,
    hasExplicitProjectionVersion: record.projectionVersion !== undefined,
    runtimeOwnerId: normalizeNullableString(record.runtimeOwnerId),
    sessionEpoch: normalizeNullableNumber(record.sessionEpoch),
    presence,
  };
}

export function resolvePlayerPayloadRuntimeOwnerId(payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  if ('snapshot' in payload) {
    return payload.runtimeOwnerId ?? null;
  }
  return payload.runtimeOwnerId ?? null;
}

export function buildPlayerPayloadFencingToken(payload: PlayerPresenceFlushPayload | PlayerSnapshotProjectionPayload | null): string | null {
  if (!payload) {
    return null;
  }
  const source = `${payload.stagingGenerationId}:${payload.runtimeOwnerId ?? 'none'}:${Math.max(0, Math.trunc(Number(payload.sessionEpoch ?? 0)))}`;
  return `player:${createHash('sha256').update(source).digest('hex')}`;
}

export function resolvePlayerTaskDomains(domains: Set<string>): string[] {
  return Array.from(domains).sort();
}

export function resolvePlayerStageDelayMs(domain: string): number {
  if (domain === 'presence') return PLAYER_PRESENCE_COALESCE_MS;
  if (domain === 'position_checkpoint' || domain === 'world_anchor') return PLAYER_LOCATION_COALESCE_MS;
  if (PLAYER_HIGH_PRIORITY_DOMAINS.has(domain)) return 0;
  return PLAYER_BACKGROUND_COALESCE_MS;
}

export function resolveInstanceStageDelayMs(domain: string, stagedDomains: string[]): number {
  if (domain === 'time' || stagedDomains.includes('time')) return TIME_CHECKPOINT_MS;
  if (domain === 'monster_runtime' || stagedDomains.includes('monster_runtime')) return MONSTER_RUNTIME_MS;
  if (INSTANCE_COALESCE_DOMAINS.has(domain) || stagedDomains.some((entry) => INSTANCE_COALESCE_DOMAINS.has(entry))) {
    return COALESCE_MS;
  }
  return 0;
}

export function playerStageThrottleKey(playerId: string, domain: string): string {
  return `${playerId}\u0000${domain}`;
}

export function instanceStageThrottleKey(instanceId: string, domain: string, ownershipEpoch: number): string {
  return `${instanceId}\u0000${domain}\u0000${ownershipEpoch}`;
}

export function pruneExpiredStageThrottleEntries(entries: Map<string, number>, expiredBefore: number): void {
  for (const [key, nextStageAt] of entries) {
    if (nextStageAt < expiredBefore) {
      entries.delete(key);
    }
  }
}

export function resolveFlushTaskPriority(scope: FlushTaskScope, domain: string): FlushTaskPriority {
  if (scope === 'player') {
    return PLAYER_HIGH_PRIORITY_DOMAINS.has(domain) ? 'high' : 'normal';
  }
  if (INSTANCE_LOW_PRIORITY_DOMAINS.has(domain)) {
    return 'low';
  }
  if (INSTANCE_NORMAL_PRIORITY_DOMAINS.has(domain)) {
    return 'normal';
  }
  return 'normal';
}

export function playerTaskKey(task: FlushTask): string {
  return `${task.id}\u0000${task.domain}`;
}

export function stagingFlushTaskKey(task: FlushTask): string {
  return task.scope === 'player'
    ? `player\u0000${task.id}\u0000${task.domain}`
    : `instance\u0000${task.id}\u0000${task.domain}\u0000${Math.max(0, Math.trunc(Number(task.ownershipEpoch ?? 0)))}`;
}

export function stagingFlushTaskIdentityKey(identity: FlushTaskUpsertIdentity): string {
  return identity.scope === 'player'
    ? `player\u0000${identity.id}\u0000${identity.domain}`
    : `instance\u0000${identity.id}\u0000${identity.domain}\u0000${Math.max(0, Math.trunc(Number(identity.ownershipEpoch ?? 0)))}`;
}

export function dedupeStagingFlushTaskIdentities(tasks: FlushTask[]): Map<string, FlushTaskUpsertIdentity> {
  const identities = new Map<string, FlushTaskUpsertIdentity>();
  for (const task of tasks) {
    const identity: FlushTaskUpsertIdentity = {
      scope: task.scope,
      id: task.id,
      domain: task.domain,
      ownershipEpoch: task.scope === 'instance'
        ? Math.max(0, Math.trunc(Number(task.ownershipEpoch ?? 0)))
        : null,
    };
    identities.set(stagingFlushTaskIdentityKey(identity), identity);
  }
  return identities;
}

export function playerGroupKey(tasks: FlushTask[]): string {
  const first = tasks[0];
  if (!first) {
    return 'player-group:empty';
  }
  return `${first.id}\u0000${tasks.map((task) => task.domain).sort().join('\u0001')}`;
}

export function instanceTaskKey(task: FlushTask): string {
  return `${task.id}\u0000${task.domain}\u0000${task.ownershipEpoch ?? 0}`;
}

export function buildInstanceTaskLedgerClaim(task: FlushTask): InstanceFlushLedgerClaim | null {
  const claimOwnerId = normalizeString(task.claimOwnerId);
  if (!claimOwnerId) {
    return null;
  }
  return {
    ownershipEpoch: normalizeInt(task.ownershipEpoch, 0, 0, Number.MAX_SAFE_INTEGER),
    latestVersion: normalizeInt(task.latestRevision, 0, 0, Number.MAX_SAFE_INTEGER),
    claimOwnerId,
    fencingToken: normalizeNullableString(task.fencingToken),
  };
}

export function instanceGroupKey(tasks: FlushTask[]): string {
  const first = tasks[0];
  if (!first) {
    return 'instance-group:empty';
  }
  return `${first.id}\u0000${first.ownershipEpoch ?? 0}\u0000${tasks.map((task) => task.domain).sort().join('\u0001')}`;
}

export function groupTasksById(tasks: FlushTask[]): Map<string, FlushTask[]> {
  const grouped = new Map<string, FlushTask[]>();
  for (const task of tasks) grouped.set(task.id, [...(grouped.get(task.id) ?? []), task]);
  return grouped;
}

export function groupInstanceTasksByRuntime(tasks: Iterable<FlushTask>): Map<string, FlushTask[]> {
  const grouped = new Map<string, FlushTask[]>();
  for (const task of tasks) {
    const key = `${task.id}\u0000${task.ownershipEpoch ?? 0}`;
    grouped.set(key, [...(grouped.get(key) ?? []), task]);
  }
  return grouped;
}

export function normalizeDomains(domains: Iterable<string> | null | undefined): Set<string> {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) if (typeof domain === 'string' && domain.trim()) normalized.add(domain.trim());
  return normalized;
}

export function sumProcessedCounts(values: unknown): number {
  if (!Array.isArray(values)) {
    return 0;
  }
  return values.reduce((sum, value) => sum + (Number.isFinite(Number(value)) ? Math.max(0, Math.trunc(Number(value))) : 0), 0);
}

export function normalizeString(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  return '';
}

export function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

export function resolveRevision(value: unknown): number {
  return normalizeInt(value, Date.now(), 0, Number.MAX_SAFE_INTEGER);
}

export function normalizeInt(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value === 'string' && value.trim() === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const normalized = Math.trunc(parsed);
  return normalized < min || normalized > max ? fallback : normalized;
}

export function readInt(primary: string, fallbackKey: string, fallback: number, min: number, max: number): number {
  return normalizeInt(readTrimmedEnv(primary, fallbackKey), fallback, min, max);
}

export function normalizeBuildingRoomFengShuiPayload(payload: unknown): Record<string, unknown> {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const buildings = dedupeByLast(Array.isArray(source.buildings) ? source.buildings : [], (entry) => {
    const record = entry as { id?: unknown; buildingId?: unknown; building_id?: unknown };
    return normalizeString(record.id) || normalizeString(record.buildingId) || normalizeString(record.building_id);
  });
  return {
    ...source,
    buildings: buildings.map((entry) => {
      const record = entry && typeof entry === 'object' ? entry as Record<string, unknown> : {};
      return {
        ...record,
        cells: dedupeByLast(Array.isArray(record.cells) ? record.cells : [], (cell) => {
          const cellRecord = cell as { tileIndex?: unknown; tile_index?: unknown };
          return normalizeString(cellRecord.tileIndex) || normalizeString(cellRecord.tile_index);
        }),
      };
    }),
    rooms: dedupeByLast(Array.isArray(source.rooms) ? source.rooms : [], (entry) => {
      const record = entry as { id?: unknown; roomId?: unknown; room_id?: unknown };
      return normalizeString(record.id) || normalizeString(record.roomId) || normalizeString(record.room_id);
    }),
    roomCells: dedupeByLast(Array.isArray(source.roomCells) ? source.roomCells : [], (entry) => {
      const record = entry as { tileIndex?: unknown; tile_index?: unknown };
      return normalizeString(record.tileIndex) || normalizeString(record.tile_index);
    }),
    fengShui: dedupeByLast(Array.isArray(source.fengShui) ? source.fengShui : [], (entry) => {
      const record = entry as { roomId?: unknown; room_id?: unknown };
      return normalizeString(record.roomId) || normalizeString(record.room_id);
    }),
  };
}

export function normalizeBuildingRoomFengShuiDomains(domains: readonly string[]): BuildingRoomFengShuiPersistenceDomain[] {
  return domains.filter((domain): domain is BuildingRoomFengShuiPersistenceDomain =>
    domain === 'building' || domain === 'room' || domain === 'fengshui');
}

export function selectBuildingRoomFengShuiPayload(payload: unknown, domains: readonly string[]): Record<string, unknown> {
  const source = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const selectedDomains = new Set(normalizeBuildingRoomFengShuiDomains(domains));
  return {
    ...(selectedDomains.has('building') ? { buildings: Array.isArray(source.buildings) ? source.buildings : [] } : {}),
    ...(selectedDomains.has('room') ? {
      rooms: Array.isArray(source.rooms) ? source.rooms : [],
      roomCells: Array.isArray(source.roomCells) ? source.roomCells : [],
    } : {}),
    ...(selectedDomains.has('fengshui') ? { fengShui: Array.isArray(source.fengShui) ? source.fengShui : [] } : {}),
  };
}

export function dedupeByLast<T>(items: T[], keyOf: (item: T) => string): T[] {
  const byKey = new Map<string, T>();
  const keyOrder: string[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (!key) {
      continue;
    }
    if (!byKey.has(key)) {
      keyOrder.push(key);
    }
    byKey.set(key, item);
  }
  return keyOrder.map((key) => byKey.get(key)).filter((item): item is T => item !== undefined);
}

export function keyedString(...parts: unknown[]): string {
  const normalized = parts.map((part) => normalizeString(part));
  return normalized.every((part) => part.length > 0) ? normalized.join('\u0000') : '';
}

export async function runConcurrent<T>(
  values: T[],
  parallelism: number,
  worker: (value: T) => Promise<void>,
): Promise<void> {
  const normalizedParallelism = Math.max(1, Math.trunc(Number(parallelism) || 1));
  for (let index = 0; index < values.length; index += normalizedParallelism) {
    const slice = values.slice(index, index + normalizedParallelism);
    await Promise.all(slice.map((value) => worker(value)));
  }
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.stack || error.message : String(error);
}
