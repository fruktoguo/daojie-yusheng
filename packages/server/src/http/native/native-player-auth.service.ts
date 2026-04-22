import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { buildDefaultRoleName, normalizeDisplayName, normalizeRoleName, normalizeUsername, resolveDisplayName, validateDisplayName, validatePassword, validateRoleName, validateUsername } from '../../auth/account-validation';
import { hashPassword, verifyPassword } from '../../auth/password-hash';
import { WorldPlayerSnapshotService } from '../../network/world-player-snapshot.service';
import { WorldPlayerTokenCodecService } from '../../network/world-player-token-codec.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { NativePlayerAuthStoreService } from './native-player-auth-store.service';
import type { NativePlayerAuthUser } from './native-player-auth-store.service';
/**
 * AuthTokens：定义接口结构约束，明确可交付字段含义。
 */


interface AuthTokens {
/**
 * accessToken：accessToken标识。
 */

  accessToken: string;  
  /**
 * refreshToken：refreshToken标识。
 */

  refreshToken: string;
}
/**
 * DisplayNameAvailabilityResult：定义接口结构约束，明确可交付字段含义。
 */


interface DisplayNameAvailabilityResult {
/**
 * available：available相关字段。
 */

  available: boolean;  
  /**
 * message：message相关字段。
 */

  message?: string;
}
/**
 * TokenPayload：定义接口结构约束，明确可交付字段含义。
 */


interface TokenPayload {
/**
 * sub：sub相关字段。
 */

  sub?: unknown;  
  /**
 * username：username名称或显示文本。
 */

  username?: unknown;  
  /**
 * role：role相关字段。
 */

  role?: unknown;
}
/**
 * WorldPlayerTokenCodecPort：定义接口结构约束，明确可交付字段含义。
 */


interface WorldPlayerTokenCodecPort {
  validateRefreshToken(token: string): TokenPayload | null;
  validateAccessToken(token: string): TokenPayload | null;
  issueAccessToken(payload: Record<string, unknown>): string;
  issueRefreshToken(payload: Record<string, unknown>): string;
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
 * name：名称名称或显示文本。
 */
 name?: string;  
 /**
 * displayName：显示名称名称或显示文本。
 */
 displayName?: string }): unknown;
}
/**
 * WorldPlayerSnapshotPort：定义接口结构约束，明确可交付字段含义。
 */


interface WorldPlayerSnapshotPort {
  ensureNativeStarterSnapshot(playerId: string): Promise<{  
  /**
 * ok：ok相关字段。
 */
 ok?: boolean;  
 /**
 * failureStage：failureStage相关字段。
 */
 failureStage?: string | null }>;
}

/** 主线玩家鉴权编排服务：负责注册、登录、刷新和身份同步。 */
@Injectable()
export class NativePlayerAuthService {
  /** 记录账号生命周期关键操作。 */
  private readonly logger = new Logger(NativePlayerAuthService.name);  
  /**
 * worldPlayerTokenCodecService：世界玩家TokenCodec服务引用。
 */


  private readonly worldPlayerTokenCodecService: WorldPlayerTokenCodecPort;  
  /**
 * playerIdentityPersistenceService：玩家IdentityPersistence服务引用。
 */


  private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort;  
  /**
 * playerRuntimeService：玩家运行态服务引用。
 */


  private readonly playerRuntimeService: PlayerRuntimePort;  
  /**
 * worldPlayerSnapshotService：世界玩家快照服务引用。
 */


  private readonly worldPlayerSnapshotService: WorldPlayerSnapshotPort;

  /** 账号索引与唯一性检查入口。 */
  constructor(
    private readonly authStore: NativePlayerAuthStoreService,
    @Inject(WorldPlayerTokenCodecService)
    worldPlayerTokenCodecService: unknown,
    @Inject(PlayerIdentityPersistenceService)
    playerIdentityPersistenceService: unknown,
    @Inject(PlayerRuntimeService)
    playerRuntimeService: unknown,
    @Inject(WorldPlayerSnapshotService)
    worldPlayerSnapshotService: unknown,
  ) {
    this.worldPlayerTokenCodecService = worldPlayerTokenCodecService as WorldPlayerTokenCodecPort;
    this.playerIdentityPersistenceService = playerIdentityPersistenceService as PlayerIdentityPersistencePort;
    this.playerRuntimeService = playerRuntimeService as PlayerRuntimePort;
    this.worldPlayerSnapshotService = worldPlayerSnapshotService as WorldPlayerSnapshotPort;
  }

  /** 注册新账号，并完成建档、持久化与令牌签发。 */
  async register(accountName: string, password: string, displayName: string, roleName: string): Promise<AuthTokens> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedUsername = normalizeUsername(accountName);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedRoleName = normalizeRoleName(roleName) || buildDefaultRoleName(normalizedUsername);

