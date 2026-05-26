/**
 * 活动中心持久化服务。
 *
 * 月卡有效期、月卡每日领取和每日签到都要求跨会话存在，数据库是唯一真源。
 */
import { Injectable, Logger, Inject } from '@nestjs/common';
import type { Pool } from 'pg';
import {
  DAILY_SIGN_IN_REWARD_MERIT,
  MERIT_ITEM_ID,
  MERIT_MONTH_CARD_DAILY_REWARD,
  MERIT_MONTH_CARD_DURATION_DAYS,
} from '@mud/shared';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { DatabasePoolProvider } from './database-pool.provider';

const MONTH_CARD_TABLE = 'player_merit_month_card';
const MONTH_CARD_CLAIM_TABLE = 'player_merit_month_card_claim';
const DAILY_SIGN_IN_TABLE = 'player_daily_sign_in';
const DAILY_SIGN_IN_CLAIM_TABLE = 'player_daily_sign_in_claim';
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ActivityMonthCardRecord {
  playerId: string;
  startAt: number;
  expireAt: number;
  lastClaimDate: string | null;
}

export interface ActivityDailySignInRecord {
  playerId: string;
  lastClaimDate: string | null;
  streakDays: number;
  totalDays: number;
}

@Injectable()
export class ActivityPersistenceService {
  private readonly logger = new Logger(ActivityPersistenceService.name);
  pool: Pool | null = null;
  enabled = false;

  constructor(@Inject(DatabasePoolProvider) private readonly databasePoolProvider: DatabasePoolProvider) {}

