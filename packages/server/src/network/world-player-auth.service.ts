import { Inject, Injectable, Logger } from '@nestjs/common';

import { PlayerIdentityPersistenceService } from '../persistence/player-identity-persistence.service';
import { type ValidatedPlayerTokenPayload } from './world-player-token-codec.service';
import { recordAuthTrace, WorldPlayerTokenService } from './world-player-token.service';

const LEGACY_DATABASE_ENV_KEYS = [
  'SERVER_NEXT_DATABASE_URL',
  'DATABASE_URL',
] as const;
/**
 * PersistedSource：统一结构类型，保证协议与运行时一致性。
 */


type PersistedSource = 'native' | 'legacy_sync' | 'legacy_backfill' | 'token_seed';
/**
 * AuthSource：统一结构类型，保证协议与运行时一致性。
 */

type AuthSource = 'next' | 'token' | 'token_runtime';
/**
 * AuthenticatePlayerTokenOptions：定义接口结构约束，明确可交付字段含义。
 */


export interface AuthenticatePlayerTokenOptions {
/**
 * protocol：protocol相关字段。
 */

  protocol?: string | null;
}
/**
 * TokenIdentity：定义接口结构约束，明确可交付字段含义。
 */


interface TokenIdentity {
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

  displayName: string;  
  /**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;
}
/**
 * PlayerIdentityLike：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerIdentityLike extends TokenIdentity {
/**
 * persistedSource：persisted来源相关字段。
 */

  persistedSource?: string | null;  
  /**
 * authSource：认证来源相关字段。
 */

  authSource?: string | null;  
  /**
 * nextLoadHit：nextLoadHit相关字段。
 */

  nextLoadHit?: boolean;  
  /**
 * updatedAt：updatedAt相关字段。
 */

  updatedAt?: number;  
  /**
 * version：version相关字段。
 */

  version?: number;
  [key: string]: unknown;
}
/**
 * AuthenticatedPlayerIdentity：定义接口结构约束，明确可交付字段含义。
 */


export interface AuthenticatedPlayerIdentity extends PlayerIdentityLike {
/**
 * authSource：认证来源相关字段。
 */

  authSource: AuthSource;  
  /**
 * nextLoadHit：nextLoadHit相关字段。
 */

  nextLoadHit: boolean;  
  /**
 * persistedSource：persisted来源相关字段。
 */

  persistedSource?: PersistedSource | null;
}
/**
 * PlayerIdentityPersistencePort：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerIdentityPersistencePort {
  isEnabled(): boolean;
  loadPlayerIdentity(userId: string): Promise<PlayerIdentityLike | null>;
  savePlayerIdentity(identity: {  
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

    displayName: string;    
    /**
 * playerId：玩家ID标识。
 */

    playerId: string;    
    /**
 * playerName：玩家名称名称或显示文本。
 */

    playerName: string;    
    /**
 * persistedSource：persisted来源相关字段。
 */

    persistedSource: 'token_seed';    
    /**
 * updatedAt：updatedAt相关字段。
 */

    updatedAt: number;
  }): Promise<PlayerIdentityLike | null>;
}
/**
 * hasLegacyDatabaseConfigured：判断LegacyDatabaseConfigured是否满足条件。
 * @returns 返回是否满足LegacyDatabaseConfigured条件。
 */


function hasLegacyDatabaseConfigured(): boolean {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  for (const key of LEGACY_DATABASE_ENV_KEYS) {
    const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
    if (value) {
      return true;
    }
  }

  return false;
}
/**
 * hasExplicitTokenPlayerIdentityClaims：判断ExplicitToken玩家IdentityClaim是否满足条件。
 * @param payload ValidatedPlayerTokenPayload | null | undefined 载荷参数。
 * @returns 返回是否满足ExplicitToken玩家IdentityClaim条件。
 */


function hasExplicitTokenPlayerIdentityClaims(
  payload: ValidatedPlayerTokenPayload | null | undefined,
): boolean {
  const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
  const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
  return Boolean(playerId && playerName);
}
/**
 * normalizeProtocol：规范化或转换Protocol。
 * @param protocol unknown 参数说明。
 * @returns 返回Protocol。
 */


function normalizeProtocol(protocol: unknown): string {
  return typeof protocol === 'string' ? protocol.trim().toLowerCase() : '';
}

