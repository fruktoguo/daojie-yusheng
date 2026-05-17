/**
 * GM 只读诊断指令服务。
 * 提供受控的数据库只读查询能力，便于无法 SSH 到正式服时从 GM 面板排查线上状态。
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { GmDiagnosticsQueryReq, GmDiagnosticsQueryRes, GmDiagnosticsResultSet } from '@mud/shared';
import type { Pool, QueryResult } from 'pg';

import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import type { GmActorContext } from './native-gm-actor-context';

const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;
const MAX_COMMAND_LENGTH = 12_000;
const QUERY_TIMEOUT_MS = 2_000;
const MAX_CELL_STRING_LENGTH = 4_000;
const REDACTED = '[REDACTED]';
const SENSITIVE_KEY_PATTERN = /(password|passwd|pwd|secret|token|authorization|cookie|session|private|credential|hash|salt|key)/iu;
const MUTATING_SQL_PATTERN = /\b(insert|update|delete|drop|alter|truncate|create|grant|revoke|vacuum|analyze|copy|call|do|execute|merge|lock|listen|notify|set|reset)\b/iu;
const DANGEROUS_SQL_PATTERN = /\b(pg_sleep|pg_read_file|pg_ls_dir|pg_stat_file|pg_terminate_backend|pg_cancel_backend|lo_import|lo_export|dblink|postgres_fdw)\b/iu;

/** GM 只读诊断指令服务。 */
@Injectable()
export class NativeGmDiagnosticsService {
  private readonly logger = new Logger(NativeGmDiagnosticsService.name);

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async executeQuery(input: GmDiagnosticsQueryReq, actor: GmActorContext): Promise<GmDiagnosticsQueryRes> {
    const startedAt = Date.now();
    const command = normalizeCommand(input?.command);
    const limit = normalizeLimit(input?.limit);
    const warnings: string[] = [];
    if (!command) {
      return this.buildResponse(command, startedAt, [], '请输入诊断指令。', warnings);
    }
    this.logger.log(`GM diagnostics query actor=${formatActor(actor)} command=${command.slice(0, 240)}`);
    const [rawVerb, ...restParts] = command.split(/\s+/u);
    const verb = (rawVerb ?? '').toLowerCase();
    const rest = restParts.join(' ').trim();
    if (verb === 'help' || verb === '?') {
      return this.buildResponse(command, startedAt, [buildHelpResultSet()], undefined, warnings);
    }

    const pool = this.databasePoolProvider?.getPool('gm-diagnostics') ?? null;
    if (!pool) {
      return this.buildResponse(command, startedAt, [], '数据库连接未启用，无法执行诊断查询。', warnings);
    }

    try {
      if (verb === 'outbox') {
        const resultSets = await this.queryOutbox(pool, rest, limit);
        return this.buildResponse(command, startedAt, resultSets, undefined, warnings);
      }
      if (verb === 'tables') {
        const resultSet = await this.queryReadOnly(pool, 'tables', buildTablesSql(), limit);
        return this.buildResponse(command, startedAt, [resultSet], undefined, warnings);
      }
      if (verb === 'table') {
        const tableName = restParts[0] ?? '';
        const tableLimit = normalizeLimit(restParts[1] ?? limit);
        const sql = buildTableSql(tableName);
        const resultSet = await this.queryReadOnly(pool, `table ${tableName}`, sql, tableLimit);
        return this.buildResponse(command, startedAt, [resultSet], undefined, warnings);
      }
      if (verb === 'sql') {
        const sql = command.slice(command.indexOf('sql') + 3).trim();
        validateReadOnlySql(sql);
        const resultSet = await this.queryReadOnly(pool, 'sql', sql, limit);
        warnings.push(`只读 SQL 已强制 READ ONLY、statement_timeout=${QUERY_TIMEOUT_MS}ms、LIMIT=${limit}`);
        return this.buildResponse(command, startedAt, [resultSet], undefined, warnings);
      }
      validateReadOnlySql(command);
      const resultSet = await this.queryReadOnly(pool, 'sql', command, limit);
      warnings.push(`未识别为预置指令，已按只读 SQL 执行；LIMIT=${limit}`);
      return this.buildResponse(command, startedAt, [resultSet], undefined, warnings);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return this.buildResponse(command, startedAt, [], message, warnings);
    }
  }