  async onModuleInit(): Promise<void> {
    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('活动持久化已禁用：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }
    const sharedPool = this.databasePoolProvider?.getPool?.('activity');
    if (!sharedPool) {
      this.logger.warn('活动持久化已禁用：数据库连接池不可用');
      return;
    }
    this.pool = sharedPool;
    try {
      await ensureActivityTables(sharedPool);
      this.enabled = true;
      this.logger.log('活动持久化已启用');
    } catch (error) {
      this.logger.error('活动持久化初始化失败，已回退为禁用模式', error instanceof Error ? error.stack : String(error));
      this.pool = null;
      this.enabled = false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.pool = null;
    this.enabled = false;
  }

  isEnabled(): boolean {
    return Boolean(this.pool && this.enabled);
  }

  async loadMonthCard(playerId: string): Promise<ActivityMonthCardRecord | null> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT player_id, start_at_ms, expire_at_ms, last_claim_date
         FROM ${MONTH_CARD_TABLE}
        WHERE player_id = $1`,
      [normalizedPlayerId],
    );
    return normalizeMonthCardRow(result.rows[0], normalizedPlayerId);
  }

  async loadDailySignIn(playerId: string): Promise<ActivityDailySignInRecord | null> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      return null;
    }
    const result = await this.pool.query(
      `SELECT player_id, last_claim_date, streak_days, total_days
         FROM ${DAILY_SIGN_IN_TABLE}
        WHERE player_id = $1`,
      [normalizedPlayerId],
    );
    return normalizeDailySignInRow(result.rows[0], normalizedPlayerId);
  }

  async extendMonthCard(playerId: string, nowMs = Date.now(), durationDays = MERIT_MONTH_CARD_DURATION_DAYS): Promise<ActivityMonthCardRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    if (!this.pool || !this.enabled || !normalizedPlayerId) {
      throw new Error('activity_persistence_unavailable');
    }
    const durationMs = Math.max(1, Math.trunc(durationDays)) * DAY_MS;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      const baseAt = existing && existing.expireAt > nowMs ? existing.expireAt : nowMs;
      const startAt = existing && existing.expireAt > nowMs ? existing.startAt : nowMs;
      const expireAt = baseAt + durationMs;
      await client.query(
        `INSERT INTO ${MONTH_CARD_TABLE}(player_id, start_at_ms, expire_at_ms, last_claim_date, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           start_at_ms = EXCLUDED.start_at_ms,
           expire_at_ms = EXCLUDED.expire_at_ms,
           updated_at = now()`,
        [normalizedPlayerId, startAt, expireAt, existing?.lastClaimDate ?? null],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        startAt,
        expireAt,
        lastClaimDate: existing?.lastClaimDate ?? null,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async claimMonthCard(playerId: string, claimDate: string, nowMs = Date.now(), rewardMerit = MERIT_MONTH_CARD_DAILY_REWARD): Promise<ActivityMonthCardRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedClaimDate = normalizeDateKey(claimDate);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !normalizedClaimDate) {
      throw new Error('activity_persistence_unavailable');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, start_at_ms, expire_at_ms, last_claim_date
           FROM ${MONTH_CARD_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const monthCard = normalizeMonthCardRow(current.rows[0], normalizedPlayerId);
      if (!monthCard || monthCard.expireAt <= nowMs) {
        throw new Error('month_card_inactive');
      }
      if (monthCard.lastClaimDate === normalizedClaimDate) {
        throw new Error('month_card_already_claimed');
      }
      await client.query(
        `INSERT INTO ${MONTH_CARD_CLAIM_TABLE}(player_id, claim_date, reward_merit, created_at)
         VALUES ($1, $2, $3, now())`,
        [normalizedPlayerId, normalizedClaimDate, Math.max(0, Math.trunc(Number(rewardMerit) || 0))],
      );
      await client.query(
        `UPDATE ${MONTH_CARD_TABLE}
            SET last_claim_date = $2,
                updated_at = now()
          WHERE player_id = $1`,
        [normalizedPlayerId, normalizedClaimDate],
      );
      await client.query('COMMIT');
      return {
        ...monthCard,
        lastClaimDate: normalizedClaimDate,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new Error('month_card_already_claimed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async claimDailySignIn(playerId: string, claimDate: string, rewardPayload: unknown): Promise<ActivityDailySignInRecord> {
    const normalizedPlayerId = normalizePlayerId(playerId);
    const normalizedClaimDate = normalizeDateKey(claimDate);
    if (!this.pool || !this.enabled || !normalizedPlayerId || !normalizedClaimDate) {
      throw new Error('activity_persistence_unavailable');
    }
    const previousDate = shiftDateKey(normalizedClaimDate, -1);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query(
        `SELECT player_id, last_claim_date, streak_days, total_days
           FROM ${DAILY_SIGN_IN_TABLE}
          WHERE player_id = $1
          FOR UPDATE`,
        [normalizedPlayerId],
      );
      const existing = normalizeDailySignInRow(current.rows[0], normalizedPlayerId);
      if (existing?.lastClaimDate === normalizedClaimDate) {
        throw new Error('daily_sign_in_already_claimed');
      }
      const streakDays = existing?.lastClaimDate === previousDate ? existing.streakDays + 1 : 1;
      const totalDays = (existing?.totalDays ?? 0) + 1;
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_CLAIM_TABLE}(player_id, claim_date, reward_payload, created_at)
         VALUES ($1, $2, $3::jsonb, now())`,
        [normalizedPlayerId, normalizedClaimDate, JSON.stringify(rewardPayload ?? { itemId: MERIT_ITEM_ID, count: DAILY_SIGN_IN_REWARD_MERIT })],
      );
      await client.query(
        `INSERT INTO ${DAILY_SIGN_IN_TABLE}(player_id, last_claim_date, streak_days, total_days, created_at, updated_at)
         VALUES ($1, $2, $3, $4, now(), now())
         ON CONFLICT (player_id)
         DO UPDATE SET
           last_claim_date = EXCLUDED.last_claim_date,
           streak_days = EXCLUDED.streak_days,
           total_days = EXCLUDED.total_days,
           updated_at = now()`,
        [normalizedPlayerId, normalizedClaimDate, streakDays, totalDays],
      );
      await client.query('COMMIT');
      return {
        playerId: normalizedPlayerId,
        lastClaimDate: normalizedClaimDate,
        streakDays,
        totalDays,
      };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      if (isUniqueViolation(error)) {
        throw new Error('daily_sign_in_already_claimed');
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async listActiveMonthCardPlayerIds(nowMs = Date.now()): Promise<string[]> {
    if (!this.pool || !this.enabled) {
      return [];
    }
    const result = await this.pool.query(
      `SELECT player_id
         FROM ${MONTH_CARD_TABLE}
        WHERE expire_at_ms > $1`,
      [Math.trunc(nowMs)],
    );
    return result.rows
      .map((row) => normalizePlayerId(row?.player_id))
      .filter((playerId) => playerId.length > 0);
  }
}

async function ensureActivityTables(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MONTH_CARD_TABLE} (
        player_id varchar(128) PRIMARY KEY,
        start_at_ms bigint NOT NULL,
        expire_at_ms bigint NOT NULL,
        last_claim_date varchar(10),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${MONTH_CARD_CLAIM_TABLE} (
        player_id varchar(128) NOT NULL,
        claim_date varchar(10) NOT NULL,
        reward_merit integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, claim_date)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAILY_SIGN_IN_TABLE} (
        player_id varchar(128) PRIMARY KEY,
        last_claim_date varchar(10),
        streak_days integer NOT NULL DEFAULT 0,
        total_days integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${DAILY_SIGN_IN_CLAIM_TABLE} (
        player_id varchar(128) NOT NULL,
        claim_date varchar(10) NOT NULL,
        reward_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (player_id, claim_date)
      )
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_${MONTH_CARD_TABLE}_expire_at ON ${MONTH_CARD_TABLE}(expire_at_ms)`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

function normalizeMonthCardRow(row: any, fallbackPlayerId: string): ActivityMonthCardRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const playerId = normalizePlayerId(row.player_id) || fallbackPlayerId;
  const startAt = Math.max(0, Math.trunc(Number(row.start_at_ms) || 0));
  const expireAt = Math.max(0, Math.trunc(Number(row.expire_at_ms) || 0));
  if (!playerId || expireAt <= 0) {
    return null;
  }
  return {
    playerId,
    startAt,
    expireAt,
    lastClaimDate: normalizeDateKey(row.last_claim_date) || null,
  };
}

function normalizeDailySignInRow(row: any, fallbackPlayerId: string): ActivityDailySignInRecord | null {
  if (!row || typeof row !== 'object') {
    return null;
  }
  const playerId = normalizePlayerId(row.player_id) || fallbackPlayerId;
  if (!playerId) {
    return null;
  }
  return {
    playerId,
    lastClaimDate: normalizeDateKey(row.last_claim_date) || null,
    streakDays: Math.max(0, Math.trunc(Number(row.streak_days) || 0)),
    totalDays: Math.max(0, Math.trunc(Number(row.total_days) || 0)),
  };
}

function normalizePlayerId(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeDateKey(value: unknown): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return date.toISOString().slice(0, 10);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: unknown }).code === '23505');
}
