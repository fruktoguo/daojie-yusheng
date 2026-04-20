import { Injectable, Logger } from '@nestjs/common';
import {
  containsInvisibleOnlyNameGrapheme,
  getGraphemeCount,
  hasVisibleNameGrapheme,
  resolveDefaultVisibleDisplayName,
} from '@mud/shared-next';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type ValidatedPlayerTokenPayload,
  WorldPlayerTokenCodecService,
} from './world-player-token-codec.service';

const TRACE_FILE_ENV_VAR = 'NEXT_AUTH_TRACE_FILE';
const TRACE_RECORD_LIMIT = 256;
const AUTH_TRACE_ENABLE_ENV_KEYS = [
  'SERVER_NEXT_AUTH_TRACE_ENABLED',
  'NEXT_AUTH_TRACE_ENABLED',
] as const;
const AUTH_TRACE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const AUTH_TRACE_PURPOSE = 'debug_and_audit_summary';

type AuthTraceCountMap = Record<string, number>;
type TokenKind = 'access' | 'refresh';

interface AuthTraceEntry {
  type: string;
  outcome?: string | null;
  reason?: string | null;
  userId?: string | null;
  playerId?: string | null;
  username?: string | null;
  role?: string | null;
  tokenKind?: string | null;
  tokenIdentityReady?: boolean | null;
  source?: string | null;
  persistedSource?: string | null;
  persistenceEnabled?: boolean | null;
  nextLoadHit?: boolean | null;
  compatTried?: boolean | null;
  persistAttempted?: boolean | null;
  persistSucceeded?: boolean | null;
  persistFailureStage?: string | null;
  fallbackHit?: boolean | null;
  allowLegacyFallback?: boolean | null;
  fallbackReason?: string | null;
  seedPersisted?: boolean | null;
  identityPersistedSource?: string | null;
  failureStage?: string | null;
  protocol?: string | null;
  entryPath?: string | null;
  identitySource?: string | null;
  snapshotSource?: string | null;
  snapshotPersistedSource?: string | null;
  recoveryOutcome?: string | null;
  recoveryReason?: string | null;
  recoveryIdentityPersistedSource?: string | null;
  recoverySnapshotPersistedSource?: string | null;
  requestedSessionId?: string | null;
  gm?: boolean | null;
  linkedIdentitySource?: string | null;
  linkedSnapshotSource?: string | null;
  linkedSnapshotPersistedSource?: string | null;
  [key: string]: unknown;
}

interface AuthTraceRecord extends AuthTraceEntry {
  timestamp: number;
}

interface AuthTraceState {
  enabled: boolean;
  records: AuthTraceRecord[];
  filePath: string | null;
  filePrepared: boolean;
  fileErrored: boolean;
}

interface AuthTraceTokenSummary {
  acceptCount: number;
  rejectCount: number;
  rejectReasonCounts: AuthTraceCountMap;
  tokenKindCounts: AuthTraceCountMap;
}

interface AuthTraceIdentitySummary {
  sourceCounts: AuthTraceCountMap;
  persistedSourceCounts: AuthTraceCountMap;
  persistenceEnabledCount: number;
  nextLoadHitCount: number;
  compatTriedCount: number;
  persistAttemptedCount: number;
  persistSucceededCount: number;
  persistFailedCount: number;
  persistFailureStageCounts: AuthTraceCountMap;
}

interface AuthTraceSnapshotSummary {
  sourceCounts: AuthTraceCountMap;
  persistedSourceCounts: AuthTraceCountMap;
  fallbackHitCount: number;
  allowLegacyFallbackCount: number;
  fallbackReasonCounts: AuthTraceCountMap;
  seedPersistedCount: number;
}

interface AuthTraceSnapshotRecoverySummary {
  count: number;
  successCount: number;
  blockedCount: number;
  failedCount: number;
  reasonCounts: AuthTraceCountMap;
  persistedSourceCounts: AuthTraceCountMap;
  identityPersistedSourceCounts: AuthTraceCountMap;
  failureStageCounts: AuthTraceCountMap;
}

interface AuthTraceBootstrapSummary {
  count: number;
  protocolCounts: AuthTraceCountMap;
  gmCount: number;
  requestedSessionCount: number;
  entryPathCounts: AuthTraceCountMap;
  identitySourceCounts: AuthTraceCountMap;
  identityPersistedSourceCounts: AuthTraceCountMap;
  snapshotSourceCounts: AuthTraceCountMap;
  snapshotPersistedSourceCounts: AuthTraceCountMap;
  recoveryOutcomeCounts: AuthTraceCountMap;
  recoveryReasonCounts: AuthTraceCountMap;
  recoveryIdentityPersistedSourceCounts: AuthTraceCountMap;
  recoverySnapshotPersistedSourceCounts: AuthTraceCountMap;
  linkedSourceCounts: AuthTraceCountMap;
  linkedPersistedSourceCounts: AuthTraceCountMap;
}

