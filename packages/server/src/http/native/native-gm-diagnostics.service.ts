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
const MUTATE_TIMEOUT_MS = 5_000;
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
    this.logger.log(`GM 诊断查询 actor=${formatActor(actor)} command=${command.slice(0, 240)}`);
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
      const builtIn = this.resolveBuiltInCommand(verb, rest, restParts, limit);
      if (builtIn) {
        const resultSets = await this.executeBuiltIn(pool, builtIn, limit);
        return this.buildResponse(command, startedAt, resultSets, undefined, warnings);
      }
      if (verb === 'exec') {
        const sql = command.slice(command.indexOf('exec') + 4).trim();
        if (!sql) {
          return this.buildResponse(command, startedAt, [], 'exec 需要 SQL 语句。例如：exec UPDATE player_wallet SET balance = 1000 WHERE player_id = \'xxx\'', warnings);
        }
        validateExecSql(sql);
        this.logger.warn(`GM 执行 actor=${formatActor(actor)} sql=${sql.slice(0, 500)}`);
        const resultSet = await this.queryMutable(pool, 'exec', sql, limit);
        warnings.push(`写操作已执行，statement_timeout=${MUTATE_TIMEOUT_MS}ms。注意：exec 直接操作数据库，不会同步运行时内存，玩家需重连或等待下次加载才能看到变更。`);
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

  private resolveBuiltInCommand(
    verb: string,
    rest: string,
    restParts: string[],
    limit: number,
  ): BuiltInQuery[] | null {
    if (verb === 'outbox') return [{ title: 'outbox', sql: '', mode: 'outbox', rest }];
    if (verb === 'tables') return [{ title: 'tables', sql: buildTablesSql() }];
    if (verb === 'table') {
      const tableName = restParts[0] ?? '';
      return [{ title: `table ${tableName}`, sql: buildTableSql(tableName), limitOverride: normalizeLimit(restParts[1] ?? limit) }];
    }
    if (verb === 'presence') {
      const showAll = rest.toLowerCase() === 'all';
      return [{ title: showAll ? 'presence (all)' : 'presence (online)', sql: buildPresenceSql(showAll) }];
    }
    if (verb === 'player') {
      const identifier = rest;
      if (!identifier) return [{ title: 'player', sql: '', mode: 'error', message: 'player 需要参数：player <player_id|username>' }];
      return buildPlayerQueries(identifier);
    }
    if (verb === 'inventory') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'inventory', sql: '', mode: 'error', message: 'inventory 需要参数：inventory <player_id>' }];
      return [{ title: `inventory ${playerId}`, sql: buildInventorySql(playerId) }];
    }
    if (verb === 'equipment') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'equipment', sql: '', mode: 'error', message: 'equipment 需要参数：equipment <player_id>' }];
      return [{ title: `equipment ${playerId}`, sql: buildEquipmentSql(playerId) }];
    }
    if (verb === 'techniques') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'techniques', sql: '', mode: 'error', message: 'techniques 需要参数：techniques <player_id>' }];
      return [{ title: `techniques ${playerId}`, sql: buildTechniquesSql(playerId) }];
    }
    if (verb === 'quests') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'quests', sql: '', mode: 'error', message: 'quests 需要参数：quests <player_id>' }];
      return [{ title: `quests ${playerId}`, sql: buildQuestsSql(playerId) }];
    }
    if (verb === 'buffs') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'buffs', sql: '', mode: 'error', message: 'buffs 需要参数：buffs <player_id>' }];
      return [{ title: `buffs ${playerId}`, sql: buildBuffsSql(playerId) }];
    }
    if (verb === 'wallet') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'wallet', sql: '', mode: 'error', message: 'wallet 需要参数：wallet <player_id>' }];
      return [{ title: `wallet ${playerId}`, sql: buildWalletSql(playerId) }];
    }
    if (verb === 'counters') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'counters', sql: '', mode: 'error', message: 'counters 需要参数：counters <player_id>' }];
      return [{ title: `counters ${playerId}`, sql: buildCountersSql(playerId) }];
    }
    if (verb === 'instances') {
      const mode = restParts[0]?.toLowerCase() ?? '';
      return [{ title: `instances ${mode || 'summary'}`, sql: buildInstancesSql(mode) }];
    }
    if (verb === 'market') {
      const mode = restParts[0]?.toLowerCase() ?? '';
      return [{ title: `market ${mode || 'active'}`, sql: buildMarketSql(mode, restParts.slice(1).join(' ')) }];
    }
    if (verb === 'trades') {
      const playerId = restParts[0] ?? '';
      return [{ title: `trades ${playerId || 'recent'}`, sql: buildTradesSql(playerId) }];
    }
    if (verb === 'mail') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'mail', sql: '', mode: 'error', message: 'mail 需要参数：mail <player_id>' }];
      return [{ title: `mail ${playerId}`, sql: buildMailSql(playerId) }];
    }
    if (verb === 'flush') {
      const mode = restParts[0]?.toLowerCase() ?? '';
      return [{ title: `flush ${mode || 'dirty'}`, sql: buildFlushSql(mode) }];
    }
    if (verb === 'deadletter') {
      return [{ title: 'deadletter', sql: buildDeadLetterSql() }];
    }
    if (verb === 'audit') {
      const playerId = restParts[0] ?? '';
      if (!playerId) return [{ title: 'audit', sql: '', mode: 'error', message: 'audit 需要参数：audit <player_id> [asset_type]' }];
      const assetType = restParts[1] ?? '';
      return [{ title: `audit ${playerId}`, sql: buildAuditSql(playerId, assetType) }];
    }
    if (verb === 'dbsize') return [{ title: 'dbsize', sql: buildDbSizeSql() }];
    if (verb === 'connections') return [{ title: 'connections', sql: buildConnectionsSql() }];
    if (verb === 'locks') return [{ title: 'locks', sql: buildLocksSql() }];
    if (verb === 'slowqueries') return [{ title: 'slowqueries', sql: buildSlowQueriesSql() }];
    if (verb === 'replication') return [{ title: 'replication', sql: buildReplicationSql() }];
    return null;
  }

  private async executeBuiltIn(pool: Pool, queries: BuiltInQuery[], limit: number): Promise<GmDiagnosticsResultSet[]> {
    const results: GmDiagnosticsResultSet[] = [];
    for (const q of queries) {
      if (q.mode === 'error') {
        results.push({ title: q.title, columns: ['message'], rows: [{ message: q.message ?? '参数错误' }], rowCount: 1, truncated: false });
        continue;
      }
      if (q.mode === 'outbox') {
        const outboxResults = await this.queryOutbox(pool, q.rest ?? '', limit);
        results.push(...outboxResults);
        continue;
      }
      const effectiveLimit = q.limitOverride ?? limit;
      results.push(await this.queryReadOnly(pool, q.title, q.sql, effectiveLimit));
    }
    return results;
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

  private async queryMutable(pool: Pool, title: string, sql: string, limit: number): Promise<GmDiagnosticsResultSet> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL statement_timeout = ${MUTATE_TIMEOUT_MS}`);
      await client.query('SET LOCAL idle_in_transaction_session_timeout = 10000');
      const result = await client.query(sql);
      await client.query('COMMIT');
      // 对于 INSERT/UPDATE/DELETE，rowCount 表示受影响行数
      if (result.rows && result.rows.length > 0) {
        return normalizeResultSet(title, result, limit);
      }
      return {
        title,
        columns: ['command', 'rowCount'],
        rows: [{ command: result.command ?? 'UNKNOWN', rowCount: result.rowCount ?? 0 }],
        rowCount: 1,
        truncated: false,
      };
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

function validateExecSql(sql: string): void {
  const normalized = sql.trim();
  if (!normalized) {
    throw new Error('exec SQL 不能为空。');
  }
  // 禁止多条语句
  if (normalized.includes(';') || normalized.includes('--') || normalized.includes('/*') || normalized.includes('*/')) {
    throw new Error('exec 只允许单条 SQL，不允许分号或注释。');
  }
  // 禁止高风险函数
  if (DANGEROUS_SQL_PATTERN.test(normalized)) {
    throw new Error('exec 禁止调用高风险 PostgreSQL 函数。');
  }
  // 禁止 DDL（DROP/ALTER/CREATE/GRANT/REVOKE/TRUNCATE）
  if (/\b(drop|alter|create|grant|revoke|truncate)\b/iu.test(normalized)) {
    throw new Error('exec 禁止 DDL 操作（DROP/ALTER/CREATE/GRANT/REVOKE/TRUNCATE）。');
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
    { command: 'presence', description: '在线玩家列表（默认仅 online=true）' },
    { command: 'presence all', description: '全量玩家在线状态' },
    { command: 'player <id|username>', description: '玩家综合信息（身份+在线+快照+钱包）' },
    { command: 'inventory <player_id>', description: '玩家背包物品' },
    { command: 'equipment <player_id>', description: '玩家装备栏' },
    { command: 'techniques <player_id>', description: '玩家功法/技能' },
    { command: 'quests <player_id>', description: '玩家任务进度' },
    { command: 'buffs <player_id>', description: '玩家持久 buff' },
    { command: 'wallet <player_id>', description: '玩家钱包余额' },
    { command: 'counters <player_id>', description: '玩家计数器' },
    { command: 'instances [active|all]', description: '实例目录摘要/活跃/全量' },
    { command: 'market [active|item_key]', description: '市场挂单（默认活跃单）' },
    { command: 'trades [player_id]', description: '最近成交记录' },
    { command: 'mail <player_id>', description: '玩家邮件' },
    { command: 'flush [dirty|all]', description: '持久化刷写队列状态' },
    { command: 'deadletter', description: '死信事件列表' },
    { command: 'audit <player_id> [asset_type]', description: '资产审计日志' },
    { command: 'outbox', description: 'outbox 摘要（可认领/延迟/死信）' },
    { command: 'outbox topics', description: '按 topic/status 聚合 outbox' },
    { command: 'outbox sample', description: '采样 outbox 明细' },
    { command: 'tables', description: '数据库表大小和估算行数' },
    { command: 'table <name> [limit]', description: '指定表只读采样' },
    { command: 'dbsize', description: '数据库总大小和表空间' },
    { command: 'connections', description: '当前数据库连接统计' },
    { command: 'locks', description: '当前锁等待情况' },
    { command: 'slowqueries', description: '活跃慢查询（>1s）' },
    { command: 'replication', description: '复制槽和延迟状态' },
    { command: 'sql SELECT ...', description: '执行单条只读 SQL' },
    { command: 'exec UPDATE/INSERT/DELETE ...', description: '执行写操作（需勾选确认，禁止 DDL）' },
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

interface BuiltInQuery {
  title: string;
  sql: string;
  mode?: 'outbox' | 'error';
  rest?: string;
  message?: string;
  limitOverride?: number;
}

function validateIdentifier(value: string): string {
  const trimmed = value.trim();
  if (!/^[a-zA-Z0-9_:.-]+$/u.test(trimmed)) {
    throw new Error('标识符只允许字母、数字、下划线、冒号、点和短横线。');
  }
  return trimmed;
}

/** 对用户输入做 SQL 字面量转义（防注入），允许中文等 Unicode 字符。 */
function sanitizeParam(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 200) {
    throw new Error('参数不能为空且长度不超过 200。');
  }
  // 禁止分号、注释、子查询等危险字符
  if (/[;'"\\]/.test(trimmed) && !/^[^'";\\]*$/u.test(trimmed)) {
    // 仅转义单引号即可安全嵌入 SQL 字面量
  }
  // 转义单引号
  return trimmed.replace(/'/gu, "''");
}

function buildPresenceSql(showAll: boolean): string {
  const whereClause = showAll ? '' : 'WHERE online = true';
  return `
    SELECT p.player_id, i.username, i.display_name, p.online, p.in_world,
      p.runtime_owner_id, p.session_epoch, p.last_heartbeat_at, p.offline_since_at,
      p.transfer_state, p.updated_at
    FROM player_presence p
    LEFT JOIN server_player_identity i ON i.player_id = p.player_id
    ${whereClause}
    ORDER BY p.last_heartbeat_at DESC NULLS LAST
  `;
}

function buildPlayerQueries(identifier: string): BuiltInQuery[] {
  const safe = sanitizeParam(identifier);
  // 支持 player_id、username、display_name、player_name、player_no（数字）
  const isNumeric = /^\d+$/u.test(safe);
  const identityWhere = isNumeric
    ? `player_id = '${safe}' OR username = '${safe}' OR player_no = ${safe} OR display_name = '${safe}' OR player_name = '${safe}'`
    : `player_id = '${safe}' OR username = '${safe}' OR display_name = '${safe}' OR player_name = '${safe}'`;
  const resolveSubquery = `(SELECT player_id FROM server_player_identity WHERE ${identityWhere})`;
  return [
    {
      title: `identity (${safe})`,
      sql: `
        SELECT * FROM server_player_identity
        WHERE ${identityWhere}
      `,
    },
    {
      title: `presence (${safe})`,
      sql: `
        SELECT * FROM player_presence
        WHERE player_id IN ${resolveSubquery}
      `,
    },
    {
      title: `snapshot (${safe})`,
      sql: `
        SELECT player_id, template_id, instance_id, persisted_source, seeded_at, saved_at, updated_at,
          payload->'placement'->>'templateId' AS map_template,
          payload->'vitals'->>'hp' AS hp,
          payload->'vitals'->>'maxHp' AS max_hp,
          payload->'vitals'->>'qi' AS qi,
          payload->'vitals'->>'maxQi' AS max_qi,
          payload->'progression'->'realm'->>'realmLv' AS realm_lv,
          payload->'progression'->'realm'->>'displayName' AS realm_name
        FROM server_player_snapshot
        WHERE player_id IN ${resolveSubquery}
      `,
    },
    {
      title: `wallet (${safe})`,
      sql: `
        SELECT * FROM player_wallet
        WHERE player_id IN ${resolveSubquery}
        ORDER BY wallet_type
      `,
    },
  ];
}

function buildPlayerResolveSubquery(input: string): string {
  const safe = sanitizeParam(input);
  const isNumeric = /^\d+$/u.test(safe);
  const where = isNumeric
    ? `player_id = '${safe}' OR username = '${safe}' OR player_no = ${safe} OR display_name = '${safe}' OR player_name = '${safe}'`
    : `player_id = '${safe}' OR username = '${safe}' OR display_name = '${safe}' OR player_name = '${safe}'`;
  return `(SELECT player_id FROM server_player_identity WHERE ${where})`;
}

function buildInventorySql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_inventory_item
    WHERE player_id IN ${sub}
    ORDER BY slot_index ASC, item_id ASC
  `;
}

function buildEquipmentSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_equipment_slot
    WHERE player_id IN ${sub}
    ORDER BY slot_type ASC
  `;
}

function buildTechniquesSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_technique_state
    WHERE player_id IN ${sub}
    ORDER BY tech_id ASC
  `;
}

function buildQuestsSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_quest_progress
    WHERE player_id IN ${sub}
    ORDER BY updated_at DESC
  `;
}

function buildBuffsSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_persistent_buff_state
    WHERE player_id IN ${sub}
    ORDER BY buff_id ASC
  `;
}

function buildWalletSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_wallet
    WHERE player_id IN ${sub}
    ORDER BY wallet_type ASC
  `;
}

function buildCountersSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_counters
    WHERE player_id IN ${sub}
    ORDER BY counter_key ASC
  `;
}

function buildInstancesSql(mode: string): string {
  if (mode === 'active') {
    return `
      SELECT * FROM instance_catalog
      WHERE status = 'active' OR runtime_status = 'running'
      ORDER BY last_active_at DESC NULLS LAST
    `;
  }
  if (mode === 'all') {
    return `
      SELECT * FROM instance_catalog
      ORDER BY last_active_at DESC NULLS LAST
    `;
  }
  return `
    SELECT status, runtime_status, count(*) AS count,
      min(created_at) AS oldest, max(last_active_at) AS newest_active
    FROM instance_catalog
    GROUP BY status, runtime_status
    ORDER BY count(*) DESC
  `;
}