  private async queryOutbox(pool: Pool, modeText: string, limit: number): Promise<GmDiagnosticsResultSet[]> {
    const [mode = '', modeLimitRaw = ''] = modeText.split(/\s+/u);
    const modeLimit = modeLimitRaw ? normalizeLimit(modeLimitRaw) : limit;
    if (mode === 'sample') {
      return [
        await this.queryReadOnly(
          pool,
          'outbox sample',
          `
            SELECT event_id, operation_id, topic, partition_key, status, attempt_count,
              next_retry_at, claimed_by, claim_until, created_at, delivered_at
            FROM outbox_event
            WHERE status IN ('ready', 'claimed', 'dead_letter')
            ORDER BY COALESCE(next_retry_at, created_at), created_at
          `,
          modeLimit,
        ),
      ];
    }
    if (mode === 'topics') {
      return [
        await this.queryReadOnly(
          pool,
          'outbox topics',
          `
            SELECT topic, status, count(*) AS count, min(created_at) AS oldest_created_at,
              max(created_at) AS newest_created_at, min(next_retry_at) AS min_retry_at,
              max(next_retry_at) AS max_retry_at
            FROM outbox_event
            WHERE status IN ('ready', 'claimed', 'dead_letter')
            GROUP BY topic, status
            ORDER BY count(*) DESC, topic ASC, status ASC
          `,
          modeLimit,
        ),
      ];
    }
    return [
      await this.queryReadOnly(
        pool,
        'outbox summary',
        `
          SELECT
            now() AS db_now,
            count(*) FILTER (WHERE status = 'ready') AS ready_total,
            count(*) FILTER (
              WHERE status IN ('ready', 'claimed')
                AND (next_retry_at IS NULL OR next_retry_at <= now())
                AND (claim_until IS NULL OR claim_until < now())
            ) AS claimable_now,
            count(*) FILTER (WHERE status = 'ready' AND next_retry_at > now()) AS delayed_ready,
            count(*) FILTER (WHERE status = 'claimed' AND claim_until >= now()) AS active_claimed,
            count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_total,
            min(created_at) FILTER (WHERE status = 'ready') AS oldest_ready_at,
            min(next_retry_at) FILTER (WHERE status = 'ready' AND next_retry_at > now()) AS next_retry_at
          FROM outbox_event
        `,
        1,
      ),
      await this.queryReadOnly(
        pool,
        'outbox topics',
        `
          SELECT topic, status, count(*) AS count, min(created_at) AS oldest_created_at,
            max(created_at) AS newest_created_at, min(next_retry_at) AS min_retry_at,
            max(next_retry_at) AS max_retry_at
          FROM outbox_event
          WHERE status IN ('ready', 'claimed', 'dead_letter')
          GROUP BY topic, status
          ORDER BY count(*) DESC, topic ASC, status ASC
        `,
        Math.min(limit, 50),
      ),
    ];
  }