interface AuthTraceSummary {
  recordCount: number;
  typeCounts: AuthTraceCountMap;
  token: AuthTraceTokenSummary;
  identity: AuthTraceIdentitySummary;
  snapshot: AuthTraceSnapshotSummary;
  snapshotRecovery: AuthTraceSnapshotRecoverySummary;
  bootstrap: AuthTraceBootstrapSummary;
}

interface AuthTraceSnapshotResult {
  purpose: string;
  completionDefinition: boolean;
  boundedRecords: boolean;
  enabled: boolean;
  limit: number;
  records: AuthTraceRecord[];
  filePath: string | null;
  fileErrored: boolean;
  summary: AuthTraceSummary;
}

interface AuthTraceClearResult {
  ok: true;
  enabled: boolean;
  filePath: string | null;
}

interface PlayerIdentityFromPayload {
  userId: string;
  username: string;
  displayName: string;
  playerId: string;
  playerName: string;
}

declare global {
  var __NEXT_AUTH_TRACE: AuthTraceState | undefined;
}

/** 玩家认证 trace 服务：记录鉴权、回填和 bootstrap 的调试轨迹。 */
function resolveTraceFilePath(): string | null {
  const configured = typeof process.env[TRACE_FILE_ENV_VAR] === 'string'
    ? process.env[TRACE_FILE_ENV_VAR].trim()
    : '';
  if (!configured) {
    return null;
  }

  return path.resolve(configured);
}

/** 读取 trace 开关。 */
function isAuthTraceEnabled(): boolean {
  for (const key of AUTH_TRACE_ENABLE_ENV_KEYS) {
    const configured = typeof process.env[key] === 'string' ? process.env[key].trim().toLowerCase() : '';
    if (AUTH_TRACE_TRUE_VALUES.has(configured)) {
      return true;
    }
  }

  return false;
}

/** 初始化或读取全局 trace 状态。 */
export function ensureAuthTraceState(): AuthTraceState {
  if (!globalThis.__NEXT_AUTH_TRACE) {
    globalThis.__NEXT_AUTH_TRACE = {
      enabled: isAuthTraceEnabled(),
      records: [],
      filePath: resolveTraceFilePath(),
      filePrepared: false,
      fileErrored: false,
    };
  }

  return globalThis.__NEXT_AUTH_TRACE;
}

/** 追加一条认证 trace 记录。 */
export function recordAuthTrace(entry: AuthTraceEntry): void {
  const trace = ensureAuthTraceState();
  if (!trace.enabled) {
    return;
  }

  const payload: AuthTraceRecord = {
    timestamp: Date.now(),
    ...entry,
  };
  trace.records.push(payload);
  if (trace.records.length > TRACE_RECORD_LIMIT) {
    trace.records.splice(0, trace.records.length - TRACE_RECORD_LIMIT);
  }

  appendTraceFile(trace, payload);
}

/** 读取当前认证 trace 快照。 */
export function readAuthTrace(): AuthTraceSnapshotResult {
  const trace = ensureAuthTraceState();
  const summary = buildAuthTraceSummary(trace.records);
  return {
    purpose: AUTH_TRACE_PURPOSE,
    completionDefinition: false,
    boundedRecords: true,
    enabled: trace.enabled,
    limit: TRACE_RECORD_LIMIT,
    records: trace.records.slice(),
    filePath: trace.filePath,
    fileErrored: trace.fileErrored,
    summary,
  };
}

/** 清空认证 trace。 */
export function clearAuthTrace(): AuthTraceClearResult {
  const trace = ensureAuthTraceState();
  trace.records.length = 0;
  if (trace.filePath) {
    try {
      fs.writeFileSync(trace.filePath, '', { encoding: 'utf8' });
    } catch {
      trace.fileErrored = true;
    }
  }

  return {
    ok: true,
    enabled: trace.enabled,
    filePath: trace.filePath,
  };
}

