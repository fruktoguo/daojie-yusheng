/**
 * GM 操作审计持久化服务。
 *
 * 落 `gm_audit_log` 表，覆盖 GM 直改玩家资产 / 进度 / 邮件 / 兑换码 / 实例运行时 等所有
 * 写操作。N45 现场：之前 GM 写绕过 durable + outbox + asset_audit 三件套，监管真空；
 * 本 service 是 GM 写真源审计的最小可追溯通道。后续 N45 后续工作：
 *  - 更高风险操作走 DurableOperationService（已存在）+ outbox topic=gm_audit；
 *  - 复合操作（批量补偿）通过 N46 的 gm_batch_job 表分页 worker 推进；
 *  - dual-control 高风险操作改造（密钥访问、资产清零等）。
 *
 * 本文件不直接 emit outbox 事件 —— 写 audit_log 与 outbox 解耦，避免 outbox 链路异常时
 * audit 也丢失；后续如需"审计→下游分析"再独立挂 outbox dispatcher。
 */
import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const GM_AUDIT_LOG_TABLE = 'gm_audit_log';

/** GM 操作审计单条记录。 */
export interface GmAuditLogEntry {
  /** 操作类型 key（点分命名）：gm.player.add_combat_exp / gm.mail.broadcast / gm.world.freeze_instance 等。 */
  op: string;
  /** 操作目标类别：player / instance / mail / sect / world 等；不限制白名单，沿用 op 命名约定。 */
  targetType?: string | null;
  /** 操作目标 ID：playerId / instanceId / mailId / sectId 等。 */
  targetId?: string | null;
  /** Actor 上下文：从请求 + 鉴权信息提取。 */
  actor: {
    /** GM token 的 rev（密码版本号），区分多次改密后的 token 实例。 */
    tokenRev?: string | null;
    /** 请求来源 IP。 */
    ip?: string | null;
    /** 请求 User-Agent。 */
    userAgent?: string | null;
    /** 请求接收时间（毫秒，自 epoch）。 */
    receivedAt?: number | null;
  };
  /** 操作前状态摘要（仅关键字段；禁止全量克隆 hot 数据）。 */
  before?: unknown;
  /** 操作后状态摘要。 */
  after?: unknown;
  /** 操作变更摘要：数值差、字段差，与 before/after 互补。 */
  delta?: unknown;
  /** 操作是否成功（false 时 errorMessage 必填）。 */
  success: boolean;
  /** 操作失败时的错误信息；成功时为 null。 */
  errorMessage?: string | null;
}

/** GM 操作审计查询过滤参数（运营查询用）。 */
export interface GmAuditLogQueryFilter {
  /** 限定 op 前缀（如 gm.player. 列出全部玩家相关操作）。 */
  opPrefix?: string;
  /** 限定 targetId。 */
  targetId?: string;
  /** 限定 actor IP。 */
  actorIp?: string;
  /** 限定时间下界（ISO 字符串）。 */
  sinceIso?: string;
  /** 默认按 created_at DESC 取最新 N 条。 */
  limit?: number;
}

/** GM 审计日志查询结果。 */
export interface GmAuditLogRecord extends GmAuditLogEntry {
  auditId: string;
  createdAtIso: string;
}

