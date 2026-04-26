import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import { hostname } from 'node:os';

import { DatabasePoolProvider } from './database-pool.provider';

const NODE_REGISTRY_TABLE = 'node_registry';

const CREATE_NODE_REGISTRY_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${NODE_REGISTRY_TABLE} (
    node_id varchar(120) PRIMARY KEY,
    address varchar(180) NOT NULL,
    port bigint NOT NULL,
    status varchar(32) NOT NULL,
    heartbeat_at timestamptz,
    started_at timestamptz NOT NULL DEFAULT now(),
    capacity_weight bigint NOT NULL DEFAULT 1
  )
`;

const CREATE_NODE_REGISTRY_STATUS_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS node_registry_status_heartbeat_idx
  ON ${NODE_REGISTRY_TABLE}(status, heartbeat_at DESC)
`;

@Injectable()
export class NodeRegistryService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(NodeRegistryService.name);
  private pool: Pool | null = null;
  private enabled = false;
  private readonly nodeId = resolveNodeId();

  constructor(private readonly databasePoolProvider: DatabasePoolProvider | null = null) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('node-registry') ?? null;
    if (!this.pool) {
      this.logger.log('节点注册已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    try {
      await ensureNodeRegistryTable(this.pool);
      this.enabled = true;
      this.logger.log(`节点注册已启用（node_registry），nodeId=${this.nodeId}`);
    } catch (error: unknown) {
      this.logger.error(
        '节点注册初始化失败，已回退为禁用模式',
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

  getNodeId(): string {
    return this.nodeId;
  }

  async registerNode(input: { address: string; port: number; capacityWeight?: number }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    await this.pool.query(
      `
        INSERT INTO ${NODE_REGISTRY_TABLE}(node_id, address, port, status, heartbeat_at, started_at, capacity_weight)
        VALUES ($1, $2, $3, 'running', now(), now(), $4)
        ON CONFLICT (node_id)
        DO UPDATE SET
          address = EXCLUDED.address,
          port = EXCLUDED.port,
          status = 'running',
          heartbeat_at = now(),
          capacity_weight = EXCLUDED.capacity_weight
      `,
      [this.nodeId, input.address.trim(), Math.trunc(input.port), Math.max(1, Math.trunc(input.capacityWeight ?? 1))],
    );
  }

  async heartbeatNode(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    await this.pool.query(
      `
        UPDATE ${NODE_REGISTRY_TABLE}
        SET heartbeat_at = now(), status = 'running'
        WHERE node_id = $1
      `,
      [this.nodeId],
    );
  }

  async deregisterNode(): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }
    await this.pool.query(
      `
        UPDATE ${NODE_REGISTRY_TABLE}
        SET status = 'dead', heartbeat_at = now()
        WHERE node_id = $1
      `,
      [this.nodeId],
    );
  }

  async scanStaleNodes(input: { suspectAfterMs: number; deadAfterMs: number }): Promise<{
    suspectNodeIds: string[];
    deadNodeIds: string[];
  }> {
    if (!this.pool || !this.enabled) {
      return { suspectNodeIds: [], deadNodeIds: [] };
    }

    const suspectAfterMs = Math.max(0, Math.trunc(input.suspectAfterMs));
    const deadAfterMs = Math.max(suspectAfterMs, Math.trunc(input.deadAfterMs));
    const result = await this.pool.query(
      `
        WITH stale AS (
          SELECT
            node_id,
            CASE
              WHEN heartbeat_at IS NULL OR heartbeat_at < now() - ($2::bigint * interval '1 millisecond')
                THEN 'dead'
              WHEN heartbeat_at < now() - ($1::bigint * interval '1 millisecond')
                THEN 'suspect'
              ELSE status
            END AS next_status
          FROM ${NODE_REGISTRY_TABLE}
          WHERE status IN ('running', 'suspect')
        ),
        updated AS (
          UPDATE ${NODE_REGISTRY_TABLE} node
          SET status = stale.next_status
          FROM stale
          WHERE node.node_id = stale.node_id
            AND stale.next_status <> node.status
          RETURNING node.node_id, node.status
        )
        SELECT node_id, status FROM updated
      `,
      [suspectAfterMs, deadAfterMs],
    );

    const suspectNodeIds: string[] = [];
    const deadNodeIds: string[] = [];
    for (const row of result.rows ?? []) {
      const nodeId = typeof row?.node_id === 'string' ? row.node_id.trim() : '';
      const status = typeof row?.status === 'string' ? row.status.trim() : '';
      if (!nodeId) {
        continue;
      }
      if (status === 'suspect') {
        suspectNodeIds.push(nodeId);
      } else if (status === 'dead') {
        deadNodeIds.push(nodeId);
      }
    }
    return { suspectNodeIds, deadNodeIds };
  }

  async listNodes(): Promise<Array<{
    nodeId: string;
    address: string;
    port: number;
    status: string;
    heartbeatAt: string | null;
    startedAt: string;
    capacityWeight: number;
  }>> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `
        SELECT node_id, address, port, status, heartbeat_at, started_at, capacity_weight
        FROM ${NODE_REGISTRY_TABLE}
        ORDER BY started_at DESC, node_id ASC
      `,
    );
    return Array.isArray(result.rows)
      ? result.rows.map((row) => ({
        nodeId: typeof row?.node_id === 'string' ? row.node_id.trim() : '',
        address: typeof row?.address === 'string' ? row.address.trim() : '',
        port: Math.trunc(Number(row?.port ?? 0)),
        status: typeof row?.status === 'string' ? row.status.trim() : '',
        heartbeatAt: row?.heartbeat_at ? String(row.heartbeat_at) : null,
        startedAt: row?.started_at ? String(row.started_at) : '',
        capacityWeight: Math.max(1, Math.trunc(Number(row?.capacity_weight ?? 1))),
      })).filter((entry) => Boolean(entry.nodeId))
      : [];
  }
}

async function ensureNodeRegistryTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_NODE_REGISTRY_TABLE_SQL);
    await client.query(`
      ALTER TABLE ${NODE_REGISTRY_TABLE}
      ALTER COLUMN port TYPE bigint USING port::bigint
    `);
    await client.query(`
      ALTER TABLE ${NODE_REGISTRY_TABLE}
      ALTER COLUMN capacity_weight TYPE bigint USING capacity_weight::bigint
    `);
    await client.query(CREATE_NODE_REGISTRY_STATUS_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function resolveNodeId(): string {
  const explicit = typeof process.env.SERVER_NODE_ID === 'string' ? process.env.SERVER_NODE_ID.trim() : '';
  if (explicit) {
    return explicit;
  }
  const publicPort = Number(
    typeof process.env.SERVER_PUBLIC_PORT === 'string' && process.env.SERVER_PUBLIC_PORT.trim()
      ? process.env.SERVER_PUBLIC_PORT.trim()
      : process.env.SERVER_PORT,
  );
  const stablePort = Number.isFinite(publicPort) ? Math.max(1, Math.trunc(publicPort)) : 13001;
  return `${hostname().trim() || 'node'}:${stablePort}`;
}