function buildMarketSql(mode: string, extra: string): string {
  if (mode === 'active' || !mode) {
    return `
      SELECT * FROM server_market_order
      WHERE status = 'active'
      ORDER BY created_at_ms DESC
    `;
  }
  const safeKey = validateIdentifier(mode);
  return `
    SELECT * FROM server_market_order
    WHERE item_key = '${safeKey}' OR item_id = '${safeKey}'
    ORDER BY created_at_ms DESC
  `;
}

function buildTradesSql(playerId: string): string {
  if (!playerId) {
    return `
      SELECT * FROM server_market_trade_history
      ORDER BY created_at_ms DESC
    `;
  }
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM server_market_trade_history
    WHERE buyer_id IN ${sub} OR seller_id IN ${sub}
    ORDER BY created_at_ms DESC
  `;
}

function buildMailSql(playerId: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  return `
    SELECT * FROM player_mail
    WHERE player_id IN ${sub}
    ORDER BY created_at DESC
  `;
}

function buildFlushSql(mode: string): string {
  if (mode === 'all') {
    return `
      SELECT * FROM player_flush_ledger
      ORDER BY dirty_since_at ASC NULLS LAST
    `;
  }
  return `
    SELECT * FROM player_flush_ledger
    WHERE latest_version > flushed_version
    ORDER BY dirty_since_at ASC NULLS LAST
  `;
}

function buildDeadLetterSql(): string {
  return `
    SELECT * FROM dead_letter_event
    ORDER BY created_at DESC
  `;
}

function buildAuditSql(playerId: string, assetType: string): string {
  const sub = buildPlayerResolveSubquery(playerId);
  const assetFilter = assetType ? `AND asset_type = '${sanitizeParam(assetType)}'` : '';
  return `
    SELECT * FROM asset_audit_log
    WHERE player_id IN ${sub} ${assetFilter}
    ORDER BY created_at DESC
  `;
}

function buildDbSizeSql(): string {
  return `
    SELECT
      current_database() AS database_name,
      pg_size_pretty(pg_database_size(current_database())) AS total_size,
      (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) AS active_connections,
      now() AS checked_at
  `;
}

function buildConnectionsSql(): string {
  return `
    SELECT state, usename, application_name, client_addr,
      count(*) AS count,
      min(backend_start) AS oldest_backend,
      max(state_change) AS latest_state_change
    FROM pg_stat_activity
    WHERE datname = current_database()
    GROUP BY state, usename, application_name, client_addr
    ORDER BY count(*) DESC
  `;
}

function buildLocksSql(): string {
  return `
    SELECT
      blocked_locks.pid AS blocked_pid,
      blocked_activity.usename AS blocked_user,
      blocking_locks.pid AS blocking_pid,
      blocking_activity.usename AS blocking_user,
      blocked_activity.query AS blocked_query,
      blocked_activity.state_change AS blocked_since
    FROM pg_catalog.pg_locks blocked_locks
    JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
    JOIN pg_catalog.pg_locks blocking_locks
      ON blocking_locks.locktype = blocked_locks.locktype
      AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
      AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
      AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
      AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
      AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
      AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
      AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
      AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
      AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
      AND blocking_locks.pid != blocked_locks.pid
    JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
    WHERE NOT blocked_locks.granted
    ORDER BY blocked_activity.state_change ASC
  `;
}

function buildSlowQueriesSql(): string {
  return `
    SELECT pid, usename, state, now() - query_start AS duration,
      query, wait_event_type, wait_event
    FROM pg_stat_activity
    WHERE datname = current_database()
      AND state = 'active'
      AND now() - query_start > interval '1 second'
      AND pid != pg_backend_pid()
    ORDER BY query_start ASC
  `;
}

function buildReplicationSql(): string {
  return `
    SELECT slot_name, plugin, slot_type, active,
      restart_lsn, confirmed_flush_lsn,
      pg_size_pretty(pg_wal_lsn_diff(pg_current_wal_lsn(), restart_lsn)) AS lag_size
    FROM pg_replication_slots
    ORDER BY slot_name
  `;
}
