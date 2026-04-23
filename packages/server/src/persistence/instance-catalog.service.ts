import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { DatabasePoolProvider } from './database-pool.provider';

const INSTANCE_CATALOG_TABLE = 'instance_catalog';

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
    cluster_id varchar(120),
    shard_key varchar(120) NOT NULL,
    route_domain varchar(120),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_active_at timestamptz,
    last_persisted_at timestamptz
  )
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

@Injectable()
export class InstanceCatalogService implements OnModuleInit {
  private readonly logger = new Logger(InstanceCatalogService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

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
    lastActiveAt?: string | null;
    lastPersistedAt?: string | null;
    preserveExistingLease?: boolean;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${INSTANCE_CATALOG_TABLE}(
          instance_id, template_id, instance_type, persistent_policy,
          owner_player_id, owner_sect_id, party_id, line_id,
          status, runtime_status,
          assigned_node_id, lease_token, lease_expire_at, ownership_epoch,
          cluster_id, shard_key, route_domain, created_at, last_active_at, last_persisted_at
        )
        VALUES (
          $1, $2, $3, $4,
          $5, $6, $7, $8,
          $9, $10,
          $11, $12, $13, COALESCE($14, 0),
          $15, $16, $17, now(), $18, $19
        )
        ON CONFLICT (instance_id)
        DO UPDATE SET
          template_id = EXCLUDED.template_id,
          instance_type = EXCLUDED.instance_type,
          persistent_policy = EXCLUDED.persistent_policy,
          owner_player_id = EXCLUDED.owner_player_id,
          owner_sect_id = EXCLUDED.owner_sect_id,
          party_id = EXCLUDED.party_id,
          line_id = EXCLUDED.line_id,
          status = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.status
            ELSE EXCLUDED.status
          END,
          runtime_status = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.runtime_status
            ELSE EXCLUDED.runtime_status
          END,
          assigned_node_id = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.assigned_node_id
            ELSE EXCLUDED.assigned_node_id
          END,
          lease_token = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.lease_token
            ELSE EXCLUDED.lease_token
          END,
          lease_expire_at = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.lease_expire_at
            ELSE EXCLUDED.lease_expire_at
          END,
          ownership_epoch = CASE
            WHEN $20 AND ${INSTANCE_CATALOG_TABLE}.assigned_node_id IS NOT NULL THEN ${INSTANCE_CATALOG_TABLE}.ownership_epoch
            ELSE EXCLUDED.ownership_epoch
          END,
          cluster_id = EXCLUDED.cluster_id,
          shard_key = EXCLUDED.shard_key,
          route_domain = EXCLUDED.route_domain,
          last_active_at = EXCLUDED.last_active_at,
          last_persisted_at = EXCLUDED.last_persisted_at
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
        input.clusterId ?? null,
        input.shardKey,
        input.routeDomain ?? null,
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

  async claimInstanceLease(input: {
    instanceId: string;
    nodeId: string;
    leaseToken: string;
    leaseExpireAt: Date;
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
            runtime_status = 'leased',
            last_active_at = now()
        WHERE instance_id = $1
          AND (assigned_node_id IS NULL OR lease_expire_at < now())
        RETURNING ownership_epoch
      `,
      [input.instanceId.trim(), input.nodeId.trim(), input.leaseToken.trim(), input.leaseExpireAt],
    );
    if ((result.rowCount ?? 0) === 0) {
      return { ok: false, ownershipEpoch: null };
    }
    return { ok: true, ownershipEpoch: Number(result.rows[0]?.ownership_epoch ?? null) || null };
  }

  async renewInstanceLease(input: {
    instanceId: string;
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
            last_active_at = now()
        WHERE instance_id = $1
          AND assigned_node_id = $2
          AND lease_token = $3
          AND ownership_epoch = $5
      `,
      [
        input.instanceId.trim(),
        input.nodeId.trim(),
        input.leaseToken.trim(),
        input.leaseExpireAt,
        Math.max(0, Math.trunc(input.expectedOwnershipEpoch)),
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