function normalizeIdentityString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLoadedPlayerIdentity(
  identity: PlayerIdentityLike | null | undefined,
): PlayerIdentityLike | null {
  const userId = normalizeIdentityString(identity?.userId);
  const username = normalizeIdentityString(identity?.username);
  const displayName = normalizeIdentityString(identity?.displayName);
  const playerId = normalizeIdentityString(identity?.playerId);
  const playerName = normalizeIdentityString(identity?.playerName);
  if (!userId || !username || !displayName || !playerId || !playerName) {
    return null;
  }

  return {
    ...identity,
    userId,
    username,
    displayName,
    playerId,
    playerName,
  };
}
/**
 * isExplicitMigrationProtocol：判断ExplicitMigrationProtocol是否满足条件。
 * @param protocol string 参数说明。
 * @returns 返回是否满足ExplicitMigrationProtocol条件。
 */


function isExplicitMigrationProtocol(protocol: string): boolean {
  return protocol === 'migration';
}
/**
 * normalizePersistedSource：判断Persisted来源是否满足条件。
 * @param identity Pick<PlayerIdentityLike, 'persistedSource'> | null | undefined 参数说明。
 * @returns 返回Persisted来源。
 */


function normalizePersistedSource(
  identity: Pick<PlayerIdentityLike, 'persistedSource'> | null | undefined,
): PersistedSource | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const persistedSource = typeof identity?.persistedSource === 'string'
    ? identity.persistedSource.trim()
    : '';
  if (persistedSource === 'native') {
    return 'native';
  }
  if (persistedSource === 'legacy_sync') {
    return 'legacy_sync';
  }
  if (persistedSource === 'legacy_backfill') {
    return 'legacy_backfill';
  }
  if (persistedSource === 'token_seed') {
    return 'token_seed';
  }

  return null;
}
/**
 * resolvePersistedNextIdentityAuthSource：判断PersistedNextIdentity认证来源是否满足条件。
 * @param persistedSource PersistedSource 参数说明。
 * @returns 返回PersistedNextIdentity认证来源。
 */


function resolvePersistedNextIdentityAuthSource(
  persistedSource: PersistedSource,
): Extract<AuthSource, 'next' | 'token'> {
  return persistedSource === 'token_seed' ? 'token' : 'next';
}

/** 世界玩家鉴权服务：把 token 校验、next 身份加载与 token_seed 持久化收敛到一起。 */
@Injectable()
export class WorldPlayerAuthService {
  /** 鉴权日志，便于追踪 token、回填和持久化失败。 */
  private readonly logger = new Logger(WorldPlayerAuthService.name);  
  /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param worldPlayerTokenService WorldPlayerTokenService 参数说明。
 * @param playerIdentityPersistenceService PlayerIdentityPersistencePort 参数说明。
 * @returns 无返回值，完成实例初始化。
 */


  constructor(
    /** 生成和校验 next 玩家令牌。 */
    private readonly worldPlayerTokenService: WorldPlayerTokenService,
    /** 玩家身份持久化入口。 */
    @Inject(PlayerIdentityPersistenceService)
    private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort,
  ) {}

