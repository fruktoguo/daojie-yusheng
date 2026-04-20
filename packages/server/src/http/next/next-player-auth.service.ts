import { BadRequestException, Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import { buildDefaultRoleName, normalizeDisplayName, normalizeRoleName, normalizeUsername, resolveDisplayName, validateDisplayName, validatePassword, validateRoleName, validateUsername } from '../../auth/account-validation';
import { hashPassword, verifyPassword } from '../../auth/password-hash';
import { WorldPlayerSnapshotService } from '../../network/world-player-snapshot.service';
import { WorldPlayerTokenCodecService } from '../../network/world-player-token-codec.service';
import { PlayerIdentityPersistenceService } from '../../persistence/player-identity-persistence.service';
import { PlayerRuntimeService } from '../../runtime/player/player-runtime.service';
import { NextPlayerAuthStoreService } from './next-player-auth-store.service';
import type { NextPlayerAuthUser } from './next-player-auth-store.service';

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

interface DisplayNameAvailabilityResult {
  available: boolean;
  message?: string;
}

interface TokenPayload {
  sub?: unknown;
  username?: unknown;
  role?: unknown;
}

interface WorldPlayerTokenCodecPort {
  validateRefreshToken(token: string): TokenPayload | null;
  validateAccessToken(token: string): TokenPayload | null;
  issueAccessToken(payload: Record<string, unknown>): string;
  issueRefreshToken(payload: Record<string, unknown>): string;
}

interface PlayerIdentityPersistencePort {
  isEnabled(): boolean;
  savePlayerIdentity(identity: Record<string, unknown>): Promise<unknown>;
}

interface PlayerRuntimeSnapshot {
  displayName?: string;
}

interface PlayerRuntimePort {
  snapshot(playerId: string): PlayerRuntimeSnapshot | null;
  setIdentity(playerId: string, input: { name?: string; displayName?: string }): unknown;
}

interface WorldPlayerSnapshotPort {
  ensureNativeStarterSnapshot(playerId: string): Promise<{ ok?: boolean; failureStage?: string | null }>;
}

/** Next 玩家鉴权编排服务：负责注册、登录、刷新和身份同步。 */
@Injectable()
export class NextPlayerAuthService {
  /** 记录账号生命周期关键操作。 */
  private readonly logger = new Logger(NextPlayerAuthService.name);

  private readonly worldPlayerTokenCodecService: WorldPlayerTokenCodecPort;

  private readonly playerIdentityPersistenceService: PlayerIdentityPersistencePort;

  private readonly playerRuntimeService: PlayerRuntimePort;

  private readonly worldPlayerSnapshotService: WorldPlayerSnapshotPort;

  /** 账号索引与唯一性检查入口。 */
  constructor(
    private readonly authStore: NextPlayerAuthStoreService,
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
  async updatePassword(accessToken: string, currentPassword: string, newPassword: string): Promise<{ ok: true }> {
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
  async updateDisplayName(accessToken: string, displayName: string): Promise<{ displayName: string }> {
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
  async updateRoleName(accessToken: string, roleName: string): Promise<{ roleName: string }> {
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

  private async requireUser(accessToken: string): Promise<NextPlayerAuthUser> {
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

  private issueTokens(user: NextPlayerAuthUser): AuthTokens {
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

  private async persistIdentity(user: NextPlayerAuthUser): Promise<void> {
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
      this.logger.warn(`持久化 next 玩家身份失败：userId=${user.id} error=${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async ensureStarterSnapshot(playerId: string): Promise<void> {
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

  private syncRuntimeDisplayName(user: NextPlayerAuthUser): void {
    if (!this.playerRuntimeService.snapshot(user.playerId)) {
      return;
    }

    this.playerRuntimeService.setIdentity(user.playerId, {
      displayName: resolveDisplayName(user.displayName, user.username),
    });
  }

  private syncRuntimeRoleName(user: NextPlayerAuthUser): void {
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

function buildPlayerId(userId: string): string {
  return `p_${String(userId ?? '').trim()}`;
}
