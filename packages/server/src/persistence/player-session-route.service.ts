import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';

import { NodeRegistryService } from './node-registry.service';
import { DatabasePoolProvider } from './database-pool.provider';

const PLAYER_SESSION_ROUTE_TABLE = 'player_session_route';
const NODE_REGISTRY_TABLE = 'node_registry';

const CREATE_PLAYER_SESSION_ROUTE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_SESSION_ROUTE_TABLE} (
    player_id varchar(120) PRIMARY KEY,
    node_id varchar(120) NOT NULL,
    session_epoch bigint NOT NULL,
    route_status varchar(32) NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now()
  )
`;

const CREATE_PLAYER_SESSION_ROUTE_NODE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS player_session_route_node_status_idx
  ON ${PLAYER_SESSION_ROUTE_TABLE}(node_id, route_status, updated_at DESC)
`;

export interface PersistedPlayerSessionRoute {
  playerId: string;
  nodeId: string;
  sessionEpoch: number;
  routeStatus: string;
  updatedAt: string;
}

export interface ResolvedPlayerSessionRouteTarget {
  playerId: string;
  targetNodeId: string;
  localNodeId: string;
  source: 'route' | 'assigned' | 'fallback_local';
  routeStatus: string | null;
  sessionEpoch: number | null;
  routePersisted: boolean;
  isLocalTarget: boolean;
  targetAddress: string | null;
  targetPort: number | null;
  targetServerUrl: string | null;
}

