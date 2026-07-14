/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const INSTANCE_CATALOG_TABLE = 'instance_catalog';
const MIN_MANUAL_LINE_INDEX = 2;
const MAX_MANUAL_LINE_RESERVATION_RETRIES = 1_024;
const MANUAL_LINE_RESERVATION_TTL_MS = 10 * 60 * 1_000;

const CREATE_INSTANCE_CATALOG_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${INSTANCE_CATALOG_TABLE} (
    instance_id varchar(160) PRIMARY KEY,
    template_id varchar(120) NOT NULL,
    instance_type varchar(32) NOT NULL,
    persistent_policy varchar(32) NOT NULL,
    owner_player_id varchar(100),
    owner_sect_id varchar(100),
    party_id varchar(100),
    line_id varchar(100),
    status varchar(32) NOT NULL,
    runtime_status varchar(32) NOT NULL,
    assigned_node_id varchar(120),
    lease_token varchar(180),
    lease_expire_at timestamptz,
    ownership_epoch bigint NOT NULL DEFAULT 0,
    metadata_version bigint NOT NULL DEFAULT 0,
    cluster_id varchar(120),
    shard_key varchar(120) NOT NULL,
    route_domain varchar(120),
    destroy_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_active_at timestamptz,
    last_persisted_at timestamptz
  )
`;

const ALTER_INSTANCE_CATALOG_ADD_DESTROY_AT_SQL = `
  ALTER TABLE ${INSTANCE_CATALOG_TABLE}
  ADD COLUMN IF NOT EXISTS destroy_at timestamptz
`;

const ALTER_INSTANCE_CATALOG_ADD_METADATA_VERSION_SQL = `
  ALTER TABLE ${INSTANCE_CATALOG_TABLE}
  ADD COLUMN IF NOT EXISTS metadata_version bigint NOT NULL DEFAULT 0
`;

const CREATE_INSTANCE_CATALOG_STATUS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS instance_catalog_status_runtime_status_idx
  ON ${INSTANCE_CATALOG_TABLE}(status, runtime_status)
`;

const CREATE_INSTANCE_CATALOG_ASSIGNED_NODE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS instance_catalog_assigned_node_lease_idx
  ON ${INSTANCE_CATALOG_TABLE}(assigned_node_id, lease_expire_at)
`;

const CREATE_INSTANCE_CATALOG_SHARD_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS instance_catalog_shard_key_idx
  ON ${INSTANCE_CATALOG_TABLE}(shard_key)
`;