  private async queryReadOnly(pool: Pool, title: string, sql: string, limit: number): Promise<GmDiagnosticsResultSet> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = ${QUERY_TIMEOUT_MS}`);
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 5000');
      const result = await client.query(`SELECT * FROM (${sql}) AS gm_diagnostics_query LIMIT $1`, [limit + 1]);
      await client.query('COMMIT');
      return normalizeResultSet(title, result, limit);
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private buildResponse(
    command: string,
    startedAt: number,
    resultSets: GmDiagnosticsResultSet[],
    message?: string,
    warnings?: string[],
  ): GmDiagnosticsQueryRes {
    return {
      ok: !message,
      command,
      executedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      resultSets,
      message,
      warnings,
    };
  }
}

function normalizeCommand(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_COMMAND_LENGTH) : '';
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_QUERY_LIMIT;
  }
  return Math.min(MAX_QUERY_LIMIT, Math.max(1, Math.trunc(parsed)));
}

function validateReadOnlySql(sql: string): void {
  const normalized = sql.trim();
  if (!/^(select|with)\b/iu.test(normalized)) {
    throw new Error('只允许 SELECT 或 WITH 开头的只读 SQL。');
  }
  if (normalized.includes(';') || normalized.includes('--') || normalized.includes('/*') || normalized.includes('*/')) {
    throw new Error('只允许单条 SQL，不允许分号或注释。');
  }
  if (MUTATING_SQL_PATTERN.test(normalized)) {
    throw new Error('只读诊断禁止写库、DDL、COPY、CALL、DO、锁表和会话设置语句。');
  }
  if (DANGEROUS_SQL_PATTERN.test(normalized)) {
    throw new Error('只读诊断禁止调用高风险 PostgreSQL 函数。');
  }
}

function buildTablesSql(): string {
  return `
    SELECT
      n.nspname AS schema_name,
      c.relname AS table_name,
      c.reltuples::bigint AS estimated_rows,
      pg_total_relation_size(c.oid) AS total_bytes,
      pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r', 'p')
      AND n.nspname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY pg_total_relation_size(c.oid) DESC, n.nspname ASC, c.relname ASC
  `;
}

function buildTableSql(tableName: string): string {
  const normalized = tableName.trim();
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*(\.[a-zA-Z_][a-zA-Z0-9_]*)?$/u.test(normalized)) {
    throw new Error('table 指令需要合法表名，例如：table outbox_event 50');
  }
  const parts = normalized.split('.');
  const schema = parts.length === 2 ? parts[0] : 'public';
  const table = parts.length === 2 ? parts[1] : parts[0];
  return `SELECT * FROM ${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}

function quoteIdentifier(value: string): string {
  return `"${value.replace(/"/gu, '""')}"`;
}

function normalizeResultSet(title: string, result: QueryResult, limit: number): GmDiagnosticsResultSet {
  const columns = result.fields.map((field) => field.name);
  const rows = result.rows.slice(0, limit).map((row: Record<string, unknown>) => redactRow(row));
  return {
    title,
    columns,
    rows,
    rowCount: rows.length,
    truncated: result.rows.length > limit,
  };
}

function redactRow(row: Record<string, unknown>): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    output[key] = redactValue(key, value);
  }
  return output;
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEY_PATTERN.test(key)) {
    return REDACTED;
  }
  if (typeof value === 'string') {
    return value.length > MAX_CELL_STRING_LENGTH ? `${value.slice(0, MAX_CELL_STRING_LENGTH)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((entry) => redactValue(key, entry));
  }
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      output[childKey] = redactValue(childKey, childValue);
    }
    return output;
  }
  return value;
}

function buildHelpResultSet(): GmDiagnosticsResultSet {
  const rows = [
    { command: 'outbox', description: '查看 outbox 可认领、延迟、死信和 topic 摘要' },
    { command: 'outbox topics', description: '按 topic/status 聚合 outbox 积压' },
    { command: 'outbox sample 100', description: '采样 outbox ready/claimed/dead_letter 明细' },
    { command: 'tables', description: '查看数据库表大小和估算行数' },
    { command: 'table outbox_event 50', description: '查看指定表的只读采样' },
    { command: 'sql SELECT ...', description: '执行单条只读 SELECT/WITH；自动 READ ONLY、超时和行数限制' },
  ];
  return {
    title: 'help',
    columns: ['command', 'description'],
    rows,
    rowCount: rows.length,
    truncated: false,
  };
}

function formatActor(actor: GmActorContext): string {
  return `rev=${actor.tokenRev ?? '-'} ip=${actor.ip ?? '-'} ua=${(actor.userAgent ?? '-').slice(0, 80)}`;
}