@Injectable()
export class GmAuditLogPersistenceService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GmAuditLogPersistenceService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(
    @Inject(DatabasePoolProvider)
    private readonly databasePoolProvider: DatabasePoolProvider | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.warn('GM 审计日志持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL；GM 写操作将仅记录到日志而不入库。');
      return;
    }
    const sharedPool = this.databasePoolProvider?.getPool('gm-audit-log') ?? null;
    if (!sharedPool) {
      this.logger.warn('GM 审计日志持久化已禁用：数据库连接池提供者未提供连接池');
      return;
    }
    this.pool = sharedPool;
    try {
      await this.ensureTable();
      this.enabled = true;
      this.logger.log('GM 审计日志持久化已启用（gm_audit_log）');
    } catch (error) {
      this.logger.error('GM 审计日志表初始化失败', error instanceof Error ? error.stack : String(error));
      this.pool = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
  }

  /** 是否已就绪（持久化层可写）。 */
  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /**
   * 记录一条 GM 操作审计。
   * 设计要点：
   * - 失败不抛异常 / 不阻断主操作 —— 即使 audit 失败也不让 GM 写流程被拖死；
   * - 但 logger.error 必须打出完整错误（运维可经日志告警追溯）；
   * - audit_id 在 service 端生成 UUID v4，避免 DB 自增依赖。
   */
  async recordEntry(entry: GmAuditLogEntry): Promise<void> {
    const auditId = randomUUID();
    const op = (entry.op || '').trim();
    if (!op) {
      this.logger.warn('GM 审计日志条目缺失 op，已忽略');
      return;
    }
    if (!this.enabled || !this.pool) {
      // 未就绪时打 info 日志保证至少有可追溯条目（生产应保证 enable，否则属配置缺陷）。
      this.logger.warn(
        `GM 审计未持久化（持久化未就绪）：op=${op} target=${entry.targetType ?? ''}:${entry.targetId ?? ''} actor_ip=${entry.actor?.ip ?? ''} success=${entry.success}`,
      );
      return;
    }
    try {
      await this.pool.query(
        `
          INSERT INTO ${GM_AUDIT_LOG_TABLE}(
            audit_id,
            created_at,
            actor_token_rev,
            actor_ip,
            actor_user_agent,
            actor_received_at,
            op,
            target_type,
            target_id,
            before_jsonb,
            after_jsonb,
            delta_jsonb,
            success,
            error_message
          )
          VALUES ($1, now(), $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13)
        `,
        [
          auditId,
          entry.actor?.tokenRev ?? null,
          entry.actor?.ip ?? null,
          entry.actor?.userAgent ?? null,
          Number.isFinite(entry.actor?.receivedAt) ? new Date(entry.actor!.receivedAt!).toISOString() : null,
          op,
          (entry.targetType ?? null),
          (entry.targetId ?? null),
          JSON.stringify(entry.before ?? {}),
          JSON.stringify(entry.after ?? {}),
          JSON.stringify(entry.delta ?? {}),
          entry.success === true,
          entry.errorMessage ?? null,
        ],
      );
    } catch (error) {
      this.logger.error(
        `GM 审计日志写入失败：op=${op} target=${entry.targetType ?? ''}:${entry.targetId ?? ''} - ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  /** 简单查询：默认按 created_at DESC 取最新 N 条；运营 / 内审用。 */
  async listRecent(filter: GmAuditLogQueryFilter = {}): Promise<GmAuditLogRecord[]> {
    if (!this.enabled || !this.pool) {
      return [];
    }
    const limit = Math.max(1, Math.min(500, Math.trunc(filter.limit ?? 100)));
    const conditions: string[] = [];
    const args: unknown[] = [];
    if (filter.opPrefix) {
      args.push(`${filter.opPrefix}%`);
      conditions.push(`op LIKE $${args.length}`);
    }
    if (filter.targetId) {
      args.push(filter.targetId);
      conditions.push(`target_id = $${args.length}`);
    }
    if (filter.actorIp) {
      args.push(filter.actorIp);
      conditions.push(`actor_ip = $${args.length}`);
    }
    if (filter.sinceIso) {
      args.push(filter.sinceIso);
      conditions.push(`created_at >= $${args.length}::timestamptz`);
    }
    args.push(limit);
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.pool.query(
      `
        SELECT
          audit_id,
          created_at,
          actor_token_rev,
          actor_ip,
          actor_user_agent,
          actor_received_at,
          op,
          target_type,
          target_id,
          before_jsonb,
          after_jsonb,
          delta_jsonb,
          success,
          error_message
        FROM ${GM_AUDIT_LOG_TABLE}
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${args.length}
      `,
      args,
    );
    return result.rows.map((row) => ({
      auditId: row.audit_id,
      createdAtIso: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
      op: row.op,
      targetType: row.target_type ?? null,
      targetId: row.target_id ?? null,
      actor: {
        tokenRev: row.actor_token_rev ?? null,
        ip: row.actor_ip ?? null,
        userAgent: row.actor_user_agent ?? null,
        receivedAt: row.actor_received_at instanceof Date
          ? row.actor_received_at.getTime()
          : (typeof row.actor_received_at === 'string' && row.actor_received_at
            ? Date.parse(row.actor_received_at) || null
            : null),
      },
      before: row.before_jsonb ?? {},
      after: row.after_jsonb ?? {},
      delta: row.delta_jsonb ?? {},
      success: row.success === true,
      errorMessage: row.error_message ?? null,
    }));
  }

  /** N45 测试 / 运维清理用：清空指定时间下界之前的审计记录。生产保留至少 90 天。 */
  async pruneBefore(beforeIso: string): Promise<number> {
    if (!this.enabled || !this.pool) {
      return 0;
    }
    const result = await this.pool.query(
      `DELETE FROM ${GM_AUDIT_LOG_TABLE} WHERE created_at < $1::timestamptz`,
      [beforeIso],
    );
    return Number(result.rowCount ?? 0);
  }

  private async ensureTable(): Promise<void> {
    if (!this.pool) return;
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${GM_AUDIT_LOG_TABLE} (
          audit_id uuid PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          actor_token_rev varchar(120),
          actor_ip varchar(80),
          actor_user_agent text,
          actor_received_at timestamptz,
          op varchar(120) NOT NULL,
          target_type varchar(80),
          target_id varchar(160),
          before_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
          after_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
          delta_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
          success boolean NOT NULL,
          error_message text
        )
      `);
      // 索引：按时间查、按目标查、按 op 查；这些是运营 / 内审的高频路径。
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${GM_AUDIT_LOG_TABLE}_created_at_desc_idx
          ON ${GM_AUDIT_LOG_TABLE} (created_at DESC)
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${GM_AUDIT_LOG_TABLE}_target_idx
          ON ${GM_AUDIT_LOG_TABLE} (target_id, created_at DESC)
          WHERE target_id IS NOT NULL
      `);
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${GM_AUDIT_LOG_TABLE}_op_idx
          ON ${GM_AUDIT_LOG_TABLE} (op, created_at DESC)
      `);
    } finally {
      client.release();
    }
  }
}