/** 实例目录服务：管理实例元数据、状态和租约 */
@Injectable()
export class InstanceCatalogService implements OnModuleInit {
  private readonly logger = new Logger(InstanceCatalogService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('instance-catalog') ?? null;
    if (!this.pool) {
      this.logger.log('实例目录持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    try {
      await ensureInstanceCatalogTable(this.pool);
      this.enabled = true;
      this.logger.log('实例目录持久化已启用（instance_catalog）');
    } catch (error: unknown) {
      this.logger.error(
        '实例目录持久化初始化失败，已回退为禁用模式',
        error instanceof Error ? error.stack : String(error),
      );
      this.pool = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
  }

  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /**
   * 为 GM 手动分线预留一个从未使用过的确定性 ID。
   *
   * 历史 catalog（包括 destroyed/stopped）全部参与编号上界计算；写入只允许 INSERT，
   * 绝不通过 ON CONFLICT UPDATE 复活旧行。事务级 advisory lock 负责同一模板/预设的
   * 跨节点串行，主键冲突重试负责兜住未遵循该锁的并发写入。
   */
  async reserveNextManualLineInstance(input: {
    instanceIdPrefix: string;
    templateId: string;
    persistentPolicy: string;
    routeDomain?: string | null;
    minimumLineIndex?: number;
    occupiedRuntimeInstanceIds?: string[];
    destroyAt?: string | null;
  }): Promise<{ instanceId: string; lineIndex: number; reservationToken: string } | null> {
    const pool = this.pool;
    if (!pool || !this.enabled) {
      return null;
    }
    const instanceIdPrefix = normalizeRequiredCatalogText(input.instanceIdPrefix, 159, 'instance_id_prefix');
    const templateId = normalizeRequiredCatalogText(input.templateId, 120, 'template_id');
    const persistentPolicy = normalizeRequiredCatalogText(input.persistentPolicy, 32, 'persistent_policy');
    const routeDomain = normalizeOptionalCatalogText(input.routeDomain, 120, 'route_domain');
    let nextLineIndex = normalizeManualLineIndex(input.minimumLineIndex, MIN_MANUAL_LINE_INDEX);
    for (const instanceId of input.occupiedRuntimeInstanceIds ?? []) {
      const occupiedLineIndex = parseManualLineIndex(instanceId, instanceIdPrefix);
      if (occupiedLineIndex !== null && occupiedLineIndex >= nextLineIndex) {
        nextLineIndex = occupiedLineIndex + 1;
      }
    }

    const client = await pool.connect();
    let transactionStarted = false;
    try {
      await client.query('BEGIN');
      transactionStarted = true;
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1::text))',
        [`gm-manual-line:${instanceIdPrefix}`],
      );
      const catalogRows = await client.query(
        `SELECT instance_id
           FROM ${INSTANCE_CATALOG_TABLE}
          WHERE left(instance_id, char_length($1::text)) = $1`,
        [instanceIdPrefix],
      );
      for (const row of catalogRows.rows) {
        const catalogLineIndex = parseManualLineIndex(row?.instance_id, instanceIdPrefix);
        if (catalogLineIndex !== null && catalogLineIndex >= nextLineIndex) {
          nextLineIndex = catalogLineIndex + 1;
        }
      }

      for (let attempt = 0; attempt < MAX_MANUAL_LINE_RESERVATION_RETRIES; attempt += 1) {
        if (!Number.isSafeInteger(nextLineIndex) || nextLineIndex < MIN_MANUAL_LINE_INDEX) {
          throw new Error(`manual_line_index_exhausted:${instanceIdPrefix}`);
        }
        const instanceId = `${instanceIdPrefix}${nextLineIndex}`;
        const reservationToken = `reservation:${randomBytes(18).toString('base64url')}`;
        const reservationExpireAt = new Date(Date.now() + MANUAL_LINE_RESERVATION_TTL_MS);
        if (instanceId.length > 160) {
          throw new Error(`manual_line_instance_id_too_long:${instanceIdPrefix}`);
        }
        const inserted = await client.query(
          `INSERT INTO ${INSTANCE_CATALOG_TABLE}(
             instance_id, template_id, instance_type, persistent_policy,
             owner_player_id, owner_sect_id, party_id, line_id,
             status, runtime_status,
             assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
             metadata_version, cluster_id, shard_key, route_domain, destroy_at,
             created_at, last_active_at, last_persisted_at
           )
           VALUES (
             $1, $2, 'public', $3,
             NULL, NULL, NULL, NULL,
             'active', 'creating',
             NULL, $6, $7, 0,
             0, NULL, $1, $4, $5,
             now(), now(), NULL
           )
           ON CONFLICT (instance_id) DO NOTHING
           RETURNING instance_id`,
          [
            instanceId,
            templateId,
            persistentPolicy,
            routeDomain,
            input.destroyAt ?? null,
            reservationToken,
            reservationExpireAt,
          ],
        );
        if ((inserted.rowCount ?? 0) === 1) {
          await client.query('COMMIT');
          transactionStarted = false;
          return { instanceId, lineIndex: nextLineIndex, reservationToken };
        }
        nextLineIndex += 1;
      }
      throw new Error(`manual_line_reservation_retry_exhausted:${instanceIdPrefix}`);
    } catch (error) {
      if (transactionStarted) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 确认手动分线 runtime 仍持有未过期的精确预留。
   *
   * 预留在真正 claim 前始终保持 creating，避免普通 upsert 清掉 reservation token，
   * 也避免另一条普通租约链把尚未完成构造的实例提前开放。
   */
  async confirmManualLineReservation(input: {
    instanceId: string;
    reservationToken: string;
    expectedTemplateId: string;
    expectedInstanceType: string;
    expectedPersistentPolicy: string;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET last_active_at = now()
        WHERE instance_id = $1
          AND template_id = $3
          AND instance_type = $4
          AND persistent_policy = $5
          AND status = 'active'
          AND runtime_status = 'creating'
          AND assigned_node_id IS NULL
          AND lease_token = $2
          AND lease_expire_at IS NOT NULL
          AND lease_expire_at > now()
          AND ownership_epoch = 0`,
      [
        input.instanceId.trim(),
        input.reservationToken.trim(),
        input.expectedTemplateId.trim(),
        input.expectedInstanceType.trim(),
        input.expectedPersistentPolicy.trim(),
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /** 仅回收尚未进入 runtime 注册链的手动分线预留，并保留为永久 tombstone。 */
  async abandonManualLineReservation(instanceIdInput: string, reservationTokenInput: string): Promise<boolean> {
    const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
    const reservationToken = typeof reservationTokenInput === 'string' ? reservationTokenInput.trim() : '';
    if (!this.pool || !this.enabled || !instanceId || !reservationToken) {
      return false;
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET status = 'destroyed',
              runtime_status = 'stopped',
              lease_token = NULL,
              lease_expire_at = NULL,
              ownership_epoch = ownership_epoch + 1,
              metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
              destroy_at = now(),
              last_active_at = now()
        WHERE instance_id = $1
          AND status = 'active'
          AND runtime_status = 'creating'
          AND assigned_node_id IS NULL
          AND lease_token = $2
          AND ownership_epoch = 0`,
      [instanceId, reservationToken],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /** 将超时且从未进入 runtime 的预留转成永久 tombstone，编号仍永不复用。 */
  async cleanupStaleManualLineReservations(): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET status = 'destroyed',
              runtime_status = 'stopped',
              assigned_node_id = NULL,
              lease_token = NULL,
              lease_expire_at = NULL,
              ownership_epoch = ownership_epoch + 1,
              metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
              destroy_at = COALESCE(destroy_at, now()),
              last_active_at = now()
        WHERE status = 'active'
          AND runtime_status = 'creating'
          AND assigned_node_id IS NULL
          AND lease_token LIKE 'reservation:%'
          AND lease_expire_at IS NOT NULL
          AND lease_expire_at <= now()
          AND ownership_epoch = 0
        RETURNING instance_id`,
    );
    return result.rows
      .map((row) => typeof row?.instance_id === 'string' ? row.instance_id.trim() : '')
      .filter(Boolean);
  }

  async upsertInstanceCatalog(input: {
    instanceId: string;
    templateId: string;
    instanceType: string;
    persistentPolicy: string;
    ownerPlayerId?: string | null;
    ownerSectId?: string | null;
    partyId?: string | null;
    lineId?: string | null;
    status: string;
    runtimeStatus: string;
    assignedNodeId?: string | null;
    leaseToken?: string | null;
    leaseExpireAt?: string | null;
    ownershipEpoch?: number | null;
    clusterId?: string | null;
    shardKey: string;
    routeDomain?: string | null;
    destroyAt?: string | null;
    lastActiveAt?: string | null;
    lastPersistedAt?: string | null;
    preserveExistingLease?: boolean;
    metadataVersion?: number | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    const metadataVersion = Math.max(
      0,
      Math.trunc(Number(input.metadataVersion ?? input.ownershipEpoch ?? 0) || 0),
    );
    await this.pool.query(
      `
        INSERT INTO ${INSTANCE_CATALOG_TABLE}(
          instance_id, template_id, instance_type, persistent_policy,
          owner_player_id, owner_sect_id, party_id, line_id,
          status, runtime_status,
          assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
          metadata_version, cluster_id, shard_key, route_domain, destroy_at, created_at, last_active_at, last_persisted_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13, COALESCE($14, 0),
          $15, $16, $17, $18, $19, now(), $20, $21
        )
        ON CONFLICT (instance_id)
        DO UPDATE SET
          template_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.template_id ELSE ${INSTANCE_CATALOG_TABLE}.template_id END,
          instance_type = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.instance_type ELSE ${INSTANCE_CATALOG_TABLE}.instance_type END,
          persistent_policy = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.persistent_policy ELSE ${INSTANCE_CATALOG_TABLE}.persistent_policy END,
          owner_player_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.owner_player_id ELSE ${INSTANCE_CATALOG_TABLE}.owner_player_id END,
          owner_sect_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.owner_sect_id ELSE ${INSTANCE_CATALOG_TABLE}.owner_sect_id END,
          party_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.party_id ELSE ${INSTANCE_CATALOG_TABLE}.party_id END,
          line_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.line_id ELSE ${INSTANCE_CATALOG_TABLE}.line_id END,
          status = CASE
            WHEN $22
              AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_token IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at > now()
            THEN ${INSTANCE_CATALOG_TABLE}.status
            ELSE EXCLUDED.status
          END,
          runtime_status = CASE
            WHEN $22
              AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_token IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at > now()
            THEN ${INSTANCE_CATALOG_TABLE}.runtime_status
            ELSE EXCLUDED.runtime_status
          END,
          assigned_node_id = CASE
            WHEN $22
              AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_token IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at > now()
            THEN ${INSTANCE_CATALOG_TABLE}.assigned_node_id
            ELSE EXCLUDED.assigned_node_id
          END,
          lease_token = CASE
            WHEN $22
              AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_token IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at > now()
            THEN ${INSTANCE_CATALOG_TABLE}.lease_token
            ELSE EXCLUDED.lease_token
          END,
          lease_expire_at = CASE
            WHEN $22
              AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_token IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at IS NOT NULL
              AND ${INSTANCE_CATALOG_TABLE}.lease_expire_at > now()
            THEN ${INSTANCE_CATALOG_TABLE}.lease_expire_at
            ELSE EXCLUDED.lease_expire_at
          END,
          ownership_epoch = GREATEST(
            ${INSTANCE_CATALOG_TABLE}.ownership_epoch,
            EXCLUDED.ownership_epoch
          ),
          metadata_version = GREATEST(${INSTANCE_CATALOG_TABLE}.metadata_version, EXCLUDED.metadata_version),
          cluster_id = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.cluster_id ELSE ${INSTANCE_CATALOG_TABLE}.cluster_id END,
          shard_key = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.shard_key ELSE ${INSTANCE_CATALOG_TABLE}.shard_key END,
          route_domain = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.route_domain ELSE ${INSTANCE_CATALOG_TABLE}.route_domain END,
          destroy_at = CASE WHEN ${INSTANCE_CATALOG_TABLE}.metadata_version <= EXCLUDED.metadata_version THEN EXCLUDED.destroy_at ELSE ${INSTANCE_CATALOG_TABLE}.destroy_at END,
          last_active_at = CASE
            WHEN ${INSTANCE_CATALOG_TABLE}.last_active_at IS NULL THEN EXCLUDED.last_active_at
            WHEN EXCLUDED.last_active_at IS NULL THEN ${INSTANCE_CATALOG_TABLE}.last_active_at
            ELSE GREATEST(${INSTANCE_CATALOG_TABLE}.last_active_at, EXCLUDED.last_active_at)
          END,
          last_persisted_at = CASE
            WHEN ${INSTANCE_CATALOG_TABLE}.last_persisted_at IS NULL THEN EXCLUDED.last_persisted_at
            WHEN EXCLUDED.last_persisted_at IS NULL THEN ${INSTANCE_CATALOG_TABLE}.last_persisted_at
            ELSE GREATEST(${INSTANCE_CATALOG_TABLE}.last_persisted_at, EXCLUDED.last_persisted_at)
          END
        WHERE ${INSTANCE_CATALOG_TABLE}.status <> 'destroyed'
          AND ${INSTANCE_CATALOG_TABLE}.runtime_status <> 'stopped'
          AND (
            ${INSTANCE_CATALOG_TABLE}.destroy_at IS NULL
            OR ${INSTANCE_CATALOG_TABLE}.destroy_at > now()
          )
      `,
      [
        input.instanceId,
        input.templateId,
        input.instanceType,
        input.persistentPolicy,
        input.ownerPlayerId ?? null,
        input.ownerSectId ?? null,
        input.partyId ?? null,
        input.lineId ?? null,
        input.status,
        input.runtimeStatus,
        input.assignedNodeId ?? null,
        input.leaseToken ?? null,
        input.leaseExpireAt ?? null,
        input.ownershipEpoch ?? null,
        metadataVersion,
        input.clusterId ?? null,
        input.shardKey,
        input.routeDomain ?? null,
        input.destroyAt ?? null,
        input.lastActiveAt ?? null,
        input.lastPersistedAt ?? null,
        input.preserveExistingLease === true,
      ],
    );
  }

  async loadInstanceCatalog(instanceId: string): Promise<Record<string, unknown> | null> {
    if (!this.pool || !this.enabled || !instanceId.trim()) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT * FROM ${INSTANCE_CATALOG_TABLE} WHERE instance_id = $1 LIMIT 1`,
      [instanceId.trim()],
    );
    return (result.rowCount ?? 0) > 0 ? (result.rows[0] as Record<string, unknown>) : null;
  }

  async listInstanceCatalogEntries(): Promise<Record<string, unknown>[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(`SELECT * FROM ${INSTANCE_CATALOG_TABLE} ORDER BY instance_id ASC`);
    return Array.isArray(result.rows) ? (result.rows as Record<string, unknown>[]) : [];
  }

  async updateInstanceStatus(instanceId: string, status: string, runtimeStatus: string): Promise<void> {
    if (!this.pool || !this.enabled || !instanceId.trim()) {
      return;
    }
    await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET status = $2, runtime_status = $3, last_active_at = now()
        WHERE instance_id = $1
      `,
      [instanceId.trim(), status, runtimeStatus],
    );
  }

  /**
   * 以当前 lease/epoch 为 CAS 销毁实例目录，并递增 epoch 隔离所有旧 flush writer。
   * 销毁必须持有当前有效 lease；未 claim 的创建失败由专用 reservation token 回收链处理。
   */
  async destroyInstanceCatalogWithFence(input: {
    instanceId: string;
    assignedNodeId?: string | null;
    leaseToken?: string | null;
    expectedOwnershipEpoch: number;
    destroyAt?: string | Date | null;
  }): Promise<{ ok: boolean; ownershipEpoch: number | null }> {
    const instanceId = input.instanceId.trim();
    if (!this.pool || !this.enabled || !instanceId) {
      return { ok: false, ownershipEpoch: null };
    }
    const assignedNodeId = typeof input.assignedNodeId === 'string' && input.assignedNodeId.trim()
      ? input.assignedNodeId.trim()
      : null;
    const leaseToken = typeof input.leaseToken === 'string' && input.leaseToken.trim()
      ? input.leaseToken.trim()
      : null;
    const expectedOwnershipEpoch = Number(input.expectedOwnershipEpoch);
    if ((assignedNodeId === null) !== (leaseToken === null)
      || !Number.isSafeInteger(expectedOwnershipEpoch)
      || expectedOwnershipEpoch < 0) {
      return { ok: false, ownershipEpoch: null };
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET status = 'destroyed',
              runtime_status = 'stopped',
              assigned_node_id = NULL,
              lease_token = NULL,
              lease_expire_at = NULL,
              ownership_epoch = ownership_epoch + 1,
              metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
              destroy_at = COALESCE($5::timestamptz, now()),
              last_active_at = now()
        WHERE instance_id = $1
          AND ownership_epoch = $4
          AND $2::varchar IS NOT NULL
          AND $3::varchar IS NOT NULL
          AND assigned_node_id = $2
          AND lease_token = $3
          AND lease_expire_at > now()
        RETURNING ownership_epoch`,
      [
        instanceId,
        assignedNodeId,
        leaseToken,
        expectedOwnershipEpoch,
        input.destroyAt ?? null,
      ],
    );
    if ((result.rowCount ?? 0) !== 1) {
      return { ok: false, ownershipEpoch: null };
    }
    return {
      ok: true,
      ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null,
    };
  }

