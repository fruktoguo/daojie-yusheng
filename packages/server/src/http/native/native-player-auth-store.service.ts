import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { isDuplicateFriendlyDisplayName } from '@mud/shared';
import { Pool } from 'pg';

import { buildDefaultRoleName, normalizeDisplayName, normalizeRoleName, normalizeUsername, resolveDisplayName } from '../../auth/account-validation';
import { resolveServerDatabaseUrl } from '../../config/env-alias';
/**
 * AuthConflictKind：统一结构类型，保证协议与运行时一致性。
 */


type AuthConflictKind = 'account' | 'role' | 'display';
/**
 * PersistedAuthRow：定义接口结构约束，明确可交付字段含义。
 */


interface PersistedAuthRow {
/**
 * user_id：userID标识。
 */

  user_id?: unknown;  
  /**
 * username：username名称或显示文本。
 */

  username?: unknown;  
  /**
 * player_id：玩家ID标识。
 */

  player_id?: unknown;  
  /**
 * pending_role_name：pendingrole名称名称或显示文本。
 */

  pending_role_name?: unknown;  
  /**
 * display_name：显示名称名称或显示文本。
 */

  display_name?: unknown;  
  /**
 * password_hash：passwordhash相关字段。
 */

  password_hash?: unknown;  
  /**
 * total_online_seconds：totalonlinesecond相关字段。
 */

  total_online_seconds?: unknown;  
  /**
 * current_online_started_at：currentonlinestartedat相关字段。
 */

  current_online_started_at?: unknown;  
  /**
 * created_at：createdat相关字段。
 */

  created_at?: unknown;  
  /**
 * updated_at：updatedat相关字段。
 */

  updated_at?: unknown;
}
/**
 * AuthRecordCandidate：定义接口结构约束，明确可交付字段含义。
 */


interface AuthRecordCandidate {
/**
 * id：ID标识。
 */

  id?: unknown;  
  /**
 * userId：userID标识。
 */

  userId?: unknown;  
  /**
 * username：username名称或显示文本。
 */

  username?: unknown;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: unknown;  
  /**
 * pendingRoleName：pendingRole名称名称或显示文本。
 */

  pendingRoleName?: unknown;  
  /**
 * playerId：玩家ID标识。
 */

  playerId?: unknown;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName?: unknown;  
  /**
 * passwordHash：passwordHash相关字段。
 */

  passwordHash?: unknown;  
  /**
 * totalOnlineSeconds：totalOnlineSecond相关字段。
 */

  totalOnlineSeconds?: unknown;  
  /**
 * currentOnlineStartedAt：currentOnlineStartedAt相关字段。
 */

  currentOnlineStartedAt?: unknown;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt?: unknown;  
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt?: unknown;
}
/**
 * AuthExcludeEntryCandidate：定义接口结构约束，明确可交付字段含义。
 */


interface AuthExcludeEntryCandidate {
/**
 * userId：userID标识。
 */

  userId?: unknown;  
  /**
 * kind：kind相关字段。
 */

  kind?: unknown;
}
/**
 * AuthConflict：定义接口结构约束，明确可交付字段含义。
 */


interface AuthConflict {
/**
 * kind：kind相关字段。
 */

  kind: AuthConflictKind;  
  /**
 * userId：userID标识。
 */

  userId: string;
}
/**
 * EnsureAvailableOptions：定义接口结构约束，明确可交付字段含义。
 */


interface EnsureAvailableOptions {
/**
 * exclude：exclude相关字段。
 */

  exclude?: AuthExcludeEntryCandidate[];
}
/**
 * AuthExcludeEntry：定义接口结构约束，明确可交付字段含义。
 */


interface AuthExcludeEntry {
/**
 * userId：userID标识。
 */

  userId: string;  
  /**
 * kind：kind相关字段。
 */

  kind: AuthConflictKind;
}
/**
 * NativePlayerAuthUser：定义接口结构约束，明确可交付字段含义。
 */


export interface NativePlayerAuthUser {
/**
 * version：version相关字段。
 */

  version: 1;  
  /**
 * id：ID标识。
 */

  id: string;  
  /**
 * userId：userID标识。
 */

  userId: string;  
  /**
 * username：username名称或显示文本。
 */

  username: string;  
  /**
 * displayName：显示名称名称或显示文本。
 */

  displayName: string | null;  
  /**
 * pendingRoleName：pendingRole名称名称或显示文本。
 */

