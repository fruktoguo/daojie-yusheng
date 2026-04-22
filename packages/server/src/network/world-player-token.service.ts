import { Injectable, Logger } from '@nestjs/common';
import {
  containsInvisibleOnlyNameGrapheme,
  getGraphemeCount,
  hasVisibleNameGrapheme,
  resolveDefaultVisibleDisplayName,
} from '@mud/shared';
import * as fs from 'node:fs';
import * as path from 'node:path';

import {
  type ValidatedPlayerTokenPayload,
  WorldPlayerTokenCodecService,
} from './world-player-token-codec.service';

const TRACE_FILE_ENV_VAR = 'SERVER_AUTH_TRACE_FILE';
const TRACE_RECORD_LIMIT = 256;
const AUTH_TRACE_ENABLE_ENV_KEYS = [
  'SERVER_AUTH_TRACE_ENABLED',
] as const;
const AUTH_TRACE_TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'enable', 'enabled']);
const AUTH_TRACE_PURPOSE = 'debug_and_audit_summary';
/**
 * AuthTraceCountMap：统一结构类型，保证协议与运行时一致性。
 */


type AuthTraceCountMap = Record<string, number>;
/**
 * TokenKind：统一结构类型，保证协议与运行时一致性。
 */

type TokenKind = 'access' | 'refresh';
/**
 * AuthTraceEntry：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceEntry {
/**
 * type：type相关字段。
 */

  type: string;  
  /**
 * outcome：outcome相关字段。
 */

  outcome?: string | null;  
  /**
 * reason：reason相关字段。
 */

  reason?: string | null;  
  /**
 * userId：userID标识。
 */

  userId?: string | null;  
  /**
 * playerId：玩家ID标识。
 */

  playerId?: string | null;  
  /**
 * username：username名称或显示文本。
 */

  username?: string | null;  
  /**
 * role：role相关字段。
 */

  role?: string | null;  
  /**
 * tokenKind：tokenKind相关字段。
 */

  tokenKind?: string | null;  
  /**
 * tokenIdentityReady：tokenIdentityReady相关字段。
 */

  tokenIdentityReady?: boolean | null;  
  /**
 * source：来源相关字段。
 */

  source?: string | null;  
  /**
 * persistedSource：persisted来源相关字段。
 */

  persistedSource?: string | null;  
  /**
 * persistenceEnabled：启用开关或状态标识。
 */

  persistenceEnabled?: boolean | null;  
  /**
 * mainlineLoadHit：mainlineLoadHit相关字段。
 */

  mainlineLoadHit?: boolean | null;  
  /**
 * compatTried：compatTried相关字段。
 */

  compatTried?: boolean | null;  
  /**
 * persistAttempted：persistAttempted相关字段。
 */

  persistAttempted?: boolean | null;  
  /**
 * persistSucceeded：persistSucceeded相关字段。
 */

  persistSucceeded?: boolean | null;  
  /**
 * persistFailureStage：persistFailureStage相关字段。
 */

  persistFailureStage?: string | null;  
  /**
 * fallbackHit：fallbackHit相关字段。
 */

  fallbackHit?: boolean | null;  
  /**
 * allowLegacyFallback：allowLegacyFallback相关字段。
 */

  allowLegacyFallback?: boolean | null;  
  /**
 * fallbackReason：fallbackReason相关字段。
 */

  fallbackReason?: string | null;  
  /**
 * seedPersisted：seedPersisted相关字段。
 */

  seedPersisted?: boolean | null;  
  /**
 * identityPersistedSource：identityPersisted来源相关字段。
 */

  identityPersistedSource?: string | null;  
  /**
 * failureStage：failureStage相关字段。
 */

  failureStage?: string | null;  
  /**
 * protocol：protocol相关字段。
 */

  protocol?: string | null;  
  /**
 * entryPath：条目路径相关字段。
 */

  entryPath?: string | null;  
  /**
 * identitySource：identity来源相关字段。
 */

  identitySource?: string | null;  
  /**
 * snapshotSource：快照来源相关字段。
 */

  snapshotSource?: string | null;  
  /**
 * snapshotPersistedSource：快照Persisted来源相关字段。
 */

  snapshotPersistedSource?: string | null;  
  /**
 * recoveryOutcome：recoveryOutcome相关字段。
 */

  recoveryOutcome?: string | null;  
  /**
 * recoveryReason：recoveryReason相关字段。
 */

  recoveryReason?: string | null;  
  /**
 * recoveryIdentityPersistedSource：recoveryIdentityPersisted来源相关字段。
 */

  recoveryIdentityPersistedSource?: string | null;  
  /**
 * recoverySnapshotPersistedSource：recovery快照Persisted来源相关字段。
 */

  recoverySnapshotPersistedSource?: string | null;  
  /**
 * requestedSessionId：requestedSessionID标识。
 */

  requestedSessionId?: string | null;  
  /**
 * gm：GM相关字段。
 */

  gm?: boolean | null;  
  /**
 * linkedIdentitySource：linkedIdentity来源相关字段。
 */

  linkedIdentitySource?: string | null;  
  /**
 * linkedSnapshotSource：linked快照来源相关字段。
 */

  linkedSnapshotSource?: string | null;  
  /**
 * linkedSnapshotPersistedSource：linked快照Persisted来源相关字段。
 */

  linkedSnapshotPersistedSource?: string | null;
  [key: string]: unknown;
}
/**
 * AuthTraceRecord：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceRecord extends AuthTraceEntry {
/**
 * timestamp：timestamp相关字段。
 */

  timestamp: number;
}
/**
 * AuthTraceState：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceState {
/**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * records：record相关字段。
 */

  records: AuthTraceRecord[];  
  /**
 * filePath：file路径相关字段。
 */

  filePath: string | null;  
  /**
 * filePrepared：filePrepared相关字段。
 */

  filePrepared: boolean;  
  /**
 * fileErrored：fileErrored相关字段。
 */

  fileErrored: boolean;
}
/**
 * AuthTraceTokenSummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceTokenSummary {
/**
 * acceptCount：数量或计量字段。
 */

  acceptCount: number;  
  /**
 * rejectCount：数量或计量字段。
 */

  rejectCount: number;  
  /**
 * rejectReasonCounts：rejectReason数量相关字段。
 */

  rejectReasonCounts: AuthTraceCountMap;  
  /**
 * tokenKindCounts：tokenKind数量相关字段。
 */

  tokenKindCounts: AuthTraceCountMap;
}
/**
 * AuthTraceIdentitySummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceIdentitySummary {
/**
 * sourceCounts：来源数量相关字段。
 */

  sourceCounts: AuthTraceCountMap;  
  /**
 * persistedSourceCounts：persisted来源数量相关字段。
 */

  persistedSourceCounts: AuthTraceCountMap;  
  /**
 * persistenceEnabledCount：数量或计量字段。
 */

  persistenceEnabledCount: number;  
  /**
 * mainlineLoadHitCount：数量或计量字段。
 */

  mainlineLoadHitCount: number;  
  /**
 * compatTriedCount：数量或计量字段。
 */

  compatTriedCount: number;  
  /**
 * persistAttemptedCount：数量或计量字段。
 */

  persistAttemptedCount: number;  
  /**
 * persistSucceededCount：数量或计量字段。
 */

  persistSucceededCount: number;  
  /**
 * persistFailedCount：数量或计量字段。
 */

  persistFailedCount: number;  
  /**
 * persistFailureStageCounts：persistFailureStage数量相关字段。
 */

  persistFailureStageCounts: AuthTraceCountMap;
}
/**
 * AuthTraceSnapshotSummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceSnapshotSummary {
/**
 * sourceCounts：来源数量相关字段。
 */

  sourceCounts: AuthTraceCountMap;  
  /**
 * persistedSourceCounts：persisted来源数量相关字段。
 */

  persistedSourceCounts: AuthTraceCountMap;  
  /**
 * fallbackHitCount：数量或计量字段。
 */

  fallbackHitCount: number;  
  /**
 * allowLegacyFallbackCount：数量或计量字段。
 */

  allowLegacyFallbackCount: number;  
  /**
 * fallbackReasonCounts：fallbackReason数量相关字段。
 */

  fallbackReasonCounts: AuthTraceCountMap;  
  /**
 * seedPersistedCount：数量或计量字段。
 */

  seedPersistedCount: number;
}
/**
 * AuthTraceSnapshotRecoverySummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceSnapshotRecoverySummary {
/**
 * count：数量或计量字段。
 */

  count: number;  
  /**
 * successCount：数量或计量字段。
 */

  successCount: number;  
  /**
 * blockedCount：数量或计量字段。
 */

  blockedCount: number;  
  /**
 * failedCount：数量或计量字段。
 */

  failedCount: number;  
  /**
 * reasonCounts：reason数量相关字段。
 */

  reasonCounts: AuthTraceCountMap;  
  /**
 * persistedSourceCounts：persisted来源数量相关字段。
 */

  persistedSourceCounts: AuthTraceCountMap;  
  /**
 * identityPersistedSourceCounts：identityPersisted来源数量相关字段。
 */

  identityPersistedSourceCounts: AuthTraceCountMap;  
  /**
 * failureStageCounts：failureStage数量相关字段。
 */

  failureStageCounts: AuthTraceCountMap;
}
/**
 * AuthTraceBootstrapSummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceBootstrapSummary {
/**
 * count：数量或计量字段。
 */

  count: number;  
  /**
 * protocolCounts：protocol数量相关字段。
 */

  protocolCounts: AuthTraceCountMap;  
  /**
 * gmCount：数量或计量字段。
 */

  gmCount: number;  
  /**
 * requestedSessionCount：数量或计量字段。
 */

  requestedSessionCount: number;  
  /**
 * entryPathCounts：条目路径数量相关字段。
 */

  entryPathCounts: AuthTraceCountMap;  
  /**
 * identitySourceCounts：identity来源数量相关字段。
 */

  identitySourceCounts: AuthTraceCountMap;  
  /**
 * identityPersistedSourceCounts：identityPersisted来源数量相关字段。
 */

  identityPersistedSourceCounts: AuthTraceCountMap;  
  /**
 * snapshotSourceCounts：快照来源数量相关字段。
 */

  snapshotSourceCounts: AuthTraceCountMap;  
  /**
 * snapshotPersistedSourceCounts：快照Persisted来源数量相关字段。
 */

  snapshotPersistedSourceCounts: AuthTraceCountMap;  
  /**
 * recoveryOutcomeCounts：recoveryOutcome数量相关字段。
 */

  recoveryOutcomeCounts: AuthTraceCountMap;  
  /**
 * recoveryReasonCounts：recoveryReason数量相关字段。
 */

  recoveryReasonCounts: AuthTraceCountMap;  
  /**
 * recoveryIdentityPersistedSourceCounts：recoveryIdentityPersisted来源数量相关字段。
 */

  recoveryIdentityPersistedSourceCounts: AuthTraceCountMap;  
  /**
 * recoverySnapshotPersistedSourceCounts：recovery快照Persisted来源数量相关字段。
 */

  recoverySnapshotPersistedSourceCounts: AuthTraceCountMap;  
  /**
 * linkedSourceCounts：linked来源数量相关字段。
 */

  linkedSourceCounts: AuthTraceCountMap;  
  /**
 * linkedPersistedSourceCounts：linkedPersisted来源数量相关字段。
 */

  linkedPersistedSourceCounts: AuthTraceCountMap;
}
/**
 * AuthTraceSummary：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceSummary {
/**
 * recordCount：数量或计量字段。
 */

  recordCount: number;  
  /**
 * typeCounts：type数量相关字段。
 */

  typeCounts: AuthTraceCountMap;  
  /**
 * token：token标识。
 */

  token: AuthTraceTokenSummary;  
  /**
 * identity：identity相关字段。
 */

  identity: AuthTraceIdentitySummary;  
  /**
 * snapshot：快照状态或数据块。
 */

  snapshot: AuthTraceSnapshotSummary;  
  /**
 * snapshotRecovery：快照Recovery相关字段。
 */

  snapshotRecovery: AuthTraceSnapshotRecoverySummary;  
  /**
 * bootstrap：bootstrap相关字段。
 */

  bootstrap: AuthTraceBootstrapSummary;
}
/**
 * AuthTraceSnapshotResult：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceSnapshotResult {
/**
 * purpose：purpose相关字段。
 */

  purpose: string;  
  /**
 * completionDefinition：completionDefinition相关字段。
 */

  completionDefinition: boolean;  
  /**
 * boundedRecords：boundedRecord相关字段。
 */

  boundedRecords: boolean;  
  /**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * limit：limit相关字段。
 */

  limit: number;  
  /**
 * records：record相关字段。
 */

  records: AuthTraceRecord[];  
  /**
 * filePath：file路径相关字段。
 */

  filePath: string | null;  
  /**
 * fileErrored：fileErrored相关字段。
 */

  fileErrored: boolean;  
  /**
 * summary：摘要状态或数据块。
 */

  summary: AuthTraceSummary;
}
/**
 * AuthTraceClearResult：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTraceClearResult {
/**
 * ok：ok相关字段。
 */

  ok: true;  
  /**
 * enabled：启用开关或状态标识。
 */

  enabled: boolean;  
  /**
 * filePath：file路径相关字段。
 */

  filePath: string | null;
}
/**
 * PlayerIdentityFromPayload：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerIdentityFromPayload {
/**
 * userId：userID标识。
 */

  userId: string;  
  /**
 * username：username名称或显示文本。
 */

  username: string;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;
}

