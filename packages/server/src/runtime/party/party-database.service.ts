import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
import { DatabasePoolProvider } from '../../persistence/database-pool.provider';
import type { PartyPool, QueryClient } from './party-runtime.types';
import { ensurePartyTables } from './party-schema';

@Injectable()
export class PartyDatabaseService implements OnModuleInit {
  private readonly logger = new Logger(PartyDatabaseService.name);
  private pool: PartyPool | null = null;

  constructor(
    @Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!resolveServerDatabaseUrl().trim()) {
      this.logger.warn('组队持久化已禁用：未提供数据库地址');
      return;
    }
    const pool = this.databasePoolProvider.getPool('party-runtime') as PartyPool | null;
    if (!pool) {
      this.logger.warn('组队持久化已禁用：数据库连接池不可用');
      return;
    }
    try {
      await ensurePartyTables(pool);
      this.pool = pool;
      this.logger.log('组队持久化已启用');
    } catch (error) {
      this.logger.error('组队表初始化失败', error instanceof Error ? error.stack : String(error));
    }
  }

  isEnabled(): boolean {
    return this.pool !== null;
  }

  getPool(): PartyPool | null {
    return this.pool;
  }

  async transaction<T>(work: (client: QueryClient) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error('party_persistence_disabled');
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await work(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release?.();
    }
  }
}

export interface PartyAuditEntry {
  partyId: string;
  operation: string;
  actorPlayerId: string;
  targetPlayerId?: string;
  source?: string;
  partyRevision?: number;
  details?: Record<string, unknown>;
  createdAt?: number;
}

export async function writePartyAudit(client: QueryClient, entry: PartyAuditEntry): Promise<void> {
  const createdAt = entry.createdAt ?? Date.now();
  await client.query(
    `INSERT INTO player_party_audit
      (audit_id, party_id, operation, actor_player_id, target_player_id, source, party_revision, details_json, created_at_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
    [
      randomUUID(),
      entry.partyId,
      entry.operation,
      entry.actorPlayerId,
      entry.targetPlayerId ?? null,
      entry.source ?? 'manual',
      entry.partyRevision ?? null,
      JSON.stringify(entry.details ?? {}),
      createdAt,
    ],
  );
}

export async function lockPartyPlayer(client: QueryClient, playerId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`party-player:${playerId}`]);
}

export async function lockPartyPlayers(client: QueryClient, playerIds: string[]): Promise<void> {
  const normalized = Array.from(new Set(playerIds.filter(Boolean))).sort();
  for (const playerId of normalized) await lockPartyPlayer(client, playerId);
}