    const usernameError = validateUsername(normalizedUsername);
    if (usernameError) {
      throw new BadRequestException(usernameError);
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    const displayNameError = validateDisplayName(normalizedDisplayName);
    if (displayNameError) {
      throw new BadRequestException(displayNameError);
    }

    const roleNameError = validateRoleName(normalizedRoleName);
    if (roleNameError) {
      throw new BadRequestException(roleNameError);
    }

    const usernameConflict = await this.authStore.ensureAvailable(normalizedUsername, 'account');
    if (usernameConflict) {
      throw new BadRequestException(usernameConflict);
    }

    const displayNameConflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display');
    if (displayNameConflict) {
      throw new BadRequestException(displayNameConflict);
    }

    const roleNameConflict = await this.authStore.ensureAvailable(normalizedRoleName, 'role');
    if (roleNameConflict) {
      throw new BadRequestException(roleNameConflict);
    }

    const userId = randomUUID();
    const createdAt = new Date().toISOString();
    const user = await this.authStore.saveUser({
      id: userId,
      userId,
      username: normalizedUsername,
      displayName: normalizedDisplayName,
      pendingRoleName: normalizedRoleName,
      playerId: buildPlayerId(userId),
      playerName: normalizedRoleName,
      passwordHash: await hashPassword(password),
      totalOnlineSeconds: 0,
      currentOnlineStartedAt: null,
      createdAt,
      updatedAt: Date.now(),
    });

    await this.persistIdentity(user);
    await this.ensureStarterSnapshot(user.playerId);
    return this.issueTokens(user);
  }

  /** 登录现有账号，只接受账号名入口。 */
  async login(loginName: string, password: string): Promise<AuthTokens> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedLoginName = normalizeUsername(loginName).trim();
    const user = await this.authStore.findUserByUsername(normalizedLoginName);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    if (!await verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('密码错误');
    }