  /** GM 创建失败后以当前 lease/epoch 标记待清理，阻止重启恢复和新玩家接入。 */
  async markInstanceCleanupPendingWithFence(input: {
    instanceId: string;
    assignedNodeId: string;
    leaseToken: string;
    expectedOwnershipEpoch: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET runtime_status = 'cleanup_pending',
              destroy_at = now(),
              last_active_at = now()
        WHERE instance_id = $1
          AND status = 'active'
          AND assigned_node_id = $2
          AND lease_token = $3
          AND ownership_epoch = $4`,
      [
        input.instanceId.trim(),
        input.assignedNodeId.trim(),
        input.leaseToken.trim(),
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
      ],
    );
    return (result.rowCount ?? 0) === 1;
  }

  /** 仅在 cleanup_pending 已无有效 owner 时推进永久 tombstone，供崩溃恢复收尾。 */
  async cleanupAbandonedPendingInstances(): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `UPDATE ${INSTANCE_CATALOG_TABLE}
          SET status = 'destroyed',
              runtime_status = 'stopped',
              assigned_node_id = NULL,
              lease_token = NULL,
              lease_expire_at = NULL,
              ownership_epoch = ownership_epoch + 1,
              metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
              destroy_at = COALESCE(destroy_at, now()),
              last_active_at = now()
        WHERE status = 'active'
          AND runtime_status = 'cleanup_pending'
          AND destroy_at IS NOT NULL
          AND destroy_at <= now()
          AND (
            assigned_node_id IS NULL
            OR lease_token IS NULL
            OR lease_expire_at IS NULL
            OR lease_expire_at <= now()
          )
        RETURNING instance_id`,
    );
    return result.rows
      .map((row) => typeof row?.instance_id === 'string' ? row.instance_id.trim() : '')
      .filter(Boolean);
  }

  async markInstanceTemplateMissing(input: {
    instanceId: string;
    templateId: string;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled || !input.instanceId.trim() || !input.templateId.trim()) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET status = 'active',
            runtime_status = 'template_missing',
            assigned_node_id = NULL,
            lease_token = NULL,
            lease_expire_at = NULL,
            last_active_at = now()
        WHERE instance_id = $1
          AND template_id = $2
          AND (
            status <> 'active'
            OR runtime_status <> 'template_missing'
            OR assigned_node_id IS NOT NULL
            OR lease_token IS NOT NULL
            OR lease_expire_at IS NOT NULL
          )
      `,
      [input.instanceId.trim(), input.templateId.trim()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async claimInstanceLease(input: {
    instanceId: string;
    expectedTemplateId?: string | null;
    expectedInstanceType?: string | null;
    nodeId: string;
    leaseToken: string;
    leaseExpireAt: Date;
    expectedOwnershipEpoch: number;
    expectedReservationToken?: string | null;
  }): Promise<{ ok: boolean; ownershipEpoch: number | null }> {
    if (!this.pool || !this.enabled) {
      return { ok: false, ownershipEpoch: null };
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = $2,
            lease_token = $3,
            lease_expire_at = $4,
            ownership_epoch = ownership_epoch + 1,
            metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
            status = 'active',
            runtime_status = 'leased',
            last_active_at = now()
        WHERE instance_id = $1
          AND ownership_epoch = $5
          AND status <> 'destroyed'
          AND runtime_status <> 'stopped'
          AND (destroy_at IS NULL OR destroy_at > now())
          AND ($6::varchar IS NULL OR template_id = $6)
          AND ($7::varchar IS NULL OR instance_type = $7)
          AND (
            (
              $8::varchar IS NOT NULL
              AND runtime_status = 'creating'
              AND assigned_node_id IS NULL
              AND lease_token = $8
              AND lease_expire_at IS NOT NULL
              AND lease_expire_at > now()
            )
            OR (
              $8::varchar IS NULL
              AND runtime_status <> 'creating'
              AND (
                assigned_node_id IS NULL
                OR lease_token IS NULL
                OR lease_expire_at IS NULL
                OR lease_expire_at < now()
              )
            )
          )
        RETURNING ownership_epoch
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
        input.leaseExpireAt,
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
        typeof input.expectedTemplateId === 'string' && input.expectedTemplateId.trim()
          ? input.expectedTemplateId.trim()
          : null,
        typeof input.expectedInstanceType === 'string' && input.expectedInstanceType.trim()
          ? input.expectedInstanceType.trim()
          : null,
        typeof input.expectedReservationToken === 'string' && input.expectedReservationToken.trim()
          ? input.expectedReservationToken.trim()
          : null,
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      return { ok: false, ownershipEpoch: null };
    }
    return { ok: true, ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null };
  }

  /**
   * 以精确 ownership epoch 复活已经回收、但 ID 可复用的实例。
   *
   * 普通 claim 不负责清 tombstone；只有调用方已经从权威 catalog/位置链确认这是同一
   * 稳定实例时才允许走此入口，避免 epoch=0 的临时 runtime 擅自复活历史实例。
   */
  async reviveInstanceLeaseWithFence(input: {
    instanceId: string;
    expectedTemplateId: string;
    expectedInstanceType: string;
    expectedCurrentNodeId?: string | null;
    expectedCurrentLeaseToken?: string | null;
    nodeId: string;
    leaseToken: string;
    leaseExpireAt: Date;
    expectedOwnershipEpoch: number;
  }): Promise<{ ok: boolean; ownershipEpoch: number | null }> {
    if (!this.pool || !this.enabled) {
      return { ok: false, ownershipEpoch: null };
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = $2,
            lease_token = $3,
            lease_expire_at = $4,
            ownership_epoch = ownership_epoch + 1,
            metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
            status = 'active',
            runtime_status = 'leased',
            destroy_at = NULL,
            last_active_at = now()
        WHERE instance_id = $1
          AND ownership_epoch = $5
          AND template_id = $6
          AND instance_type = $7
          AND runtime_status NOT IN ('cleanup_pending', 'creating', 'template_missing')
          AND (destroy_at IS NULL OR destroy_at <= now())
          AND (
            status = 'destroyed'
            OR runtime_status = 'stopped'
          )
          AND (
            assigned_node_id IS NULL
            OR lease_token IS NULL
            OR lease_expire_at IS NULL
            OR lease_expire_at < now()
            OR (
              $8::varchar IS NOT NULL
              AND $9::varchar IS NOT NULL
              AND $8 = $2
              AND assigned_node_id = $8
              AND lease_token = $9
            )
          )
        RETURNING ownership_epoch
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
        input.leaseExpireAt,
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
        input.expectedTemplateId.trim(),
        input.expectedInstanceType.trim(),
        typeof input.expectedCurrentNodeId === 'string' && input.expectedCurrentNodeId.trim()
          ? input.expectedCurrentNodeId.trim()
          : null,
        typeof input.expectedCurrentLeaseToken === 'string' && input.expectedCurrentLeaseToken.trim()
          ? input.expectedCurrentLeaseToken.trim()
          : null,
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      return { ok: false, ownershipEpoch: null };
    }
    return { ok: true, ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null };
  }

  async renewInstanceLease(input: {
    instanceId: string;
    expectedTemplateId?: string | null;
    expectedInstanceType?: string | null;
    nodeId: string;
    leaseToken: string;
    leaseExpireAt: Date;
    expectedOwnershipEpoch: number;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET lease_expire_at = $4,
            status = 'active',
            runtime_status = 'leased',
            last_active_at = now()
        WHERE instance_id = $1
          AND assigned_node_id = $2
          AND lease_token = $3
          AND runtime_status NOT IN ('cleanup_pending', 'creating')
          AND ownership_epoch = $5
          AND status <> 'destroyed'
          AND runtime_status <> 'stopped'
          AND runtime_status <> 'creating'
          AND (destroy_at IS NULL OR destroy_at > now())
          AND ($6::varchar IS NULL OR template_id = $6)
          AND ($7::varchar IS NULL OR instance_type = $7)
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
        input.leaseExpireAt,
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
        typeof input.expectedTemplateId === 'string' && input.expectedTemplateId.trim()
          ? input.expectedTemplateId.trim()
          : null,
        typeof input.expectedInstanceType === 'string' && input.expectedInstanceType.trim()
          ? input.expectedInstanceType.trim()
          : null,
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** 强制接管实例 lease，无视当前 lease 是否过期（仅 dev/test 启动恢复使用）。 */
  async forceClaimInstanceLease(input: {
    instanceId: string;
    nodeId: string;
    leaseToken: string;
    leaseExpireAt: Date;
    expectedOwnershipEpoch: number;
  }): Promise<{ ok: boolean; ownershipEpoch: number | null }> {
    if (!this.pool || !this.enabled) {
      return { ok: false, ownershipEpoch: null };
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = $2,
            lease_token = $3,
            lease_expire_at = $4,
            ownership_epoch = ownership_epoch + 1,
            metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
            status = 'active',
            runtime_status = 'leased',
            last_active_at = now()
        WHERE instance_id = $1
          AND ownership_epoch = $5
          AND status <> 'destroyed'
          AND runtime_status <> 'stopped'
          AND runtime_status <> 'creating'
          AND (destroy_at IS NULL OR destroy_at > now())
        RETURNING ownership_epoch
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
        input.leaseExpireAt,
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      return { ok: false, ownershipEpoch: null };
    }
    return { ok: true, ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null };
  }

  async migrateInstanceLease(input: {
    instanceId: string;
    sourceNodeId: string;
    sourceLeaseToken: string;
    targetNodeId: string;
    leaseExpireAt: Date;
    expectedOwnershipEpoch: number;
  }): Promise<{ ok: boolean; ownershipEpoch: number | null }> {
    if (!this.pool || !this.enabled) {
      return { ok: false, ownershipEpoch: null };
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = $5,
            lease_token = NULL,
            lease_expire_at = $6,
            ownership_epoch = ownership_epoch + 1,
            metadata_version = GREATEST(metadata_version, ownership_epoch + 1),
            status = 'active',
            runtime_status = 'leased',
            last_active_at = now()
        WHERE instance_id = $1
          AND assigned_node_id = $2
          AND lease_token = $3
          AND ownership_epoch = $4
        RETURNING ownership_epoch
      `,
      [
        input.instanceId.trim(),
        input.sourceNodeId.trim(),
        input.sourceLeaseToken.trim(),
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
        input.targetNodeId.trim(),
        input.leaseExpireAt,
      ],
    );
    if ((result.rowCount ?? 0) === 0) {
      return { ok: false, ownershipEpoch: null };
    }
    return { ok: true, ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null };
  }

  async releaseInstanceLease(input: {
    instanceId: string;
    nodeId: string;
    leaseToken: string;
  }): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const result = await this.pool.query(
      `
        UPDATE ${INSTANCE_CATALOG_TABLE}
        SET assigned_node_id = NULL,
            lease_token = NULL,
            lease_expire_at = NULL,
            runtime_status = 'running',
            last_active_at = now()
        WHERE instance_id = $1
          AND assigned_node_id = $2
          AND lease_token = $3
          AND runtime_status NOT IN ('cleanup_pending', 'creating')
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
      ],
    );
    return (result.rowCount ?? 0) > 0;
  }
}

async function ensureInstanceCatalogTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_INSTANCE_CATALOG_TABLE_SQL);
    await client.query(ALTER_INSTANCE_CATALOG_ADD_DESTROY_AT_SQL);
    await client.query(ALTER_INSTANCE_CATALOG_ADD_METADATA_VERSION_SQL);
    await client.query(CREATE_INSTANCE_CATALOG_STATUS_INDEX_SQL);
    await client.query(CREATE_INSTANCE_CATALOG_ASSIGNED_NODE_INDEX_SQL);
    await client.query(CREATE_INSTANCE_CATALOG_SHARD_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeRequiredCatalogText(input: unknown, maxLength: number, field: string): string {
  const value = typeof input === 'string' ? input.trim() : '';
  if (!value || value.length > maxLength) {
    throw new Error(`invalid_${field}`);
  }
  return value;
}

function normalizeOptionalCatalogText(input: unknown, maxLength: number, field: string): string | null {
  if (input === null || input === undefined || input === '') {
    return null;
  }
  return normalizeRequiredCatalogText(input, maxLength, field);
}

function normalizeManualLineIndex(input: unknown, fallback: number): number {
  const value = Number(input);
  return Number.isSafeInteger(value) && value >= MIN_MANUAL_LINE_INDEX
    ? value
    : fallback;
}

function parseManualLineIndex(instanceIdInput: unknown, instanceIdPrefix: string): number | null {
  const instanceId = typeof instanceIdInput === 'string' ? instanceIdInput.trim() : '';
  if (!instanceId.startsWith(instanceIdPrefix)) {
    return null;
  }
  const suffix = instanceId.slice(instanceIdPrefix.length);
  if (!/^[0-9]+$/.test(suffix)) {
    return null;
  }
  const lineIndex = Number(suffix);
  return Number.isSafeInteger(lineIndex) && lineIndex >= MIN_MANUAL_LINE_INDEX
    ? lineIndex
    : null;
}