  pendingRoleName: string;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;  
  /**
 * passwordHash：passwordHash相关字段。
 */

  passwordHash: string;  
  /**
 * totalOnlineSeconds：totalOnlineSecond相关字段。
 */

  totalOnlineSeconds: number;  
  /**
 * currentOnlineStartedAt：currentOnlineStartedAt相关字段。
 */

  currentOnlineStartedAt: string | null;  
  /**
 * createdAt：createdAt相关字段。
 */

  createdAt: string;  
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt: number;
}

const PLAYER_AUTH_TABLE = 'server_player_auth';

const CREATE_PLAYER_AUTH_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS ${PLAYER_AUTH_TABLE} (
    user_id varchar(100) PRIMARY KEY,
    username varchar(80) NOT NULL UNIQUE,
    player_id varchar(100) NOT NULL UNIQUE,
    pending_role_name varchar(120) NOT NULL,
    display_name varchar(32),
    password_hash text NOT NULL,
    total_online_seconds bigint NOT NULL DEFAULT 0,
    current_online_started_at timestamptz,
    created_at timestamptz NOT NULL,
    updated_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL
  )
`;

const CREATE_PLAYER_AUTH_ROLE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_player_auth_role_idx
  ON ${PLAYER_AUTH_TABLE}(pending_role_name)
`;

const CREATE_PLAYER_AUTH_DISPLAY_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS server_player_auth_display_idx
  ON ${PLAYER_AUTH_TABLE}(display_name)