    await this.persistIdentity(user);
    await this.ensureStarterSnapshot(user.playerId);
    return this.issueTokens(user);
  }

  /** 刷新登录态，但只接受普通玩家令牌。 */
  async refresh(refreshToken: string): Promise<AuthTokens> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const payload = this.worldPlayerTokenCodecService.validateRefreshToken(typeof refreshToken === 'string' ? refreshToken.trim() : '');
    if (!payload || payload.role === 'gm' || typeof payload.sub !== 'string' || typeof payload.username !== 'string') {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }

    const user = await this.authStore.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    await this.persistIdentity(user);
    await this.ensureStarterSnapshot(user.playerId);
    return this.issueTokens(user);
  }

  /** 检查显示名可用性，供注册页和 GM 修改前复用。 */
  async checkDisplayName(displayName = ''): Promise<DisplayNameAvailabilityResult> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedDisplayName = normalizeDisplayName(displayName);
    const error = validateDisplayName(normalizedDisplayName);
    if (error) {
      return { available: false, message: error };
    }

    const conflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display');
    if (conflict) {
      return { available: false, message: conflict };
    }

    return { available: true };
  }

  /** 修改当前账号密码。 */
  async updatePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<{  
  /**
 * ok：ok相关字段。
 */
 ok: true }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const user = await this.requireUser(accessToken);
    if (!await verifyPassword(currentPassword, user.passwordHash)) {
      throw new BadRequestException('当前密码错误');
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    await this.authStore.saveUser({
      ...user,
      passwordHash: await hashPassword(newPassword),
      updatedAt: Date.now(),
    });
    return { ok: true };
  }

  /** 修改当前账号显示名，并同步回持久化和 runtime。 */
  async updateDisplayName(accessToken: string, displayName: string): Promise<{  
  /**
 * displayName：显示名称名称或显示文本。
 */
 displayName: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const user = await this.requireUser(accessToken);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const displayNameError = validateDisplayName(normalizedDisplayName);
    if (displayNameError) {
      throw new BadRequestException(displayNameError);
    }

    const currentDisplayName = resolveDisplayName(user.displayName, user.username);
    if (normalizedDisplayName === currentDisplayName) {
      return { displayName: normalizedDisplayName };
    }

    const displayNameConflict = await this.authStore.ensureAvailable(normalizedDisplayName, 'display', {
      exclude: [{ userId: user.id, kind: 'display' }],
    });
    if (displayNameConflict) {
      throw new BadRequestException(displayNameConflict);
    }

    const nextUser = await this.authStore.saveUser({
      ...user,
      displayName: normalizedDisplayName,
      updatedAt: Date.now(),
    });
    await this.persistIdentity(nextUser);
    this.syncRuntimeDisplayName(nextUser);
    return { displayName: normalizedDisplayName };
  }

  /** 修改当前账号角色名，并同步回持久化和 runtime。 */
  async updateRoleName(accessToken: string, roleName: string): Promise<{  
  /**
 * roleName：role名称名称或显示文本。
 */
 roleName: string }> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const user = await this.requireUser(accessToken);
    const normalizedRoleName = normalizeRoleName(roleName);
    const roleNameError = validateRoleName(normalizedRoleName);
    if (roleNameError) {
      throw new BadRequestException(roleNameError);
    }

    if (normalizeRoleName(user.pendingRoleName) === normalizedRoleName) {
      return { roleName: normalizedRoleName };
    }

    const roleNameConflict = await this.authStore.ensureAvailable(normalizedRoleName, 'role', {
      exclude: [{ userId: user.id, kind: 'role' }],
    });
    if (roleNameConflict) {
      throw new BadRequestException(roleNameConflict);
    }

    const nextUser = await this.authStore.saveUser({
      ...user,
      pendingRoleName: normalizedRoleName,
      playerName: normalizedRoleName,
      updatedAt: Date.now(),
    });
    await this.persistIdentity(nextUser);
    this.syncRuntimeRoleName(nextUser);
    return { roleName: normalizedRoleName };
  }  
  /**
 * requireUser：执行requireUser相关逻辑。
 * @param accessToken string 参数说明。
 * @returns 返回 Promise，完成后得到requireUser。
 */


  private async requireUser(accessToken: string): Promise<NativePlayerAuthUser> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const token = typeof accessToken === 'string' ? accessToken.trim() : '';
    if (!token) {
      throw new UnauthorizedException('未登录');
    }

    const payload = this.worldPlayerTokenCodecService.validateAccessToken(token);
    if (typeof payload?.sub !== 'string') {
      throw new UnauthorizedException('登录已失效');
    }

    const user = await this.authStore.findUserById(payload.sub);
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }
    return user;
  }  
  /**
 * issueTokens：判断issueToken是否满足条件。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 返回issueToken。
 */


  private issueTokens(user: NativePlayerAuthUser): AuthTokens {
    const displayName = resolveDisplayName(user.displayName, user.username);
    const playerName = user.pendingRoleName?.trim() || user.username;
    const payload = {
      sub: user.id,
      username: user.username,
      displayName,
      playerId: user.playerId,
      playerName,
    };

    return {
      accessToken: this.worldPlayerTokenCodecService.issueAccessToken(payload),
      refreshToken: this.worldPlayerTokenCodecService.issueRefreshToken(payload),
    };
  }  
  /**
 * persistIdentity：判断persistIdentity是否满足条件。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 返回 Promise，完成后得到persistIdentity。
 */


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
        persistedSource: 'native',
        updatedAt: Date.now(),
      });
    } catch (error) {
      this.logger.warn(`持久化主线玩家身份失败：userId=${user.id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }  
  /**
 * ensureStarterSnapshot：执行ensureStarter快照相关逻辑。
 * @param playerId string 玩家 ID。
 * @returns 返回 Promise，完成后得到ensureStarter快照。
 */


  private async ensureStarterSnapshot(playerId: string): Promise<void> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.worldPlayerSnapshotService || typeof this.worldPlayerSnapshotService.ensureNativeStarterSnapshot !== 'function') {
      return;
    }

    const result = await this.worldPlayerSnapshotService.ensureNativeStarterSnapshot(playerId).catch((error: unknown) => ({
      ok: false,
      failureStage: error instanceof Error ? error.message : String(error),
    }));

    if (result?.ok === false && result.failureStage !== 'native_snapshot_recovery_persistence_disabled') {
      this.logger.warn(`补建原生初始快照已跳过：playerId=${playerId} reason=${result.failureStage ?? '未知'}`);
    }
  }  
  /**
 * syncRuntimeDisplayName：判断运行态显示名称是否满足条件。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 无返回值，直接更新运行态显示名称相关状态。
 */


  private syncRuntimeDisplayName(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!this.playerRuntimeService.snapshot(user.playerId)) {
      return;
    }

    this.playerRuntimeService.setIdentity(user.playerId, {
      displayName: resolveDisplayName(user.displayName, user.username),
    });
  }  
  /**
 * syncRuntimeRoleName：处理运行态Role名称并更新相关状态。
 * @param user NativePlayerAuthUser 参数说明。
 * @returns 无返回值，直接更新运行态Role名称相关状态。
 */


  private syncRuntimeRoleName(user: NativePlayerAuthUser): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const runtime = this.playerRuntimeService.snapshot(user.playerId);
    if (!runtime) {
      return;
    }

    this.playerRuntimeService.setIdentity(user.playerId, {
      name: user.pendingRoleName?.trim() || user.username,
      displayName: runtime.displayName,
    });
  }
}
/**
 * buildPlayerId：构建并返回目标对象。
 * @param userId string user ID。
 * @returns 返回玩家ID。
 */


function buildPlayerId(userId: string): string {
  return `p_${String(userId ?? '').trim()}`;
}