/** 将单条 trace 同步写入文件。 */
function appendTraceFile(trace: AuthTraceState, entry: AuthTraceRecord): void {
  if (trace.fileErrored || !trace.filePath) {
    return;
  }

  if (!trace.filePrepared) {
    try {
      fs.mkdirSync(path.dirname(trace.filePath), { recursive: true });
      fs.writeFileSync(trace.filePath, '', { flag: 'a', encoding: 'utf8' });
      trace.filePrepared = true;
    } catch {
      trace.fileErrored = true;
      return;
    }
  }

  try {
    fs.appendFileSync(trace.filePath, `${JSON.stringify(entry)}\n`, { encoding: 'utf8' });
  } catch {
    trace.fileErrored = true;
  }
}

/** 汇总认证 trace 为可读统计。 */
function buildAuthTraceSummary(records: readonly AuthTraceRecord[]): AuthTraceSummary {
  const typeCounts: AuthTraceCountMap = {};
  const token: AuthTraceTokenSummary = {
    acceptCount: 0,
    rejectCount: 0,
    rejectReasonCounts: {},
    tokenKindCounts: {},
  };
  const identity: AuthTraceIdentitySummary = {
    sourceCounts: {},
    persistedSourceCounts: {},
    persistenceEnabledCount: 0,
    nextLoadHitCount: 0,
    compatTriedCount: 0,
    persistAttemptedCount: 0,
    persistSucceededCount: 0,
    persistFailedCount: 0,
    persistFailureStageCounts: {},
  };
  const snapshot: AuthTraceSnapshotSummary = {
    sourceCounts: {},
    persistedSourceCounts: {},
    fallbackHitCount: 0,
    allowLegacyFallbackCount: 0,
    fallbackReasonCounts: {},
    seedPersistedCount: 0,
  };
  const snapshotRecovery: AuthTraceSnapshotRecoverySummary = {
    count: 0,
    successCount: 0,
    blockedCount: 0,
    failedCount: 0,
    reasonCounts: {},
    persistedSourceCounts: {},
    identityPersistedSourceCounts: {},
    failureStageCounts: {},
  };
  const bootstrap: AuthTraceBootstrapSummary = {
    count: 0,
    protocolCounts: {},
    gmCount: 0,
    requestedSessionCount: 0,
    entryPathCounts: {},
    identitySourceCounts: {},
    identityPersistedSourceCounts: {},
    snapshotSourceCounts: {},
    snapshotPersistedSourceCounts: {},
    recoveryOutcomeCounts: {},
    recoveryReasonCounts: {},
    recoveryIdentityPersistedSourceCounts: {},
    recoverySnapshotPersistedSourceCounts: {},
    linkedSourceCounts: {},
    linkedPersistedSourceCounts: {},
  };

  const latestIdentityByPlayerId = new Map<string, string>();
  const latestSnapshotByPlayerId = new Map<string, string>();
  const latestSnapshotPersistedSourceByPlayerId = new Map<string, string>();

  for (const entry of records) {
    const type = typeof entry.type === 'string' ? entry.type : 'unknown';
    incrementSummaryCount(typeCounts, type);
    if (type === 'token') {
      const outcome = typeof entry.outcome === 'string' ? entry.outcome : 'unknown';
      if (outcome === 'accept') {
        token.acceptCount += 1;
      } else if (outcome === 'reject') {
        token.rejectCount += 1;
        incrementSummaryCount(token.rejectReasonCounts, entry.reason);
      }

      incrementSummaryCount(token.tokenKindCounts, entry.tokenKind);
      continue;
    }

    if (type === 'identity') {
      const source = typeof entry.source === 'string' ? entry.source : 'unknown';
      incrementSummaryCount(identity.sourceCounts, source);
      if (typeof entry.persistedSource === 'string' && entry.persistedSource) {
        incrementSummaryCount(identity.persistedSourceCounts, entry.persistedSource);
      }
      if (entry.persistenceEnabled === true) {
        identity.persistenceEnabledCount += 1;
      }
      if (entry.nextLoadHit === true) {
        identity.nextLoadHitCount += 1;
      }
      if (entry.compatTried === true) {
        identity.compatTriedCount += 1;
      }
      if (entry.persistAttempted === true) {
        identity.persistAttemptedCount += 1;
      }
      if (entry.persistSucceeded === true) {
        identity.persistSucceededCount += 1;
      } else if (entry.persistSucceeded === false) {
        identity.persistFailedCount += 1;
      }
      if (typeof entry.persistFailureStage === 'string' && entry.persistFailureStage) {
        incrementSummaryCount(identity.persistFailureStageCounts, entry.persistFailureStage);
      }

      const playerId = typeof entry.playerId === 'string' ? entry.playerId : '';
      if (playerId) {
        latestIdentityByPlayerId.set(playerId, source);
      }
      continue;
    }

    if (type === 'snapshot') {
      const source = typeof entry.source === 'string' ? entry.source : 'unknown';
      incrementSummaryCount(snapshot.sourceCounts, source);
      if (typeof entry.persistedSource === 'string' && entry.persistedSource) {
        incrementSummaryCount(snapshot.persistedSourceCounts, entry.persistedSource);
      }
      if (entry.fallbackHit === true) {
        snapshot.fallbackHitCount += 1;
      }
      if (entry.allowLegacyFallback === true) {
        snapshot.allowLegacyFallbackCount += 1;
      }
      if (typeof entry.fallbackReason === 'string' && entry.fallbackReason) {
        incrementSummaryCount(snapshot.fallbackReasonCounts, entry.fallbackReason);
      }
      if (entry.seedPersisted === true) {
        snapshot.seedPersistedCount += 1;
      }

      const playerId = typeof entry.playerId === 'string' ? entry.playerId : '';
      if (playerId) {
        latestSnapshotByPlayerId.set(playerId, source);
        latestSnapshotPersistedSourceByPlayerId.set(
          playerId,
          typeof entry.persistedSource === 'string' && entry.persistedSource ? entry.persistedSource : 'none',
        );
      }
      continue;
    }

    if (type === 'snapshot_recovery') {
      snapshotRecovery.count += 1;
      const outcome = typeof entry.outcome === 'string' ? entry.outcome : 'unknown';
      if (outcome === 'success') {
        snapshotRecovery.successCount += 1;
      } else if (outcome === 'blocked') {
        snapshotRecovery.blockedCount += 1;
      } else if (outcome === 'failure') {
        snapshotRecovery.failedCount += 1;
      }
      if (typeof entry.reason === 'string' && entry.reason) {
        incrementSummaryCount(snapshotRecovery.reasonCounts, entry.reason);
      }
      if (typeof entry.persistedSource === 'string' && entry.persistedSource) {
        incrementSummaryCount(snapshotRecovery.persistedSourceCounts, entry.persistedSource);
      }
      if (typeof entry.identityPersistedSource === 'string' && entry.identityPersistedSource) {
        incrementSummaryCount(snapshotRecovery.identityPersistedSourceCounts, entry.identityPersistedSource);
      }
      if (typeof entry.failureStage === 'string' && entry.failureStage) {
        incrementSummaryCount(snapshotRecovery.failureStageCounts, entry.failureStage);
      }
      continue;
    }

    if (type === 'bootstrap') {
      bootstrap.count += 1;
      incrementSummaryCount(bootstrap.protocolCounts, entry.protocol);
      incrementSummaryCount(bootstrap.entryPathCounts, entry.entryPath);
      incrementSummaryCount(bootstrap.identitySourceCounts, entry.identitySource);
      incrementSummaryCount(bootstrap.identityPersistedSourceCounts, entry.identityPersistedSource ?? 'none');
      incrementSummaryCount(bootstrap.snapshotSourceCounts, entry.snapshotSource ?? 'none');
      incrementSummaryCount(bootstrap.snapshotPersistedSourceCounts, entry.snapshotPersistedSource ?? 'none');
      incrementSummaryCount(bootstrap.recoveryOutcomeCounts, entry.recoveryOutcome ?? 'none');
      incrementSummaryCount(bootstrap.recoveryReasonCounts, entry.recoveryReason ?? 'none');
      incrementSummaryCount(bootstrap.recoveryIdentityPersistedSourceCounts, entry.recoveryIdentityPersistedSource ?? 'none');
      incrementSummaryCount(bootstrap.recoverySnapshotPersistedSourceCounts, entry.recoverySnapshotPersistedSource ?? 'none');
      if (typeof entry.requestedSessionId === 'string' && entry.requestedSessionId) {
        bootstrap.requestedSessionCount += 1;
      }
      if (entry.gm === true) {
        bootstrap.gmCount += 1;
      }

      const playerId = typeof entry.playerId === 'string' ? entry.playerId : '';
      const linkedIdentitySource = typeof entry.linkedIdentitySource === 'string' && entry.linkedIdentitySource
        ? entry.linkedIdentitySource
        : playerId ? (latestIdentityByPlayerId.get(playerId) ?? 'unknown') : 'unknown';
      const linkedSnapshotSource = typeof entry.linkedSnapshotSource === 'string' && entry.linkedSnapshotSource
        ? entry.linkedSnapshotSource
        : playerId ? (latestSnapshotByPlayerId.get(playerId) ?? 'unknown') : 'unknown';
      const linkedSnapshotPersistedSource = typeof entry.linkedSnapshotPersistedSource === 'string' && entry.linkedSnapshotPersistedSource
        ? entry.linkedSnapshotPersistedSource
        : playerId ? (latestSnapshotPersistedSourceByPlayerId.get(playerId) ?? 'none') : 'none';

      incrementSummaryCount(bootstrap.linkedSourceCounts, `${linkedIdentitySource}|${linkedSnapshotSource}`);
      incrementSummaryCount(bootstrap.linkedPersistedSourceCounts, linkedSnapshotPersistedSource);
    }
  }

  return {
    recordCount: records.length,
    typeCounts,
    token,
    identity,
    snapshot,
    snapshotRecovery,
    bootstrap,
  };
}

