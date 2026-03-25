/**
 * 认证服务 —— 用户注册 / 登录 / 令牌签发与刷新，以及 GM 认证管理
 */
import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthTokenRes, DisplayNameAvailabilityRes, GmLoginRes } from '@mud/shared';
import * as fs from 'fs';
import { UserEntity } from '../database/entities/user.entity';
import { PersistentDocumentService } from '../database/persistent-document.service';
import {
  normalizeDisplayName,
  normalizeUsername,
  resolveDisplayName,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from './account-validation';
import { GM_CONFIG_PATH, GM_TOKEN_EXPIRES_IN } from '../constants/auth/gm';

/** GM 密码配置文件结构 */
interface GmConfigFile {
  passwordHash: string;
  updatedAt: string;
}

const SERVER_CONFIG_SCOPE = 'server_config';
const GM_CONFIG_DOCUMENT_KEY = 'gm_auth';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    private readonly persistentDocumentService: PersistentDocumentService,
  ) {}

  /** 用户注册：校验输入、查重、创建账号并签发令牌 */
  async register(username: string, password: string, displayName: string): Promise<AuthTokenRes> {
    const normalizedUsername = normalizeUsername(username);
    const normalizedDisplayName = normalizeDisplayName(displayName);
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

    const existing = await this.userRepo.findOne({ where: { username: normalizedUsername } });
    if (existing) {
      throw new BadRequestException('用户名已存在');
    }
    const existingDisplayName = await this.findUserByEffectiveDisplayName(normalizedDisplayName);
    if (existingDisplayName) {
      throw new BadRequestException('显示名称已存在');
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({
      username: normalizedUsername,
      displayName: normalizedDisplayName,
      passwordHash,
    });
    await this.userRepo.save(user);
    return this.issueTokens(user);
  }

  /** 用户登录：验证密码并签发令牌 */
  async login(username: string, password: string): Promise<AuthTokenRes> {
    const user = await this.userRepo.findOne({ where: { username: normalizeUsername(username) } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('密码错误');
    return this.issueTokens(user);
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
    const existing = await this.findUserByEffectiveDisplayName(normalizedDisplayName);
    if (existing) {
      return { available: false, message: '显示名称已存在' };
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

  /** 按有效显示名称查找用户（含未设置 displayName 时回退到用户名首字符的情况） */
  private findUserByEffectiveDisplayName(displayName: string): Promise<UserEntity | null> {
    return this.userRepo.createQueryBuilder('user')
      .where(new Brackets((qb) => {
        qb.where('user.displayName = :displayName', { displayName })
          .orWhere('(user.displayName IS NULL AND LEFT(user.username, 1) = :displayName)', { displayName });
      }))
      .getOne();
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
}
