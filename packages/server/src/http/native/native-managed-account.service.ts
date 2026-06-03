/**
 * 本文件属于服务端 HTTP 或 GM 辅助入口，负责把运维能力接入内部服务。
 *
 * 维护时要注意鉴权、审计和后台任务边界，避免把管理操作暴露成无保护公开接口。
 */
/**
 * GM 托管账号服务。
 * 为 GM 面板提供按 playerId 查询账号、修改密码、修改用户名、封禁/解封等管理操作，
 * 变更后同步持久化身份和运行时显示名。
 */
import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { normalizeUsername, resolveDisplayName, validatePassword, validateUsername } from '../../auth/account-validation';
import { hashPassword } from '../../auth/password-hash';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { MarketRuntimeService } from '../../runtime/market/market-runtime.service';
import { LeaderboardRuntimeService } from '../../runtime/player/leaderboard-runtime.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { GM_AUTH_CONTRACT } from './native-gm-contract';
import { NativePlayerAuthStoreService } from './native-player-auth-store.service';
import type { NativePlayerAuthUser } from './native-player-auth-store.service';

/** GM 面板展示的托管账号记录。 */


interface ManagedAccountRecord {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
  /** 玩家可见数字编号。 */
  playerNo: number | null;
  /**
 * playerName：玩家名称名称或显示文本。
 */

  playerName: string;  
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
 * createdAt：createdAt相关字段。
 */

  createdAt: string;  
  /**
 * totalOnlineSeconds：totalOnlineSecond相关字段。
 */

  totalOnlineSeconds: number;  
  /**
 * currentOnlineStartedAt：currentOnlineStartedAt相关字段。
 */

  currentOnlineStartedAt: string | null;
  registerIp: string | null;
  lastLoginIp: string | null;
  lastLoginAt: string | null;
  registerDeviceId: string | null;
  lastLoginDeviceId: string | null;
  lastUserAgent: string | null;
  bannedAt: string | null;
  banReason: string | null;
  bannedBy: string | null;
}
/**
 * ManagedAccountUpdateResult：定义接口结构约束，明确可交付字段含义。
 */


interface ManagedAccountUpdateResult {
/**
 * username：username名称或显示文本。
 */

  username: string;  
  /**
 * displayNameChanged：显示名称Changed相关字段。
 */

  displayNameChanged: boolean;  
  /**
 * nextDisplayName：next显示名称名称或显示文本。
 */

  nextDisplayName: string;
}
/**
 * PlayerIdentityPersistencePort：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerIdentityPersistencePort {
  isEnabled(): boolean;
  savePlayerIdentity(identity: Record<string, unknown>): Promise<unknown>;
}
interface PlayerRuntimeIdentityProjection {
  displayName?: string;
}
/**
 * PlayerRuntimePort：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimePort {
  getPlayerIdentityProjection(playerId: string): PlayerRuntimeIdentityProjection | null;
  setIdentity(playerId: string, input: {  
  /**
 * displayName：显示名称名称或显示文本。
 */
 displayName?: string }): unknown;
}

interface MarketRuntimePort {
  cancelOpenOrdersForBannedPlayer(playerId: string): Promise<unknown>;
}

interface LeaderboardRuntimePort {
  invalidateCaches(): void;
}

/** Next 托管账号服务：为 GM/管理入口提供账号查询、重命名和密码更新。 */
@Injectable()
export class NativeManagedAccountService {
  /** 记录便于追踪管理操作的服务日志。 */
  private readonly logger = new Logger(NativeManagedAccountService.name);  
  /**
 * playerIdentityPersistenceService：玩家IdentityPersistence服务引用。
 */


  private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort;  
  /**
 * playerRuntimeService：玩家运行态服务引用。
 */


  private readonly playerRuntimeService: PlayerRuntimePort;
  private readonly marketRuntimeService: MarketRuntimePort | null;
  private readonly leaderboardRuntimeService: LeaderboardRuntimePort | null;

  /** 账号索引与冲突检查入口。 */
  constructor(
    private readonly authStore: NativePlayerAuthStoreService,
    @Inject(PlayerIdentityPersistenceService)
    playerIdentityPersistenceService: unknown,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
    @Optional() @Inject(MarketRuntimeService)
    marketRuntimeService: unknown = null,
    @Optional() @Inject(LeaderboardRuntimeService)
    leaderboardRuntimeService: unknown = null,
  ) {
    this.playerIdentityPersistenceService = playerIdentityPersistenceService as PlayerIdentityPersistencePort;
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimePort;
    this.marketRuntimeService = marketRuntimeService && typeof (marketRuntimeService as MarketRuntimePort).cancelOpenOrdersForBannedPlayer === 'function'
      ? marketRuntimeService as MarketRuntimePort
      : null;
    this.leaderboardRuntimeService = leaderboardRuntimeService && typeof (leaderboardRuntimeService as LeaderboardRuntimePort).invalidateCaches === 'function'
      ? leaderboardRuntimeService as LeaderboardRuntimePort
      : null;
  }