function incrementSummaryCount(target: AuthTraceCountMap, key: unknown): void {
  const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
  target[normalizedKey] = (target[normalizedKey] ?? 0) + 1;
}

@Injectable()
export class WorldPlayerTokenService {
  private readonly logger = new Logger(WorldPlayerTokenService.name);

  constructor(
    private readonly worldPlayerTokenCodecService: WorldPlayerTokenCodecService,
  ) {}

  validatePlayerToken(token: string): ValidatedPlayerTokenPayload | null {
    const payload = this.worldPlayerTokenCodecService.validateAccessToken(token);
    if (!payload) {
      this.logger.debug('拒绝玩家令牌：access token 无效');
      recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'invalid_access_token' });
      return null;
    }

    const tokenKind = resolvePlayerTokenKind(payload);
    if (payload.role === 'gm') {
      this.logger.debug('拒绝玩家令牌：GM 令牌不能当作玩家令牌使用');
      recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'gm_role_not_player' });
      return null;
    }
    if (tokenKind === 'refresh') {
      this.logger.debug('拒绝玩家令牌：不允许使用 refresh token');
      recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'refresh_token_not_allowed' });
      return null;
    }
    if (typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      this.logger.debug('拒绝玩家令牌：缺少 sub 或 username');
      recordAuthTrace({ type: 'token', outcome: 'reject', reason: 'missing_sub_or_username' });
      return null;
    }

    recordAuthTrace({
      type: 'token',
      outcome: 'accept',
      userId: payload.sub,
      playerId: typeof payload.playerId === 'string' && payload.playerId.trim() ? payload.playerId.trim() : payload.sub,
      username: payload.username,
      role: typeof payload.role === 'string' ? payload.role : 'player',
      tokenKind,
      tokenIdentityReady: this.resolvePlayerIdentityFromPayload(payload) !== null,
    });
    return payload;
  }

  resolvePlayerIdentityFromPayload(
    payload: ValidatedPlayerTokenPayload | null | undefined,
  ): PlayerIdentityFromPayload | null {
    const userId = typeof payload?.sub === 'string' ? payload.sub.trim() : '';
    const username = typeof payload?.username === 'string' ? payload.username.trim() : '';
    const playerId = typeof payload?.playerId === 'string' && payload.playerId.trim()
      ? payload.playerId.trim()
      : (userId ? `p_${userId}` : '');
    const displayName = normalizeDisplayName(payload?.displayName, username);
    const playerName = normalizePlayerName(payload?.playerName, displayName, username);
    if (!userId || !username || !playerId || !playerName) {
      return null;
    }

    return {
      userId,
      username,
      displayName,
      playerId,
      playerName,
    };
  }
}