declare global {
  var __MAINLINE_AUTH_TRACE: AuthTraceState | undefined;
}

/** 玩家认证 trace 服务：记录鉴权、回填和 bootstrap 的调试轨迹。 */
function resolveTraceFilePath(): string | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!globalThis.__MAINLINE_AUTH_TRACE) {
    globalThis.__MAINLINE_AUTH_TRACE = {
      enabled: isAuthTraceEnabled(),
      records: [],
      filePath: resolveTraceFilePath(),
      filePrepared: false,
      fileErrored: false,
    };
  }

  return globalThis.__MAINLINE_AUTH_TRACE;
}

/** 追加一条认证 trace 记录。 */
export function recordAuthTrace(entry: AuthTraceEntry): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
    mainlineLoadHitCount: 0,
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
      if (entry.mainlineLoadHit === true) {
        identity.mainlineLoadHitCount += 1;
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
/**
 * incrementSummaryCount：执行increment摘要数量相关逻辑。
 * @param target AuthTraceCountMap 目标对象。
 * @param key unknown 参数说明。
 * @returns 无返回值，直接更新increment摘要数量相关状态。
 */


function incrementSummaryCount(target: AuthTraceCountMap, key: unknown): void {
  const normalizedKey = typeof key === 'string' && key ? key : 'unknown';
  target[normalizedKey] = (target[normalizedKey] ?? 0) + 1;
}
/**
 * WorldPlayerTokenService：封装该能力的入口与生命周期，承载运行时核心协作。
 */


@Injectable()
export class WorldPlayerTokenService {
/**
 * logger：日志器引用。
 */

  private readonly logger = new Logger(WorldPlayerTokenService.name);  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldPlayerTokenCodecService WorldPlayerTokenCodecService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    private readonly worldPlayerTokenCodecService: WorldPlayerTokenCodecService,
  ) {}  
  /**
 * validatePlayerToken：判断玩家Token是否满足条件。
 * @param token string 参数说明。
 * @returns 返回玩家Token。
 */


  validatePlayerToken(token: string): ValidatedPlayerTokenPayload | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
  /**
 * resolvePlayerIdentityFromPayload：读取玩家IdentityFrom载荷并返回结果。
 * @param payload ValidatedPlayerTokenPayload | null | undefined 载荷参数。
 * @returns 返回玩家IdentityFrom载荷。
 */


  resolvePlayerIdentityFromPayload(
    payload: ValidatedPlayerTokenPayload | null | undefined,
  ): PlayerIdentityFromPayload | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * resolvePlayerTokenKind：规范化或转换玩家TokenKind。
 * @param payload ValidatedPlayerTokenPayload 载荷参数。
 * @returns 返回玩家TokenKind。
 */


function resolvePlayerTokenKind(payload: ValidatedPlayerTokenPayload): TokenKind {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
/**
 * normalizeDisplayName：判断显示名称是否满足条件。
 * @param displayName unknown 参数说明。
 * @param username string 参数说明。
 * @returns 返回显示名称。
 */


function normalizeDisplayName(displayName: unknown, username: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = typeof displayName === 'string' ? displayName.trim().normalize('NFC') : '';
  if (isValidVisibleDisplayName(normalized)) {
    return normalized;
  }

  const normalizedUsername = typeof username === 'string' ? username.trim().normalize('NFC') : '';
  return resolveDefaultVisibleDisplayName(normalizedUsername);
}
/**
 * normalizePlayerName：规范化或转换玩家名称。
 * @param playerName unknown 参数说明。
 * @param displayName string 参数说明。
 * @param username string 参数说明。
 * @returns 返回玩家名称。
 */


function normalizePlayerName(playerName: unknown, displayName: string, username: string): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const normalized = typeof playerName === 'string' ? playerName.trim().normalize('NFC') : '';
  if (normalized) {
    return normalized;
  }
  if (typeof displayName === 'string' && displayName.trim()) {
    return displayName.trim().normalize('NFC');
  }

  return typeof username === 'string' ? username.trim().normalize('NFC') : '';
}
/**
 * isValidVisibleDisplayName：判断Valid可见显示名称是否满足条件。
 * @param value string 参数说明。
 * @returns 返回是否满足Valid可见显示名称条件。
 */


function isValidVisibleDisplayName(value: string): boolean {
  return value.length > 0
    && getGraphemeCount(value) === 1
    && hasVisibleNameGrapheme(value)
    && !containsInvisibleOnlyNameGrapheme(value);
}