  /** 加载 next 玩家身份，优先走 next 持久化来源。 */
  async loadNextPlayerIdentity(userId: string): Promise<PlayerIdentityLike | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
  }  
  /**
 * authenticatePlayerToken：执行authenticate玩家Token相关逻辑。
 * @param token string 参数说明。
 * @param options AuthenticatePlayerTokenOptions | undefined 选项参数。
 * @returns 返回 Promise，完成后得到authenticate玩家Token。
 */


  async authenticatePlayerToken(
    token: string,
    options: AuthenticatePlayerTokenOptions | undefined = undefined,
  ): Promise<AuthenticatedPlayerIdentity | null> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const payload = this.worldPlayerTokenService.validatePlayerToken(token);
    if (!payload) {
      return null;
    }

    const protocol = normalizeProtocol(options?.protocol);
    const nextProtocolStrict = protocol === 'next';
    const explicitMigrationProtocol = isExplicitMigrationProtocol(protocol);
    const tokenIdentity = this.worldPlayerTokenService.resolvePlayerIdentityFromPayload(payload);
    const identityPersistenceEnabled = this.playerIdentityPersistenceService.isEnabled();

    let nextIdentity: PlayerIdentityLike | null = null;
    try {
      nextIdentity = await this.loadNextPlayerIdentity(payload.sub);
    } catch (error) {
      const message = `Player identity next record load failed: userId=${payload.sub} error=${error instanceof Error ? error.message : String(error)}`;
      this.logger.error(message);
      recordAuthTrace({
        type: 'identity',
        source: 'next_invalid',
        userId: payload.sub,
        playerId: tokenIdentity?.playerId ?? null,
        persistenceEnabled: identityPersistenceEnabled,
        nextLoadHit: false,
        compatTried: false,
        persistAttempted: false,
        persistSucceeded: null,
        persistFailureStage: 'next_identity_load_failed',
      });
      throw new Error(message);
    }

    if (nextIdentity) {
      const normalizedNextIdentity = normalizeLoadedPlayerIdentity(nextIdentity);
      if (!normalizedNextIdentity) {
        this.logger.error(`玩家身份 next 记录缺少必要字段：userId=${normalizeIdentityString(nextIdentity.userId) || payload.sub} playerId=${normalizeIdentityString(nextIdentity.playerId) || '未知'}`);
        recordAuthTrace({
          type: 'identity',
          source: 'next_invalid',
          userId: normalizeIdentityString(nextIdentity.userId) || payload.sub,
          playerId: normalizeIdentityString(nextIdentity.playerId) || null,
          persistedSource: normalizePersistedSource(nextIdentity),
          persistenceEnabled: identityPersistenceEnabled,
          nextLoadHit: true,
          compatTried: false,
          persistAttempted: false,
          persistSucceeded: null,
          persistFailureStage: 'next_identity_shape_invalid',
        });
        return null;
      }

      nextIdentity = normalizedNextIdentity;
      const nextPersistedSource = normalizePersistedSource(nextIdentity);
      if (!nextPersistedSource) {
        this.logger.error(`玩家身份 next 记录缺少 persistedSource：userId=${nextIdentity.userId} playerId=${nextIdentity.playerId}`);
        recordAuthTrace({
          type: 'identity',
          source: 'next_invalid',
          userId: nextIdentity.userId,
          playerId: nextIdentity.playerId,
          persistedSource: null,
          persistenceEnabled: identityPersistenceEnabled,
          nextLoadHit: true,
          compatTried: false,
          persistAttempted: false,
          persistSucceeded: null,
          persistFailureStage: 'next_identity_persisted_source_missing',
        });
        return null;
      }

      const nextProtocolBlockedPersistedSource = nextProtocolStrict
        && (nextPersistedSource === 'legacy_sync' || nextPersistedSource === 'legacy_backfill');
      if (nextProtocolBlockedPersistedSource) {
        this.logger.warn(`NEXT 协议拒绝 legacy persistedSource 身份：userId=${nextIdentity.userId} playerId=${nextIdentity.playerId} persistedSource=${nextPersistedSource}`);
        recordAuthTrace({
          type: 'identity',
          source: 'miss',
          userId: nextIdentity.userId,
          playerId: nextIdentity.playerId,
          persistedSource: nextPersistedSource,
          persistenceEnabled: identityPersistenceEnabled,
          nextLoadHit: true,
          compatTried: false,
          persistAttempted: false,
          persistSucceeded: null,
          persistFailureStage: 'next_protocol_legacy_persisted_identity_blocked',
        });
        return null;
      }

      if (
        nextPersistedSource !== 'native'
        && nextPersistedSource !== 'legacy_sync'
        && nextPersistedSource !== 'legacy_backfill'
        && nextPersistedSource !== 'token_seed'
      ) {
        this.logger.error(`玩家身份 next 记录存在不支持的 persistedSource：userId=${nextIdentity.userId} playerId=${nextIdentity.playerId} persistedSource=${nextPersistedSource}`);
        recordAuthTrace({
          type: 'identity',
          source: 'next_invalid',
          userId: nextIdentity.userId,
          playerId: nextIdentity.playerId,
          persistedSource: nextPersistedSource,
          persistenceEnabled: identityPersistenceEnabled,
          nextLoadHit: true,
          compatTried: false,
          persistAttempted: false,
          persistSucceeded: null,
          persistFailureStage: 'next_identity_persisted_source_invalid',
        });
        return null;
      }

      const nextIdentityAuthSource = resolvePersistedNextIdentityAuthSource(nextPersistedSource);
      recordAuthTrace({
        type: 'identity',
        source: nextIdentityAuthSource,
        userId: nextIdentity.userId,
        playerId: nextIdentity.playerId,
        persistedSource: nextPersistedSource,
        persistenceEnabled: identityPersistenceEnabled,
        nextLoadHit: true,
        compatTried: false,
        persistAttempted: false,
        persistSucceeded: null,
        persistFailureStage: null,
      });
      return {
        ...nextIdentity,
        persistedSource: nextPersistedSource,
        authSource: nextIdentityAuthSource,
        nextLoadHit: true,
      };
    }

    const legacyDatabaseConfigured = hasLegacyDatabaseConfigured();
    const allowTokenRuntimeIdentity = !identityPersistenceEnabled
      && !nextProtocolStrict
      && !explicitMigrationProtocol
      && tokenIdentity
      && hasExplicitTokenPlayerIdentityClaims(payload)
      && !legacyDatabaseConfigured;
    if (allowTokenRuntimeIdentity && tokenIdentity) {
      recordAuthTrace({
        type: 'identity',
        source: 'token_runtime',
        userId: tokenIdentity.userId,
        playerId: tokenIdentity.playerId,
        persistedSource: null,
        persistenceEnabled: false,
        nextLoadHit: false,
        compatTried: false,
        persistAttempted: false,
        persistSucceeded: null,
        persistFailureStage: null,
      });
      return {
        ...tokenIdentity,
        authSource: 'token_runtime',
        nextLoadHit: false,
      };
    }

    if (explicitMigrationProtocol) {
      recordAuthTrace({
        type: 'identity',
        source: 'miss',
        userId: payload.sub,
        playerId: tokenIdentity?.playerId ?? null,
        persistenceEnabled: identityPersistenceEnabled,
        nextLoadHit: false,
        compatTried: false,
        persistAttempted: false,
        persistSucceeded: null,
        persistFailureStage: null,
      });
      return null;
    }

    if (identityPersistenceEnabled && tokenIdentity) {
      let persistFailureStage: string | null = null;
      const persistedTokenIdentity: PlayerIdentityLike | null = await this.playerIdentityPersistenceService.savePlayerIdentity({
        ...tokenIdentity,
        persistedSource: 'token_seed',
        updatedAt: Date.now(),
      }).catch((error: unknown) => {
        persistFailureStage = 'token_seed_save_failed';
        this.logger.warn(`玩家身份 token seed 保存失败：userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} error=${error instanceof Error ? error.message : String(error)}`);
        return null;
      });

      if (identityPersistenceEnabled && persistFailureStage === 'token_seed_save_failed') {
        recordAuthTrace({
          type: 'identity',
          source: 'token_persist_blocked',
          userId: tokenIdentity.userId,
          playerId: tokenIdentity.playerId,
          persistedSource: null,
          persistenceEnabled: true,
          nextLoadHit: false,
          compatTried: false,
          persistAttempted: true,
          persistSucceeded: false,
          persistFailureStage,
        });
        return null;
      }

      const persistedTokenSource = normalizePersistedSource(persistedTokenIdentity);
      if (persistedTokenIdentity && persistedTokenSource !== 'token_seed') {
        this.logger.error(`玩家身份 token seed 保存返回了异常 persistedSource：userId=${tokenIdentity.userId} playerId=${tokenIdentity.playerId} expected=token_seed actual=${persistedTokenSource ?? '未知'}`);
        recordAuthTrace({
          type: 'identity',
          source: 'token_persist_blocked',
          userId: tokenIdentity.userId,
          playerId: tokenIdentity.playerId,
          persistedSource: persistedTokenSource,
          persistenceEnabled: true,
          nextLoadHit: false,
          compatTried: false,
          persistAttempted: true,
          persistSucceeded: false,
          persistFailureStage: 'token_seed_persisted_source_mismatch',
        });
        return null;
      }

      if (persistedTokenIdentity) {
        recordAuthTrace({
          type: 'identity',
          source: 'token',
          userId: tokenIdentity.userId,
          playerId: tokenIdentity.playerId,
          persistedSource: persistedTokenSource,
          persistenceEnabled: true,
          nextLoadHit: false,
          compatTried: false,
          persistAttempted: true,
          persistSucceeded: true,
          persistFailureStage,
        });
        return {
          ...tokenIdentity,
          persistedSource: persistedTokenSource,
          authSource: 'token',
          nextLoadHit: false,
        };
      }
    }

    if (nextProtocolStrict) {
      recordAuthTrace({
        type: 'identity',
        source: 'miss',
        userId: payload.sub,
        playerId: tokenIdentity?.playerId ?? null,
        persistenceEnabled: identityPersistenceEnabled,
        nextLoadHit: false,
        compatTried: false,
        persistAttempted: false,
        persistSucceeded: null,
        persistFailureStage: 'next_protocol_native_identity_required',
      });
      return null;
    }

    recordAuthTrace({
      type: 'identity',
      source: 'miss',
      userId: payload.sub,
      playerId: tokenIdentity?.playerId ?? null,
      persistenceEnabled: identityPersistenceEnabled,
      nextLoadHit: false,
      compatTried: false,
      persistAttempted: false,
      persistSucceeded: null,
      persistFailureStage: null,
    });
    return null;
  }
}