@Injectable()
export class PlayerSessionRouteService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerSessionRouteService.name);
  private pool: Pool | null = null;
  private enabled = false;

  constructor(
    private readonly nodeRegistryService: NodeRegistryService,
    private readonly databasePoolProvider?: DatabasePoolProvider | null,
  ) {}

  async onModuleInit(): Promise<void> {
    this.pool = this.databasePoolProvider?.getPool('player-session-route') ?? null;
    if (!this.pool) {
      this.logger.log('玩家会话路由已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    try {
      await ensurePlayerSessionRouteTable(this.pool);
      this.enabled = true;
      this.logger.log(`玩家会话路由已启用（${PLAYER_SESSION_ROUTE_TABLE}），nodeId=${this.nodeRegistryService.getNodeId()}`);
    } catch (error: unknown) {
      this.logger.error(
        '玩家会话路由初始化失败，已回退为禁用模式',
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

  getLocalNodeId(): string {
    return this.nodeRegistryService.getNodeId();
  }

  async registerLocalRoute(input: {
    playerId: string;
    sessionEpoch: number;
    routeStatus?: string | null;
  }): Promise<void> {
    await this.registerRoute({
      playerId: input.playerId,
      nodeId: this.nodeRegistryService.getNodeId(),
      sessionEpoch: input.sessionEpoch,
      routeStatus: input.routeStatus,
    });
  }

  async registerRoute(input: {
    playerId: string;
    nodeId: string;
    sessionEpoch: number;
    routeStatus?: string | null;
  }): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const playerId = normalizePlayerId(input.playerId);
    const nodeId = typeof input.nodeId === 'string' ? input.nodeId.trim() : '';
    const sessionEpoch = normalizeSessionEpoch(input.sessionEpoch);
    const routeStatus = normalizeRouteStatus(input.routeStatus);
    if (!playerId || !nodeId || sessionEpoch <= 0) {
      return;
    }

    await this.pool.query(
      `
        INSERT INTO ${PLAYER_SESSION_ROUTE_TABLE}(player_id, node_id, session_epoch, route_status, updated_at)
        VALUES ($1, $2, $3, $4, now())
        ON CONFLICT (player_id)
        DO UPDATE SET
          node_id = CASE
            WHEN EXCLUDED.session_epoch >= ${PLAYER_SESSION_ROUTE_TABLE}.session_epoch
              THEN EXCLUDED.node_id
            ELSE ${PLAYER_SESSION_ROUTE_TABLE}.node_id
          END,
          session_epoch = GREATEST(${PLAYER_SESSION_ROUTE_TABLE}.session_epoch, EXCLUDED.session_epoch),
          route_status = CASE
            WHEN EXCLUDED.session_epoch >= ${PLAYER_SESSION_ROUTE_TABLE}.session_epoch
              THEN EXCLUDED.route_status
            ELSE ${PLAYER_SESSION_ROUTE_TABLE}.route_status
          END,
          updated_at = CASE
            WHEN EXCLUDED.session_epoch >= ${PLAYER_SESSION_ROUTE_TABLE}.session_epoch
              THEN now()
            ELSE ${PLAYER_SESSION_ROUTE_TABLE}.updated_at
          END
      `,
      [playerId, nodeId, sessionEpoch, routeStatus],
    );
  }

  async clearLocalRoute(playerId: string, sessionEpoch?: number | null): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const normalizedPlayerId = normalizePlayerId(playerId);
    const localNodeId = this.nodeRegistryService.getNodeId().trim();
    if (!normalizedPlayerId) {
      return;
    }
    if (!localNodeId) {
      return;
    }

    const normalizedSessionEpoch = normalizeSessionEpoch(sessionEpoch);
    if (normalizedSessionEpoch > 0) {
      await this.pool.query(
        `
          DELETE FROM ${PLAYER_SESSION_ROUTE_TABLE}
          WHERE player_id = $1 AND node_id = $2 AND session_epoch <= $3
        `,
        [normalizedPlayerId, localNodeId, normalizedSessionEpoch],
      );
      return;
    }

    await this.pool.query(
      `DELETE FROM ${PLAYER_SESSION_ROUTE_TABLE} WHERE player_id = $1 AND node_id = $2`,
      [normalizedPlayerId, localNodeId],
    );
  }

  async clearLocalRoutes(playerIds: string[]): Promise<void> {
    if (!this.pool || !this.enabled) {
      return;
    }

    const normalizedPlayerIds = Array.from(
      new Set(
        playerIds
          .map((playerId) => normalizePlayerId(playerId))
          .filter((playerId) => playerId.length > 0),
      ),
    );
    const localNodeId = this.nodeRegistryService.getNodeId().trim();
    if (normalizedPlayerIds.length === 0) {
      return;
    }
    if (!localNodeId) {
      return;
    }

    await this.pool.query(
      `DELETE FROM ${PLAYER_SESSION_ROUTE_TABLE} WHERE player_id = ANY($1::varchar[]) AND node_id = $2`,
      [normalizedPlayerIds, localNodeId],
    );
  }

  async loadRoute(playerId: string): Promise<PersistedPlayerSessionRoute | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }

    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!normalizedPlayerId) {
      return null;
    }

    const result = await this.pool.query(
      `
        SELECT player_id, node_id, session_epoch, route_status, updated_at
        FROM ${PLAYER_SESSION_ROUTE_TABLE}
        WHERE player_id = $1
        LIMIT 1
      `,
      [normalizedPlayerId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }

    return {
      playerId: normalizePlayerId(row.player_id),
      nodeId: typeof row.node_id === 'string' ? row.node_id.trim() : '',
      sessionEpoch: normalizeSessionEpoch(row.session_epoch),
      routeStatus: normalizeRouteStatus(row.route_status),
      updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at ?? ''),
    };
  }

  async resolveBootstrapTarget(playerId: string): Promise<ResolvedPlayerSessionRouteTarget> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const localNodeId = this.nodeRegistryService.getNodeId();
    if (!normalizedPlayerId || !this.pool || !this.enabled) {
      return {
        playerId: normalizedPlayerId,
        targetNodeId: localNodeId,
        localNodeId,
        source: 'fallback_local',
        routeStatus: null,
        sessionEpoch: null,
        routePersisted: false,
        isLocalTarget: true,
        targetAddress: null,
        targetPort: null,
        targetServerUrl: null,
      };
    }

    const existingRoute = await this.loadRoute(normalizedPlayerId);
    if (existingRoute?.nodeId) {
      const targetNode = await this.loadRunningNode(existingRoute.nodeId);
      if (!targetNode) {
        const reassignedSessionEpoch = Math.max(1, existingRoute.sessionEpoch);
        await this.registerRoute({
          playerId: normalizedPlayerId,
          nodeId: localNodeId,
          sessionEpoch: reassignedSessionEpoch,
          routeStatus: 'assigned',
        });
        return {
          playerId: normalizedPlayerId,
          targetNodeId: localNodeId,
          localNodeId,
          source: 'fallback_local',
          routeStatus: 'assigned',
          sessionEpoch: reassignedSessionEpoch,
          routePersisted: true,
          isLocalTarget: true,
          targetAddress: null,
          targetPort: null,
          targetServerUrl: null,
        };
      }
      const source =
        existingRoute.routeStatus === 'assigned'
          ? 'assigned'
          : 'route';
      return {
        playerId: normalizedPlayerId,
        targetNodeId: existingRoute.nodeId,
        localNodeId,
        source,
        routeStatus: existingRoute.routeStatus,
        sessionEpoch: existingRoute.sessionEpoch,
        routePersisted: true,
        isLocalTarget: existingRoute.nodeId === localNodeId,
        targetAddress: targetNode?.address ?? null,
        targetPort: targetNode?.port ?? null,
        targetServerUrl: buildServerUrl(targetNode?.address ?? null, targetNode?.port ?? null),
      };
    }

    const assignedNodeId = await this.selectLeastLoadedNodeId();
    const targetNodeId = assignedNodeId || localNodeId;
    const routePersisted = await this.persistAssignedRoute(normalizedPlayerId, targetNodeId);
    const targetNode = await this.loadRunningNode(targetNodeId);
    return {
      playerId: normalizedPlayerId,
      targetNodeId,
      localNodeId,
      source: assignedNodeId ? 'assigned' : 'fallback_local',
      routeStatus: assignedNodeId ? 'assigned' : null,
      sessionEpoch: assignedNodeId ? 1 : null,
      routePersisted,
      isLocalTarget: targetNodeId === localNodeId,
      targetAddress: targetNode?.address ?? null,
      targetPort: targetNode?.port ?? null,
      targetServerUrl: buildServerUrl(targetNode?.address ?? null, targetNode?.port ?? null),
    };
  }

  private async persistAssignedRoute(playerId: string, nodeId: string): Promise<boolean> {
    if (!this.pool || !this.enabled) {
      return false;
    }
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedNodeId = typeof nodeId === 'string' ? nodeId.trim() : '';
    if (!normalizedPlayerId || !normalizedNodeId) {
      return false;
    }
    const result = await this.pool.query(
      `
        INSERT INTO ${PLAYER_SESSION_ROUTE_TABLE}(player_id, node_id, session_epoch, route_status, updated_at)
        VALUES ($1, $2, 1, 'assigned', now())
        ON CONFLICT (player_id)
        DO NOTHING
      `,
      [normalizedPlayerId, normalizedNodeId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  private async selectLeastLoadedNodeId(): Promise<string> {
    if (!this.pool || !this.enabled) {
      return '';
    }
    const result = await this.pool.query(
      `
        WITH active_nodes AS (
          SELECT
            node_id,
            GREATEST(capacity_weight, 1) AS capacity_weight
          FROM ${NODE_REGISTRY_TABLE}
          WHERE status = 'running'
        ),
        route_counts AS (
          SELECT node_id, COUNT(*)::bigint AS route_count
          FROM ${PLAYER_SESSION_ROUTE_TABLE}
          GROUP BY node_id
        )
        SELECT active_nodes.node_id
        FROM active_nodes
        LEFT JOIN route_counts ON route_counts.node_id = active_nodes.node_id
        ORDER BY
          COALESCE(route_counts.route_count, 0)::numeric / active_nodes.capacity_weight ASC,
          COALESCE(route_counts.route_count, 0) ASC,
          CASE WHEN active_nodes.node_id = $1 THEN 0 ELSE 1 END ASC,
          active_nodes.node_id ASC
        LIMIT 1
      `,
      [this.nodeRegistryService.getNodeId()],
    );
    const nodeId = result.rows[0]?.node_id;
    return typeof nodeId === 'string' ? nodeId.trim() : '';
  }

  private async loadRunningNode(nodeId: string): Promise<{ address: string; port: number } | null> {
    if (!this.pool || !this.enabled) {
      return null;
    }
    const normalizedNodeId = typeof nodeId === 'string' ? nodeId.trim() : '';
    if (!normalizedNodeId) {
      return null;
    }
    const result = await this.pool.query(
      `
        SELECT address, port
        FROM ${NODE_REGISTRY_TABLE}
        WHERE node_id = $1 AND status = 'running'
        LIMIT 1
      `,
      [normalizedNodeId],
    );
    const row = result.rows[0];
    if (!row) {
      return null;
    }
    return {
      address: typeof row.address === 'string' ? row.address.trim() : '',
      port: Number.isFinite(row.port) ? Math.max(1, Math.trunc(Number(row.port))) : 0,
    };
  }
}

async function ensurePlayerSessionRouteTable(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_PLAYER_SESSION_ROUTE_TABLE_SQL);
    await client.query(CREATE_PLAYER_SESSION_ROUTE_NODE_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function normalizePlayerId(playerId: unknown): string {
  return typeof playerId === 'string' ? playerId.trim() : '';
}

function normalizeSessionEpoch(sessionEpoch: unknown): number {
  const normalized = Number(sessionEpoch);
  if (!Number.isFinite(normalized)) {
    return 0;
  }
  return Math.max(0, Math.trunc(normalized));
}

function normalizeRouteStatus(routeStatus: unknown): string {
  const normalized = typeof routeStatus === 'string' ? routeStatus.trim() : '';
  return normalized || 'connected';
}

function buildServerUrl(address: string | null, port: number | null): string | null {
  const normalizedAddress = typeof address === 'string' ? address.trim() : '';
  const normalizedPort = Number.isFinite(port) ? Math.max(1, Math.trunc(Number(port))) : 0;
  if (!normalizedAddress || normalizedPort <= 0) {
    return null;
  }
  return `http://${normalizedAddress}:${normalizedPort}`;
}
