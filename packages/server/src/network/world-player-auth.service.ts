import { Inject, Injectable, Logger } from '@nestjs/common';

import { PlayerIdentityPersistenceService } from '../persistence/player-identity-persistence.service';
import { type ValidatedPlayerTokenPayload } from './world-player-token-codec.service';
import { recordAuthTrace, WorldPlayerTokenService } from './world-player-token.service';
import { WorldPlayerSourceService } from './world-player-source.service';

const LEGACY_DATABASE_ENV_KEYS = [
  'SERVER_NEXT_DATABASE_URL',
  'DATABASE_URL',
] as const;

type PersistedSource = 'native' | 'legacy_sync' | 'legacy_backfill' | 'token_seed';
type AuthSource = 'next' | 'token' | 'token_runtime';

interface AuthenticatePlayerTokenOptions {
  protocol?: unknown;
}

interface TokenIdentity {
  userId: string;
  username: string;
  displayName: string;
  playerId: string;
  playerName: string;
}

interface PlayerIdentityLike extends TokenIdentity {
  persistedSource?: unknown;
  authSource?: unknown;
  nextLoadHit?: unknown;
  updatedAt?: unknown;
  version?: unknown;
  [key: string]: unknown;
}

interface AuthenticatedPlayerIdentity extends PlayerIdentityLike {
  authSource: AuthSource;
  nextLoadHit: boolean;
  persistedSource?: PersistedSource | null;
}

interface PlayerIdentityPersistencePort {
  isEnabled(): boolean;
  loadPlayerIdentity(userId: string): Promise<PlayerIdentityLike | null>;
  savePlayerIdentity(identity: {
    userId: string;
    username: string;
    displayName: string;
    playerId: string;
    playerName: string;
    persistedSource: 'token_seed';
    updatedAt: number;
  }): Promise<PlayerIdentityLike | null>;
}

interface WorldPlayerSourcePort {
  loadNextPlayerIdentity?(userId: string): Promise<PlayerIdentityLike | null>;
}

function hasLegacyDatabaseConfigured(): boolean {
  for (const key of LEGACY_DATABASE_ENV_KEYS) {
    const value = typeof process.env[key] === 'string' ? process.env[key].trim() : '';
    if (value) {
      return true;
    }
  }

  return false;
}

function hasExplicitTokenPlayerIdentityClaims(
  payload: ValidatedPlayerTokenPayload | null | undefined,
): boolean {
  const playerId = typeof payload?.playerId === 'string' ? payload.playerId.trim() : '';
  const playerName = typeof payload?.playerName === 'string' ? payload.playerName.trim() : '';
  return Boolean(playerId && playerName);
}

function normalizeProtocol(protocol: unknown): string {
  return typeof protocol === 'string' ? protocol.trim().toLowerCase() : '';
}

function isExplicitMigrationProtocol(protocol: string): boolean {
  return protocol === 'migration';
}

function normalizePersistedSource(
  identity: Pick<PlayerIdentityLike, 'persistedSource'> | null | undefined,
): PersistedSource | null {
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

  constructor(
    /** 生成和校验 next 玩家令牌。 */
    private readonly worldPlayerTokenService: WorldPlayerTokenService,
    /** 玩家身份持久化入口。 */
    @Inject(PlayerIdentityPersistenceService)
    private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort,
    /** 玩家源服务，负责读取 next 真源。 */
    @Inject(WorldPlayerSourceService)
    private readonly worldPlayerSourceService: WorldPlayerSourcePort,
  ) {}

  /** 加载 next 玩家身份，优先走 next 持久化来源。 */
  async loadNextPlayerIdentity(userId: string): Promise<PlayerIdentityLike | null> {
    if (typeof this.worldPlayerSourceService?.loadNextPlayerIdentity === 'function') {
      return this.worldPlayerSourceService.loadNextPlayerIdentity(userId);
    }

    return this.playerIdentityPersistenceService.loadPlayerIdentity(userId);
  }

  async authenticatePlayerToken(
    token: string,
    options: AuthenticatePlayerTokenOptions | undefined = undefined,
  ): Promise<AuthenticatedPlayerIdentity | null> {
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
