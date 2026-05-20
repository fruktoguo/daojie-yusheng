/**
 * 玩家分域 write plan 构建与执行。
 * 通过 recorder 模拟 `PoolClient.query`，把现有分域投影 SQL 编译成可执行计划。
 */
import type { PoolClient } from 'pg';

import {
  savePlayerSnapshotProjectionDomainsWithClient,
  type PlayerSnapshotProjectionDomainWriteOptions,
} from './player-domain-persistence.service';
import type { PersistedPlayerSnapshot } from './player-persistence.service';

export interface PlayerDomainWritePlanStep {
  sql: string;
  params: unknown[];
}

export interface PlayerDomainWritePlan {
  playerId: string;
  domains: string[];
  steps: PlayerDomainWritePlanStep[];
}

export interface PlayerDomainWritePlanPayload {
  playerId: string;
  snapshot: PersistedPlayerSnapshot;
  domains: string[];
  options: PlayerSnapshotProjectionDomainWriteOptions;
}

export async function buildPlayerSnapshotProjectionWritePlan(
  playerId: string,
  snapshot: PersistedPlayerSnapshot | null | undefined,
  domains: Iterable<string>,
  options: PlayerSnapshotProjectionDomainWriteOptions = {},
  probeClient?: Pick<PoolClient, 'query'>,
): Promise<PlayerDomainWritePlan> {
  const normalizedPlayerId = normalizeRequiredString(playerId);
  const normalizedSnapshot = snapshot?.placement?.templateId ? snapshot : null;
  const normalizedDomains = normalizeDomains(domains);
  if (!normalizedPlayerId || !normalizedSnapshot || normalizedDomains.length === 0) {
    return { playerId: normalizedPlayerId, domains: [], steps: [] };
  }

  const recorder = createRecorder(probeClient);
  await savePlayerSnapshotProjectionDomainsWithClient(
    recorder as unknown as PoolClient,
    normalizedPlayerId,
    normalizedSnapshot,
    normalizedDomains,
    options,
  );

  return {
    playerId: normalizedPlayerId,
    domains: normalizedDomains,
    steps: recorder.steps,
  };
}

export async function executePlayerDomainWritePlan(client: PoolClient, plan: PlayerDomainWritePlan): Promise<void> {
  for (const step of plan.steps) {
    await client.query(step.sql, step.params);
  }
}

interface RecorderQueryResult {
  rows: Array<Record<string, unknown>>;
  rowCount: number;
}

class PlayerDomainWritePlanRecorder {
  readonly steps: PlayerDomainWritePlanStep[] = [];

  constructor(
    private readonly probeClient?: Pick<PoolClient, 'query'>,
  ) {}

  async query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    params: readonly unknown[] = [],
  ): Promise<{ rows: T[]; rowCount: number }> {
    const normalizedParams = Array.isArray(params) ? [...params] : [];
    this.steps.push({ sql, params: normalizedParams });
    if (this.probeClient && isReadOnlySelect(sql)) {
      return this.probeClient.query<T>(sql, normalizedParams) as Promise<{ rows: T[]; rowCount: number }>;
    }
    return synthesizeResult(sql, normalizedParams) as { rows: T[]; rowCount: number };
  }
}

function createRecorder(probeClient?: Pick<PoolClient, 'query'>): PlayerDomainWritePlanRecorder {
  return new PlayerDomainWritePlanRecorder(probeClient);
}

function synthesizeResult(sql: string, params: readonly unknown[]): RecorderQueryResult {
  const normalizedSql = sql.trim().toLowerCase();
  if (normalizedSql.includes('select 1 as exists')) {
    return { rows: [], rowCount: 0 };
  }
  if (
    normalizedSql.startsWith('select item_instance_id')
    && normalizedSql.includes('from player_equipment_slot')
    && normalizedSql.includes('where player_id = $1')
    && normalizedSql.includes('item_instance_id = any($2::varchar[])')
  ) {
    const itemInstanceIds = Array.isArray(params[1]) ? params[1] : [];
    const rows = itemInstanceIds
      .filter((itemInstanceId): itemInstanceId is string => typeof itemInstanceId === 'string' && itemInstanceId.trim().length > 0)
      .map((item_instance_id) => ({ item_instance_id }));
    return { rows, rowCount: rows.length };
  }

  const inferredCount = inferCountFromParams(params);
  if (normalizedSql.includes('select count(*)::int as row_count')) {
    return { rows: [{ row_count: inferredCount }], rowCount: 1 };
  }
  if (normalizedSql.includes('count(*)::int as row_count')) {
    return { rows: [{ row_count: inferredCount }], rowCount: 1 };
  }
  if (normalizedSql.includes('returning')) {
    return { rows: [], rowCount: inferredCount };
  }
  if (normalizedSql.startsWith('insert') || normalizedSql.startsWith('update') || normalizedSql.startsWith('delete') || normalizedSql.startsWith('with ')) {
    return { rows: [], rowCount: inferredCount };
  }
  return { rows: [], rowCount: 0 };
}

function isReadOnlySelect(sql: string): boolean {
  return sql.trim().toLowerCase().startsWith('select');
}

function inferCountFromParams(params: readonly unknown[]): number {
  for (const value of params) {
    const inferred = inferCountFromValue(value);
    if (inferred !== null) {
      return inferred;
    }
  }
  return 1;
}

function inferCountFromValue(value: unknown): number | null {
  if (Array.isArray(value)) {
    return value.length;
  }
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  try {
    const decoded = JSON.parse(trimmed) as unknown;
    if (Array.isArray(decoded)) {
      return decoded.length;
    }
    if (decoded && typeof decoded === 'object') {
      const record = decoded as Record<string, unknown>;
      if (Array.isArray(record.rows)) {
        return record.rows.length;
      }
      if (Array.isArray(record.snapshots)) {
        return record.snapshots.length;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeDomains(domains: Iterable<string>): string[] {
  const normalized = new Set<string>();
  for (const domain of domains ?? []) {
    if (typeof domain === 'string' && domain.trim()) {
      normalized.add(domain.trim());
    }
  }
  return Array.from(normalized).sort();
}

function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
