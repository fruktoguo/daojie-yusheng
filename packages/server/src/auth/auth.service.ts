/**
 * 认证服务 —— 用户注册 / 登录 / 令牌签发与刷新，以及 GM 认证管理
 */
import { Injectable, BadRequestException, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ACCOUNT_MAX_LENGTH, AuthTokenRes, DisplayNameAvailabilityRes, GmLoginRes } from '@mud/shared';
import * as fs from 'fs';
import { UserEntity } from '../database/entities/user.entity';
import { PlayerEntity } from '../database/entities/player.entity';
import { PersistentDocumentService } from '../database/persistent-document.service';
import {
  normalizeDisplayName,
  normalizeRoleName,
  normalizeUsername,
  resolveDisplayName,
  validateDisplayName,
  validatePassword,
  validateRoleName,
  validateUsername,
} from './account-validation';
import { GM_CONFIG_PATH, GM_TOKEN_EXPIRES_IN } from '../constants/auth/gm';
import { NameUniquenessService } from './name-uniqueness.service';

/** GM 密码配置文件结构 */
interface GmConfigFile {
  passwordHash: string;
  updatedAt: string;
}

const SERVER_CONFIG_SCOPE = 'server_config';
const GM_CONFIG_DOCUMENT_KEY = 'gm_auth';
const AUTH_MIGRATION_SCOPE = 'auth_migrations';
const LEGACY_ACCOUNT_TO_ROLE_NAME_MIGRATION_KEY = 'legacy_account_to_role_name_v1';
/** 仅迁移账号/角色名拆分上线前创建的旧用户，避免后续新账号在重启时被误改。 */
const ACCOUNT_ROLE_LOGIN_SPLIT_RELEASED_AT = Date.parse('2026-03-27T17:14:47+08:00');