function resolvePlayerTokenKind(payload: ValidatedPlayerTokenPayload): TokenKind {
  const kind = typeof payload.kind === 'string' ? payload.kind.trim().toLowerCase() : '';
  if (kind === 'access' || kind === 'refresh') {
    return kind;
  }

  const scope = typeof payload.scope === 'string' ? payload.scope.trim().toLowerCase() : '';
  if (scope === 'access' || scope === 'refresh') {
    return scope;
  }

  return 'access';
}

function normalizeDisplayName(displayName: unknown, username: string): string {
  const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
  if (isValidVisibleDisplayName(normalized)) {
    return normalized;
  }

  const normalizedUsername = typeof username === 'string' ? username.trim().normalize('NFC') : '';
  return resolveDefaultVisibleDisplayName(normalizedUsername);
}

function normalizePlayerName(playerName: unknown, displayName: string, username: string): string {
  const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
  if (normalized) {
    return normalized;
  }
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim().normalize('NFC');
  }

  return typeof username === 'string' ? username.trim().normalize('NFC') : '';
}

function isValidVisibleDisplayName(value: string): boolean {
  return value.length > 0
    && getGraphemeCount(value) === 1
    && hasVisibleNameGrapheme(value)
    && !containsInvisibleOnlyNameGrapheme(value);
}