`;

/** 主线玩家鉴权存储：维护账号索引、唯一性检查和持久化读写。 */
@Injectable()
export class NativePlayerAuthStoreService implements OnModuleInit, OnModuleDestroy {
  /** 记录存储层状态，便于定位启动和回退分支。 */
  private readonly logger = new Logger(NativePlayerAuthStoreService.name);

  /** 可选的数据库连接池；未启用时完全走内存模式。 */
  private pool: Pool | null = null;

  /** 标记持久化是否已经成功初始化。 */
  private enabled = false;

  /** 按用户 ID 索引的账号快照。 */
  private readonly usersById = new Map<string, NativePlayerAuthUser>();

  /** 按用户名索引到 userId。 */
  private readonly userIdByUsername = new Map<string, string>();

  /** 按玩家 ID 索引到 userId。 */
  private readonly userIdByPlayerId = new Map<string, string>();

  /** 按角色名索引到 userId 集合。 */
  private readonly userIdsByRoleName = new Map<string, Set<string>>();

  /** 按显示名索引到 userId 集合。 */
  private readonly userIdsByDisplayName = new Map<string, Set<string>>();

  /** 启动时加载持久化账号到内存索引。 */
  async onModuleInit(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const databaseUrl = resolveServerDatabaseUrl();
    if (!databaseUrl.trim()) {
      this.logger.log('主线玩家鉴权存储运行在纯内存模式：未提供 SERVER_DATABASE_URL/DATABASE_URL');
      return;
    }

    this.pool = new Pool({
      connectionString: databaseUrl,
    });

    try {
      await ensurePlayerAuthTable(this.pool);
      this.enabled = true;
      await this.reloadFromPersistence();
      this.logger.log(`主线玩家鉴权存储已就绪：已加载 ${this.usersById.size} 个账号`);
    } catch (error) {
      this.logger.error('主线玩家鉴权存储持久化初始化失败，已回退为纯内存模式', error instanceof Error ? error.stack : String(error));
      await this.closePool();
    }
  }

  /** 关闭模块时释放数据库连接。 */
  async onModuleDestroy(): Promise<void> {
    await this.closePool();
  }

  /** 判断账号存储是否已经完成持久化初始化。 */
  isEnabled(): boolean {
    return this.enabled && this.pool !== null;
  }

  /** 从正式 auth 专表重建账号索引。 */
  async reloadFromPersistence(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.pool || !this.enabled) {
      return;
    }

    const result = await this.pool.query<PersistedAuthRow>(`
      SELECT
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      FROM ${PLAYER_AUTH_TABLE}
      ORDER BY user_id ASC
    `);

    this.resetIndexes();
    for (const row of result.rows) {
      const normalized = normalizePersistedAuthRow(row);
      if (!normalized) {
        continue;
      }
      this.indexUser(normalized);
    }
  }

  /** 返回当前内存里的账号快照副本。 */
  async listUsers(): Promise<NativePlayerAuthUser[]> {
    return Array.from(this.usersById.values()).map(cloneUser);
  }

  /** 保存账号并同步刷新所有内存索引。 */
  async saveUser(user: AuthRecordCandidate): Promise<NativePlayerAuthUser> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalized = normalizeAuthRecord(user);
    if (!normalized) {
      throw new BadRequestException('账号记录无效');
    }

    if (this.pool && this.enabled) {
      await this.pool.query(`
        INSERT INTO ${PLAYER_AUTH_TABLE}(
          user_id,
          username,
          player_id,
          pending_role_name,
          display_name,
          password_hash,
          total_online_seconds,
          current_online_started_at,
          created_at,
          updated_at,
          payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::timestamptz, now(), $10::jsonb)
        ON CONFLICT (user_id)
        DO UPDATE SET
          username = EXCLUDED.username,
          player_id = EXCLUDED.player_id,
          pending_role_name = EXCLUDED.pending_role_name,
          display_name = EXCLUDED.display_name,
          password_hash = EXCLUDED.password_hash,
          total_online_seconds = EXCLUDED.total_online_seconds,
          current_online_started_at = EXCLUDED.current_online_started_at,
          created_at = EXCLUDED.created_at,
          updated_at = now(),
          payload = EXCLUDED.payload
      `, [
        normalized.id,
        normalized.username,
        normalized.playerId,
        normalized.pendingRoleName,
        normalized.displayName,
        normalized.passwordHash,
        normalized.totalOnlineSeconds,
        normalized.currentOnlineStartedAt,
        normalized.createdAt,
        JSON.stringify(toPersistedUser(normalized)),
      ]);
    }

    this.replaceUser(normalized);
    return cloneUser(normalized);
  }

  /** 持久化启用时按 userId 回读正式真源，避免继续命中失效内存缓存。 */
  async refreshUserFromPersistenceById(userId: string): Promise<NativePlayerAuthUser | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.pool || !this.enabled) {
      return this.usersById.get(userId) ?? null;
    }

    const result = await this.pool.query<PersistedAuthRow>(`
      SELECT
        user_id,
        username,
        player_id,
        pending_role_name,
        display_name,
        password_hash,
        total_online_seconds,
        current_online_started_at,
        created_at,
        updated_at,
        payload
      FROM ${PLAYER_AUTH_TABLE}
      WHERE user_id = $1
      LIMIT 1
    `, [userId]);

    const normalized = normalizePersistedAuthRow(result.rows[0] ?? null);
    if (!normalized) {
      const previous = this.usersById.get(userId) ?? null;
      if (previous) {
        this.unindexUser(previous);
      }
      return null;
    }

    this.replaceUser(normalized);
    return normalized;
  }

  /** 按 userId 查询账号。 */
  async findUserById(userId: string): Promise<NativePlayerAuthUser | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedUserId = normalizeRequiredString(userId);
    if (!normalizedUserId) {
      return null;
    }

    const user = await this.refreshUserFromPersistenceById(normalizedUserId);
    return user ? cloneUser(user) : null;
  }

  /** 直接从内存索引读取账号，供内部调用复用。 */
  getMemoryUserById(userId: string): NativePlayerAuthUser | null {
    const normalizedUserId = normalizeRequiredString(userId);
    const user = normalizedUserId ? this.usersById.get(normalizedUserId) ?? null : null;
    return user ? cloneUser(user) : null;
  }

  /** 按玩家 ID 查询账号。 */
  async findUserByPlayerId(playerId: string): Promise<NativePlayerAuthUser | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedPlayerId = normalizeRequiredString(playerId);
    const userId = normalizedPlayerId ? this.userIdByPlayerId.get(normalizedPlayerId) ?? '' : '';
    if (!userId) {
      return null;
    }

    return this.findUserById(userId);
  }

  /** 按用户名查询账号。 */
  async findUserByUsername(username: string): Promise<NativePlayerAuthUser | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedUsername = normalizeUsername(username).trim();
    const userId = normalizedUsername ? this.userIdByUsername.get(normalizedUsername) ?? '' : '';
    if (!userId) {
      return null;
    }

    return this.findUserById(userId);
  }

  /** 按角色名查询所有账号。 */
  async findUsersByRoleName(roleName: string): Promise<NativePlayerAuthUser[]> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) {
      return [];
    }

    const userIds = Array.from(this.userIdsByRoleName.get(normalizedRoleName) ?? []);
    return userIds
      .map((userId) => this.usersById.get(userId) ?? null)
      .filter((entry): entry is NativePlayerAuthUser => entry !== null)
      .map(cloneUser);
  }

  /** 校验候选值是否可用，返回可读冲突说明。 */
  async ensureAvailable(value: string, requestedKind: AuthConflictKind, options: EnsureAvailableOptions = {}): Promise<string | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (requestedKind === 'display' && isDuplicateFriendlyDisplayName(value)) {
      return null;
    }

    const conflict = this.findConflict(value, requestedKind, options);
    if (!conflict) {
      return null;
    }
    return buildConflictMessage(requestedKind, conflict.kind);
  }

  /** 在账号/角色/显示名三个维度上查找冲突账号。 */
  findConflict(value: string, requestedKind: AuthConflictKind, options: EnsureAvailableOptions = {}): AuthConflict | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!value) {
      return null;
    }

    const exclude = normalizeExcludeEntries(options.exclude);
    if (requestedKind === 'account') {
      const userId = this.userIdByUsername.get(normalizeUsername(value).trim()) ?? '';
      if (userId && !isExcluded(exclude, userId, 'account')) {
        return { kind: 'account', userId };
      }
      return null;
    }

    if (requestedKind === 'role') {
      const userIds = this.userIdsByRoleName.get(normalizeRoleName(value)) ?? null;
      if (!userIds) {
        return null;
      }

      for (const userId of userIds) {
        if (!isExcluded(exclude, userId, 'role')) {
          return { kind: 'role', userId };
        }
      }
      return null;
    }

    if (isDuplicateFriendlyDisplayName(value)) {
      return null;
    }

    const userIds = this.userIdsByDisplayName.get(normalizeDisplayName(value)) ?? null;
    if (!userIds) {
      return null;
    }

    for (const userId of userIds) {
      if (!isExcluded(exclude, userId, 'display')) {
        return { kind: 'display', userId };
      }
    }
    return null;
  }

  /** 清空全部内存索引，配合重新加载使用。 */
  resetIndexes(): void {
    this.usersById.clear();
    this.userIdByUsername.clear();
    this.userIdByPlayerId.clear();
    this.userIdsByRoleName.clear();
    this.userIdsByDisplayName.clear();
  }

  /** 以 user.id 作为主键替换账号记录。 */
  replaceUser(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const previous = this.usersById.get(user.id) ?? null;
    if (previous) {
      this.unindexUser(previous);
    }
    this.indexUser(user);
  }

  /** 将账号写入所有辅助索引。 */
  indexUser(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.usersById.set(user.id, user);
    this.userIdByUsername.set(user.username, user.id);
    this.userIdByPlayerId.set(user.playerId, user.id);
    if (user.pendingRoleName) {
      addToSetMap(this.userIdsByRoleName, user.pendingRoleName, user.id);
    }

    const resolvedDisplayName = resolveDisplayName(user.displayName, user.username);
    if (!isDuplicateFriendlyDisplayName(resolvedDisplayName)) {
      addToSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
    }
  }

  /** 从所有辅助索引中移除账号。 */
  unindexUser(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    this.usersById.delete(user.id);
    if (this.userIdByUsername.get(user.username) === user.id) {
      this.userIdByUsername.delete(user.username);
    }
    if (this.userIdByPlayerId.get(user.playerId) === user.id) {
      this.userIdByPlayerId.delete(user.playerId);
    }
    if (user.pendingRoleName) {
      removeFromSetMap(this.userIdsByRoleName, user.pendingRoleName, user.id);
    }

    const resolvedDisplayName = resolveDisplayName(user.displayName, user.username);
    if (!isDuplicateFriendlyDisplayName(resolvedDisplayName)) {
      removeFromSetMap(this.userIdsByDisplayName, resolvedDisplayName, user.id);
    }
  }

  /** 安全关闭数据库连接池，失败时忽略。 */
  async closePool(): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const pool = this.pool;
    this.pool = null;
    this.enabled = false;
    if (pool) {
      await pool.end().catch(() => undefined);
    }
  }
}
/**
 * normalizePersistedAuthRow：判断Persisted认证Row是否满足条件。
 * @param row PersistedAuthRow | null 参数说明。
 * @returns 返回Persisted认证Row。
 */


function normalizePersistedAuthRow(row: PersistedAuthRow | null): NativePlayerAuthUser | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!row || typeof row !== 'object') {
    return null;
  }

  const userId = normalizeRequiredString(row.user_id);
  const username = normalizeUsername(row.username).trim();
  const playerId = normalizeRequiredString(row.player_id);
  const pendingRoleName = normalizeRoleName(row.pending_role_name);
  const passwordHash = typeof row.password_hash === 'string' ? row.password_hash : '';
  if (!userId || !username || !playerId || !pendingRoleName || !passwordHash) {
    return null;
  }

  const createdAt = row.created_at instanceof Date
    ? row.created_at.toISOString()
    : normalizeDateTime(row.created_at) ?? new Date(0).toISOString();
  const currentOnlineStartedAt = row.current_online_started_at instanceof Date
    ? row.current_online_started_at.toISOString()
    : normalizeDateTime(row.current_online_started_at);
  const updatedAt = row.updated_at instanceof Date
    ? row.updated_at.getTime()
    : Number.isFinite(Date.parse(String(row.updated_at ?? ''))) ? Date.parse(String(row.updated_at ?? '')) : Date.now();

  return {
    version: 1,
    id: userId,
    userId,
    username,
    displayName: normalizeOptionalDisplayName(row.display_name),
    pendingRoleName,
    playerId,
    playerName: pendingRoleName,
    passwordHash,
    totalOnlineSeconds: normalizeNonNegativeIntegerLike(row.total_online_seconds, 0),
    currentOnlineStartedAt,
    createdAt,
    updatedAt,
  };
}
/**
 * normalizeAuthRecord：规范化或转换认证Record。
 * @param raw AuthRecordCandidate | null | undefined 参数说明。
 * @param fallbackKey 参数说明。
 * @returns 返回认证Record。
 */


function normalizeAuthRecord(raw: AuthRecordCandidate | null | undefined, fallbackKey = ''): NativePlayerAuthUser | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!raw || typeof raw !== 'object') {
    return null;
  }

  const userId = normalizeRequiredString(raw.userId ?? raw.id ?? fallbackKey);
  const username = normalizeUsername(raw.username).trim();
  const playerId = normalizeRequiredString(raw.playerId) || buildFallbackPlayerId(userId);
  const pendingRoleName = normalizeRoleName(raw.playerName ?? raw.pendingRoleName) || buildDefaultRoleName(username);
  const passwordHash = typeof raw.passwordHash === 'string' ? raw.passwordHash : '';
  if (!userId || !username || !playerId || !pendingRoleName || !passwordHash) {
    return null;
  }

  const createdAt = normalizeDateTime(raw.createdAt) ?? new Date(0).toISOString();
  return {
    version: 1,
    id: userId,
    userId,
    username,
    displayName: normalizeOptionalDisplayName(raw.displayName),
    pendingRoleName,
    playerId,
    playerName: pendingRoleName,
    passwordHash,
    totalOnlineSeconds: normalizeNonNegativeIntegerLike(raw.totalOnlineSeconds, 0),
    currentOnlineStartedAt: normalizeDateTime(raw.currentOnlineStartedAt),
    createdAt,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)
      ? Math.max(0, Math.trunc(raw.updatedAt))
      : Date.now(),
  };
}
/**
 * toPersistedUser：判断toPersistedUser是否满足条件。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 返回toPersistedUser。
 */


function toPersistedUser(user: NativePlayerAuthUser): Omit<NativePlayerAuthUser, 'userId'> & {
/**
 * userId：userID标识。
 */
 userId: string } {
  return {
    version: 1,
    userId: user.id,
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    playerId: user.playerId,
    playerName: user.pendingRoleName,
    pendingRoleName: user.pendingRoleName,
    passwordHash: user.passwordHash,
    totalOnlineSeconds: user.totalOnlineSeconds,
    currentOnlineStartedAt: user.currentOnlineStartedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}
/**
 * cloneUser：构建User。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 返回User。
 */


function cloneUser(user: NativePlayerAuthUser): NativePlayerAuthUser {
  return {
    ...user,
  };
}
/**
 * normalizeRequiredString：规范化或转换RequiredString。
 * @param value unknown 参数说明。
 * @returns 返回RequiredString。
 */


function normalizeRequiredString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
/**
 * normalizeOptionalDisplayName：判断Optional显示名称是否满足条件。
 * @param value unknown 参数说明。
 * @returns 返回Optional显示名称。
 */


function normalizeOptionalDisplayName(value: unknown): string | null {
  const normalized = normalizeDisplayName(value);
  return normalized.trim().length > 0 ? normalized : null;
}
/**
 * normalizeDateTime：规范化或转换Date时间。
 * @param value unknown 参数说明。
 * @returns 返回Date时间。
 */


function normalizeDateTime(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function normalizeNonNegativeIntegerLike(value: unknown, fallback: number): number {
  const numeric = typeof value === 'bigint'
    ? Number(value)
    : typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim()
        ? Number(value)
        : Number.NaN;
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : fallback;
}
/**
 * buildFallbackPlayerId：构建并返回目标对象。
 * @param userId string user ID。
 * @returns 返回Fallback玩家ID。
 */


function buildFallbackPlayerId(userId: string): string {
  const normalizedUserId = normalizeRequiredString(userId);
  return normalizedUserId ? `p_${normalizedUserId}` : '';
}
/**
 * addToSetMap：处理ToSet地图并更新相关状态。
 * @param target Map<string, Set<string>> 目标对象。
 * @param key string 参数说明。
 * @param userId string user ID。
 * @returns 无返回值，直接更新ToSet地图相关状态。
 */


function addToSetMap(target: Map<string, Set<string>>, key: string, userId: string): void {
  const current = target.get(key) ?? new Set<string>();
  current.add(userId);
  target.set(key, current);
}
/**
 * removeFromSetMap：处理FromSet地图并更新相关状态。
 * @param target Map<string, Set<string>> 目标对象。
 * @param key string 参数说明。
 * @param userId string user ID。
 * @returns 无返回值，直接更新FromSet地图相关状态。
 */


function removeFromSetMap(target: Map<string, Set<string>>, key: string, userId: string): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const current = target.get(key) ?? null;
  if (!current) {
    return;
  }

  current.delete(userId);
  if (current.size === 0) {
    target.delete(key);
    return;
  }
  target.set(key, current);
}
/**
 * normalizeExcludeEntries：规范化或转换Exclude条目。
 * @param entries AuthExcludeEntryCandidate[] | undefined 参数说明。
 * @returns 返回Exclude条目列表。
 */


function normalizeExcludeEntries(entries: AuthExcludeEntryCandidate[] | undefined): AuthExcludeEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries
    .map((entry) => ({
      userId: normalizeRequiredString(entry?.userId),
      kind: entry?.kind === 'account' || entry?.kind === 'role' || entry?.kind === 'display' ? entry.kind : null,
    }))
    .filter((entry): entry is AuthExcludeEntry => Boolean(entry.userId && entry.kind));
}
/**
 * isExcluded：判断Excluded是否满足条件。
 * @param entries AuthExcludeEntry[] 参数说明。
 * @param userId string user ID。
 * @param kind AuthConflictKind 参数说明。
 * @returns 返回是否满足Excluded条件。
 */


function isExcluded(entries: AuthExcludeEntry[], userId: string, kind: AuthConflictKind): boolean {
  return entries.some((entry) => entry.userId === userId && entry.kind === kind);
}
/**
 * buildConflictMessage：构建并返回目标对象。
 * @param requestedKind AuthConflictKind 参数说明。
 * @param conflictKind AuthConflictKind 参数说明。
 * @returns 返回ConflictMessage。
 */


function buildConflictMessage(requestedKind: AuthConflictKind, conflictKind: AuthConflictKind): string {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (requestedKind === 'account' || conflictKind === 'account') {
    return '账号已存在';
  }
  if (requestedKind === 'role' || conflictKind === 'role') {
    return '角色名称已存在';
  }
  return '称号已存在';
}
/**
 * ensurePlayerAuthTable：执行ensure玩家认证表相关逻辑。
 * @param pool Pool 参数说明。
 * @returns 返回 Promise，完成后得到ensure玩家认证表。
 */


async function ensurePlayerAuthTable(pool: Pool): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(CREATE_PLAYER_AUTH_TABLE_SQL);
    await client.query(`
      ALTER TABLE ${PLAYER_AUTH_TABLE}
      ALTER COLUMN total_online_seconds TYPE bigint USING total_online_seconds::bigint
    `);
    await client.query(CREATE_PLAYER_AUTH_ROLE_INDEX_SQL);
    await client.query(CREATE_PLAYER_AUTH_DISPLAY_INDEX_SQL);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