interface MigrationMarkerDocument {
  completedAt: string;
  updatedUsers: number;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly persistentDocumentService: PersistentDocumentService,
    private readonly nameUniquenessService: NameUniquenessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.migrateLegacyAccountsToRoleNames();
  }

  /** 用户注册：校验输入、查重、创建账号并签发令牌 */
  async register(accountName: string, password: string, displayName: string, roleName: string): Promise<AuthTokenRes> {
    const normalizedUsername = normalizeUsername(accountName);
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedRoleName = normalizeRoleName(roleName);
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
    if (normalizedUsername === normalizedRoleName) {
      throw new BadRequestException('角色名称与账号重名');
    }
    if (normalizedUsername === normalizedDisplayName) {
      throw new BadRequestException('显示名称与账号重名');
    }
    if (normalizedRoleName === normalizedDisplayName) {
      throw new BadRequestException('显示名称与角色名称冲突');
    }

    const usernameConflict = await this.nameUniquenessService.ensureAvailable(normalizedUsername, 'account');
    if (usernameConflict) {
      throw new BadRequestException(usernameConflict);
    }
    const roleNameConflict = await this.nameUniquenessService.ensureAvailable(normalizedRoleName, 'role');
    if (roleNameConflict) {
      throw new BadRequestException(roleNameConflict);
    }
    const displayNameConflict = await this.nameUniquenessService.ensureAvailable(normalizedDisplayName, 'display');
    if (displayNameConflict) {
      throw new BadRequestException(displayNameConflict);
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      username: normalizedUsername,
      displayName: normalizedDisplayName,
      pendingRoleName: normalizedRoleName,
      passwordHash,
    });
    await this.userRepo.save(user);
    return this.issueTokens(user);
  }

  /** 用户登录：验证密码并签发令牌 */
  async login(loginName: string, password: string): Promise<AuthTokenRes> {
    const normalizedLoginName = normalizeUsername(loginName).trim();
    const directUser = await this.userRepo.findOne({ where: { username: normalizedLoginName } });
    const roleMatchedUsers = await this.findUsersByRoleName(normalizedLoginName);
    const candidates = new Map<string, UserEntity>();
    if (directUser) {
      candidates.set(directUser.id, directUser);
    }
    roleMatchedUsers.forEach((user) => {
      candidates.set(user.id, user);
    });

    if (candidates.size === 0) {
      throw new UnauthorizedException('用户不存在');
    }

    const matchedUsers: UserEntity[] = [];
    for (const user of candidates.values()) {
      if (await bcrypt.compare(password, user.passwordHash)) {
        matchedUsers.push(user);
      }
    }

    if (matchedUsers.length === 0) {
      throw new UnauthorizedException('密码错误');
    }
    if (directUser && matchedUsers.some((user) => user.id === directUser.id)) {
      return this.issueTokens(directUser);
    }
    if (matchedUsers.length === 1) {
      return this.issueTokens(matchedUsers[0]);
    }
    throw new BadRequestException('该角色名对应多个账号，请改用账号登录');
  }

  /** 使用 refreshToken 刷新访问令牌 */
  async refresh(refreshToken: string): Promise<AuthTokenRes> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      if (typeof payload?.sub !== 'string') {
        throw new UnauthorizedException('刷新令牌无效或已过期');
      }
      const user = await this.userRepo.findOne({ where: { id: payload.sub } });
      if (!user) {
        throw new UnauthorizedException('用户不存在');
      }
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
  }

  /** 检查显示名称是否可用 */
  async checkDisplayNameAvailability(displayName: string): Promise<DisplayNameAvailabilityRes> {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const error = validateDisplayName(normalizedDisplayName);
    if (error) {
      return { available: false, message: error };
    }
    const conflict = await this.nameUniquenessService.ensureAvailable(normalizedDisplayName, 'display');
    if (conflict) {
      return { available: false, message: conflict };
    }
    return { available: true };
  }

  /** 校验玩家 JWT，返回用户信息或 null（GM 令牌不通过） */
  validateToken(token: string): { userId: string; username: string; displayName: string } | null {
    try {
      const payload = this.jwtService.verify(token);
      if (payload?.role === 'gm') return null;
      if (typeof payload?.sub !== 'string' || typeof payload?.username !== 'string') {
        return null;
      }
      return {
        userId: payload.sub,
        username: payload.username,
        displayName: typeof payload?.displayName === 'string'
          ? payload.displayName
          : resolveDisplayName(null, payload.username),
      };
    } catch {
      return null;
    }
  }

  /** GM 登录：验证密码并签发 GM 专用令牌 */
  async loginGm(password: string): Promise<GmLoginRes> {
    const passwordHash = await this.getOrCreateGmPasswordHash();
    const valid = await bcrypt.compare(password, passwordHash);
    if (!valid) {
      throw new UnauthorizedException('GM 密码错误');
    }

    return {
      accessToken: this.jwtService.sign(
        { role: 'gm' },
        { expiresIn: `${GM_TOKEN_EXPIRES_IN}s` },
      ),
      expiresInSec: GM_TOKEN_EXPIRES_IN,
    };
  }

  /** 修改 GM 密码 */
  async changeGmPassword(currentPassword: string, newPassword: string): Promise<void> {
    const passwordHash = await this.getOrCreateGmPasswordHash();
    const valid = await bcrypt.compare(currentPassword, passwordHash);
    if (!valid) {
      throw new UnauthorizedException('当前 GM 密码错误');
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    const nextHash = await bcrypt.hash(newPassword, 10);
    await this.writeGmConfig({
      passwordHash: nextHash,
      updatedAt: new Date().toISOString(),
    });
  }

  /** 校验 GM 令牌是否有效 */
  validateGmToken(token: string): boolean {
    try {
      const payload = this.jwtService.verify(token);
      return payload?.role === 'gm';
    } catch {
      return false;
    }
  }

  /** 为用户签发 accessToken 和 refreshToken */
  private issueTokens(user: UserEntity): AuthTokenRes {
    const payload = {
      sub: user.id,
      username: user.username,
      displayName: resolveDisplayName(user.displayName, user.username),
    };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
    };
  }

  /** 首次进入世界时取出注册阶段保留的角色名 */
  async takePendingRoleName(userId: string): Promise<string | null> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      return null;
    }
    const pendingRoleName = typeof user.pendingRoleName === 'string'
      ? normalizeRoleName(user.pendingRoleName)
      : '';
    if (!pendingRoleName) {
      return null;
    }
    user.pendingRoleName = null;
    await this.userRepo.save(user);
    return pendingRoleName;
  }

  /** 获取或首次创建 GM 密码哈希（首次使用环境变量或默认密码） */
  private async getOrCreateGmPasswordHash(): Promise<string> {
    const existing = await this.readGmConfig();
    if (existing?.passwordHash) {
      return existing.passwordHash;
    }

    const initialPassword = process.env.GM_PASSWORD?.trim() || 'admin123';
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    await this.writeGmConfig({
      passwordHash,
      updatedAt: new Date().toISOString(),
    });
    return passwordHash;
  }

  private async readGmConfig(): Promise<GmConfigFile | null> {
    try {
      let raw = await this.persistentDocumentService.get<Partial<GmConfigFile>>(SERVER_CONFIG_SCOPE, GM_CONFIG_DOCUMENT_KEY);
      if (!raw) {
        await this.importLegacyGmConfigIfNeeded();
        raw = await this.persistentDocumentService.get<Partial<GmConfigFile>>(SERVER_CONFIG_SCOPE, GM_CONFIG_DOCUMENT_KEY);
      }
      if (!raw) {
        return null;
      }
      if (typeof raw.passwordHash !== 'string' || !raw.passwordHash.trim()) {
        return null;
      }
      return {
        passwordHash: raw.passwordHash,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
      };
    } catch {
      return null;
    }
  }

  private async writeGmConfig(config: GmConfigFile): Promise<void> {
    await this.persistentDocumentService.save(SERVER_CONFIG_SCOPE, GM_CONFIG_DOCUMENT_KEY, config);
  }

  private async importLegacyGmConfigIfNeeded(): Promise<void> {
    if (!fs.existsSync(GM_CONFIG_PATH)) {
      return;
    }
    try {
      const raw = JSON.parse(fs.readFileSync(GM_CONFIG_PATH, 'utf-8')) as Partial<GmConfigFile>;
      if (typeof raw.passwordHash !== 'string' || !raw.passwordHash.trim()) {
        return;
      }
      await this.persistentDocumentService.save(SERVER_CONFIG_SCOPE, GM_CONFIG_DOCUMENT_KEY, {
        passwordHash: raw.passwordHash,
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date(0).toISOString(),
      });
    } catch {
      // 旧文件损坏时保持与原逻辑一致，回退为重新初始化 GM 密码。
    }
  }

  private async findUsersByRoleName(roleName: string): Promise<UserEntity[]> {
    const normalizedRoleName = normalizeRoleName(roleName);
    if (!normalizedRoleName) {
      return [];
    }
    const matchedPlayers = await this.playerRepo.find({
      select: ['userId'],
      where: { name: normalizedRoleName },
    });
    const matchedUserIds = [...new Set(matchedPlayers.map((player) => player.userId))];
    const qb = this.userRepo.createQueryBuilder('user')
      .where('user.pendingRoleName = :roleName', { roleName: normalizedRoleName });
    if (matchedUserIds.length > 0) {
      qb.orWhere('user.id IN (:...userIds)', { userIds: matchedUserIds });
    }
    return qb.getMany();
  }

  private async migrateLegacyAccountsToRoleNames(): Promise<void> {
    const existingMarker = await this.persistentDocumentService.get<MigrationMarkerDocument>(
      AUTH_MIGRATION_SCOPE,
      LEGACY_ACCOUNT_TO_ROLE_NAME_MIGRATION_KEY,
    );
    if (existingMarker) {
      return;
    }

    const users = await this.userRepo.find({
      select: ['id', 'username', 'createdAt'],
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    if (users.length === 0) {
      await this.markLegacyAccountMigrationCompleted(0);
      return;
    }

    const legacyUsers = users.filter((user) => user.createdAt.getTime() < ACCOUNT_ROLE_LOGIN_SPLIT_RELEASED_AT);
    if (legacyUsers.length === 0) {
      await this.markLegacyAccountMigrationCompleted(0);
      return;
    }

    const players = await this.playerRepo.find({
      select: ['userId', 'name'],
      where: { userId: In(legacyUsers.map((user) => user.id)) },
    });
    const roleNameByUserId = new Map<string, string>();
    players.forEach((player) => {
      const normalizedRoleName = normalizeRoleName(player.name);
      if (normalizedRoleName && !roleNameByUserId.has(player.userId)) {
        roleNameByUserId.set(player.userId, normalizedRoleName);
      }
    });

    const migrationCandidates = legacyUsers.filter((user) => roleNameByUserId.has(user.id));
    if (migrationCandidates.length === 0) {
      await this.markLegacyAccountMigrationCompleted(0);
      return;
    }
    const migrationCandidateIds = new Set(migrationCandidates.map((user) => user.id));

    const usedNames = new Set(
      users
        .filter((user) => !migrationCandidateIds.has(user.id))
        .map((user) => normalizeUsername(user.username)),
    );
    const updates: Array<{ id: string; nextUsername: string }> = [];

    migrationCandidates.forEach((user) => {
      const baseName = roleNameByUserId.get(user.id);
      if (!baseName) {
        return;
      }
      const nextUsername = this.allocateMigratedAccountName(baseName, usedNames);
      if (nextUsername !== normalizeUsername(user.username)) {
        updates.push({ id: user.id, nextUsername });
      }
    });

    if (updates.length === 0) {
      await this.markLegacyAccountMigrationCompleted(0);
      return;
    }

    await this.userRepo.manager.transaction(async (manager) => {
      for (const update of updates) {
        await manager.update(UserEntity, { id: update.id }, { username: this.buildTemporaryMigratedUsername(update.id) });
      }

      for (const update of updates) {
        await manager.update(UserEntity, { id: update.id }, { username: update.nextUsername });
      }
    });

    if (updates.length > 0) {
      this.logger.log(`已同步 ${updates.length} 个旧账号的登录账号为角色名`);
    }
    await this.markLegacyAccountMigrationCompleted(updates.length);
  }

  private allocateMigratedAccountName(baseName: string, usedNames: Set<string>): string {
    let suffixIndex = 0;
    while (true) {
      const suffix = suffixIndex === 0 ? '' : `_${suffixIndex + 1}`;
      const candidate = `${this.truncateToLength(baseName, ACCOUNT_MAX_LENGTH - [...suffix].length)}${suffix}`;
      if (!usedNames.has(candidate)) {
        usedNames.add(candidate);
        return candidate;
      }
      suffixIndex += 1;
    }
  }

  private truncateToLength(value: string, maxLength: number): string {
    if (maxLength <= 0) {
      return '';
    }
    return [...value].slice(0, maxLength).join('');
  }

  private buildTemporaryMigratedUsername(userId: string): string {
    return this.truncateToLength(`__migrating__${userId.replace(/-/g, '')}`, ACCOUNT_MAX_LENGTH);
  }

  private async markLegacyAccountMigrationCompleted(updatedUsers: number): Promise<void> {
    await this.persistentDocumentService.save<MigrationMarkerDocument>(
      AUTH_MIGRATION_SCOPE,
      LEGACY_ACCOUNT_TO_ROLE_NAME_MIGRATION_KEY,
      {
        completedAt: new Date().toISOString(),
        updatedUsers,
      },
    );
  }
}
