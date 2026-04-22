import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';

import { normalizeUsername, resolveDisplayName, validatePassword, validateUsername } from '../../auth/account-validation';
import { hashPassword } from '../../auth/password-hash';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { GM_AUTH_CONTRACT } from './native-gm-contract';
import { NativePlayerAuthStoreService } from './native-player-auth-store.service';
import type { NativePlayerAuthUser } from './native-player-auth-store.service';
/**
 * ManagedAccountRecord：定义接口结构约束，明确可交付字段含义。
 */


interface ManagedAccountRecord {
/**
 * playerId：玩家ID标识。
 */

  playerId: string;  
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
/**
 * PlayerRuntimeSnapshot：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimeSnapshot {
/**
 * displayName：显示名称名称或显示文本。
 */

  displayName?: string;
}
/**
 * PlayerRuntimePort：定义接口结构约束，明确可交付字段含义。
 */


interface PlayerRuntimePort {
  snapshot(playerId: string): PlayerRuntimeSnapshot | null;
  setIdentity(playerId: string, input: {  
  /**
 * displayName：显示名称名称或显示文本。
 */
 displayName?: string }): unknown;
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

  /** 账号索引与冲突检查入口。 */
  constructor(
    private readonly authStore: NativePlayerAuthStoreService,
    @Inject(PlayerIdentityPersistenceService)
    playerIdentityPersistenceService: unknown,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
  ) {
    this.playerIdentityPersistenceService = playerIdentityPersistenceService as PlayerIdentityPersistencePort;
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimePort;
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
        playerName: user.pendingRoleName ?? user.username,
        userId: user.id,
        username: user.username,
        displayName: user.displayName,
        createdAt: user.createdAt,
        totalOnlineSeconds: user.totalOnlineSeconds,
        currentOnlineStartedAt: user.currentOnlineStartedAt,
      });
    }
    return result;
  }

  /** 更新托管账号密码，修改前仍沿用统一密码规则。 */
  async updateManagedPlayerPassword(playerId: string, newPassword: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const user = await this.requireManagedUser(playerId);
    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    await this.authStore.saveUser({
      ...user,
      passwordHash: await hashPassword(newPassword),
      updatedAt: Date.now(),
    });
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

  /** 确认托管目标存在，否则直接返回可读错误。 */
  private async requireManagedUser(playerId: string): Promise<NativePlayerAuthUser> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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

    if (!this.playerRuntimeService.snapshot(user.playerId)) {
      return;
    }

    this.playerRuntimeService.setIdentity(user.playerId, {
      displayName: resolveDisplayName(user.displayName, user.username),
    });
  }
}