  /** 将多个 playerId 归一为托管账号索引结果，供 GM 面板使用。 */
  async getManagedAccountIndex(playerIds: Iterable<string> | null | undefined): Promise<Map<string, ManagedAccountRecord>> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedPlayerIds = Array.from(new Set(Array.from(playerIds ?? [])
      .filter((playerId): playerId is string => typeof playerId === 'string')
      .map((playerId) => playerId.trim())
      .filter((playerId) => playerId.length > 0)));

    const result = new Map<string, ManagedAccountRecord>();
    for (const playerId of normalizedPlayerIds) {
      const user = await this.authStore.findUserByPlayerId(playerId);
      if (!user) {
        continue;
      }

      result.set(playerId, {
        playerId,
        playerNo: user.playerNo,
        playerName: user.pendingRoleName ?? user.username,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        createdAt: user.createdAt,
        totalOnlineSeconds: user.totalOnlineSeconds,
        currentOnlineStartedAt: user.currentOnlineStartedAt,
        registerIp: user.registerIp,
        lastLoginIp: user.lastLoginIp,
        lastLoginAt: user.lastLoginAt,
        registerDeviceId: user.registerDeviceId,
        lastLoginDeviceId: user.lastLoginDeviceId,
        lastUserAgent: user.lastUserAgent,
        bannedAt: user.bannedAt,
        banReason: user.banReason,
        bannedBy: user.bannedBy,
      });
    }
    return result;
  }

  /** 更新托管账号密码，修改前仍沿用统一密码规则。 */
  async updateManagedPlayerPassword(playerId: string, newPassword: string, actor = 'gm'): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    const user = await this.requireManagedUser(playerId);
    const startedAt = Date.now();

    let nextPasswordHash: string;
    try {
      nextPasswordHash = await hashPassword(newPassword);
    } catch (error) {
      this.logger.error(
        `GM 修改密码：哈希失败 playerId=${playerId} actor=${normalizeModerationActor(actor)} error=${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    try {
      await this.authStore.saveUser({
        ...user,
        passwordHash: nextPasswordHash,
        updatedAt: Date.now(),
      });
    } catch (error) {
      this.logger.error(
        `GM 修改密码：写入失败 playerId=${playerId} userId=${user.id} actor=${normalizeModerationActor(actor)} elapsedMs=${Date.now() - startedAt} error=${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }

    const elapsedMs = Date.now() - startedAt;
    if (elapsedMs > 1500) {
      this.logger.warn(
        `GM 修改密码：完成但耗时偏长 playerId=${playerId} userId=${user.id} actor=${normalizeModerationActor(actor)} elapsedMs=${elapsedMs}`,
      );
    } else {
      this.logger.log(
        `GM 修改密码：完成 playerId=${playerId} userId=${user.id} actor=${normalizeModerationActor(actor)} elapsedMs=${elapsedMs}`,
      );
    }
  }

  /** 更新托管账号用户名，并同步修正显示名与持久化身份。 */
  async updateManagedPlayerAccount(playerId: string, username: string): Promise<ManagedAccountUpdateResult> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const user = await this.requireManagedUser(playerId);
    const normalizedUsername = normalizeUsername(username);
    const usernameError = validateUsername(normalizedUsername);
    if (usernameError) {
      throw new BadRequestException(usernameError);
    }

    if (normalizedUsername === user.username) {
      return {
        username: normalizedUsername,
        displayNameChanged: false,
        nextDisplayName: resolveDisplayName(user.displayName, user.username),
      };
    }

    const usernameConflict = await this.authStore.ensureAvailable(normalizedUsername, 'account', {
      exclude: [{ userId: user.id, kind: 'account' }],
    });
    if (usernameConflict) {
      throw new BadRequestException(usernameConflict);
    }

    const previousDisplayName = resolveDisplayName(user.displayName, user.username);
    const nextDisplayName = resolveDisplayName(user.displayName, normalizedUsername);
    if (nextDisplayName !== previousDisplayName) {
      const displayNameConflict = await this.authStore.ensureAvailable(nextDisplayName, 'display', {
        exclude: [{ userId: user.id, kind: 'display' }],
      });
      if (displayNameConflict) {
        throw new BadRequestException(displayNameConflict);
      }
    }

    const nextUser = await this.authStore.saveUser({
      ...user,
      username: normalizedUsername,
      updatedAt: Date.now(),
    });
    await this.persistIdentity(nextUser);
    if (nextDisplayName !== previousDisplayName) {
      this.syncRuntimeDisplayName(nextUser);
    }

    return {
      username: normalizedUsername,
      displayNameChanged: nextDisplayName !== previousDisplayName,
      nextDisplayName,
    };
  }

  /** GM 快捷封禁托管账号，封禁状态落在账号真源表。 */
  async banManagedPlayerAccount(playerId: string, reason: string, bannedBy = 'gm'): Promise<void> {
    const user = await this.requireManagedUser(playerId);
    const nextUser = {
      ...user,
      bannedAt: new Date().toISOString(),
      banReason: normalizeModerationReason(reason),
      bannedBy: normalizeModerationActor(bannedBy),
      updatedAt: Date.now(),
    };
    await this.authStore.saveUser(nextUser);
    try {
      await this.cancelMarketOrdersForBannedPlayer(user.playerId);
    } catch (error) {
      await this.restoreManagedUserAfterFailedBan(user);
      throw error;
    }
    this.leaderboardRuntimeService?.invalidateCaches();
  }

  /** GM 快捷解封托管账号。 */
  async unbanManagedPlayerAccount(playerId: string): Promise<void> {
    const user = await this.requireManagedUser(playerId);
    await this.authStore.saveUser({
      ...user,
      bannedAt: null,
      banReason: null,
      bannedBy: null,
      updatedAt: Date.now(),
    });
    this.leaderboardRuntimeService?.invalidateCaches();
  }

  /** 确认托管目标存在，否则直接返回可读错误。 */
  private async requireManagedUser(playerId: string): Promise<NativePlayerAuthUser> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    // 优先走内存索引：avoid 不必要的数据库往返，并降低 GM 高频管理操作的尾延迟。
    // 内存索引由 onModuleInit 完整重建、saveUser 增量同步，保证与 DB 一致。
    const cached = this.authStore.getMemoryUserByPlayerId(playerId);
    if (cached) {
      return cached;
    }

    const user = await this.authStore.findUserByPlayerId(playerId);
    if (!user) {
      throw new BadRequestException('目标玩家没有可管理的账号');
    }
    return user;
  }

  /** 把账号变化持久化到身份层，便于下次启动后继续保留。 */
  private async persistIdentity(user: NativePlayerAuthUser): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.playerIdentityPersistenceService.isEnabled()) {
      return;
    }

    try {
      await this.playerIdentityPersistenceService.savePlayerIdentity({
        version: 1,
        userId: user.id,
        username: user.username,
        displayName: resolveDisplayName(user.displayName, user.username),
        playerId: user.playerId,
        playerNo: user.playerNo,
        playerName: user.pendingRoleName?.trim() || user.username,
        persistedSource: GM_AUTH_CONTRACT.identityPersistedSource,
        updatedAt: Date.now(),
      });
    } catch (error) {
      this.logger.warn(`持久化托管账号身份失败：userId=${user.id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 将显示名变化同步回在线 runtime，避免面板与在线态脱节。 */
  private syncRuntimeDisplayName(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.playerRuntimeService.getPlayerIdentityProjection(user.playerId)) {
      return;
    }

    this.playerRuntimeService.setIdentity(user.playerId, {
      displayName: resolveDisplayName(user.displayName, user.username),
    });
  }

  /** 封禁账号后撤销其仍开放的坊市/拍卖订单，资产沿市场托管返还链路回到玩家名下。 */
  private async cancelMarketOrdersForBannedPlayer(playerId: string): Promise<void> {
    const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
    if (!normalizedPlayerId || !this.marketRuntimeService) {
      return;
    }
    try {
      await this.marketRuntimeService.cancelOpenOrdersForBannedPlayer(normalizedPlayerId);
    } catch (error) {
      this.logger.error(
        `封禁账号后撤销坊市订单失败 playerId=${normalizedPlayerId}：${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  /** 封禁联动失败时回滚账号状态，避免封禁状态与市场资产状态半完成。 */
  private async restoreManagedUserAfterFailedBan(previousUser: NativePlayerAuthUser): Promise<void> {
    try {
      await this.authStore.saveUser({
        ...previousUser,
        updatedAt: Date.now(),
      });
      this.leaderboardRuntimeService?.invalidateCaches();
    } catch (rollbackError) {
      this.logger.error(
        `封禁失败后回滚账号状态失败 playerId=${previousUser.playerId} userId=${previousUser.id}：${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`,
        rollbackError instanceof Error ? rollbackError.stack : undefined,
      );
      throw rollbackError;
    }
  }
}

function normalizeModerationReason(reason: string): string {
  const normalized = typeof reason === 'string' ? reason.trim() : '';
  return (normalized || 'GM 风险复核封禁').slice(0, 255);
}

function normalizeModerationActor(actor: string): string {
  const normalized = typeof actor === 'string' ? actor.trim() : '';
  return (normalized || 'gm').slice(0, 64);
}
