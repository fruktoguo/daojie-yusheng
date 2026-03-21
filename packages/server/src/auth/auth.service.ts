import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthTokenRes, DisplayNameAvailabilityRes, GmLoginRes } from '@mud/shared';
import * as fs from 'fs';
import { UserEntity } from '../database/entities/user.entity';
import { resolveServerDataPath } from '../common/data-path';
import {
  normalizeDisplayName,
  normalizeUsername,
  resolveDisplayName,
  validateDisplayName,
  validatePassword,
  validateUsername,
} from './account-validation';

const GM_TOKEN_EXPIRES_IN = 60 * 60 * 12;
const GM_CONFIG_PATH = resolveServerDataPath('gm-config.json');

interface GmConfigFile {
  passwordHash: string;
  updatedAt: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

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

  async login(username: string, password: string): Promise<AuthTokenRes> {
    const user = await this.userRepo.findOne({ where: { username: normalizeUsername(username) } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('密码错误');
    return this.issueTokens(user);
  }

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
    this.writeGmConfig({
      passwordHash: nextHash,
      updatedAt: new Date().toISOString(),
    });
  }

  validateGmToken(token: string): boolean {
    try {
      const payload = this.jwtService.verify(token);
      return payload?.role === 'gm';
    } catch {
      return false;
    }
  }

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

  private findUserByEffectiveDisplayName(displayName: string): Promise<UserEntity | null> {
    return this.userRepo.createQueryBuilder('user')
      .where(new Brackets((qb) => {
        qb.where('user.displayName = :displayName', { displayName })
          .orWhere('(user.displayName IS NULL AND LEFT(user.username, 1) = :displayName)', { displayName });
      }))
      .getOne();
  }

  private async getOrCreateGmPasswordHash(): Promise<string> {
    const existing = this.readGmConfig();
    if (existing?.passwordHash) {
      return existing.passwordHash;
    }

    const initialPassword = process.env.GM_PASSWORD?.trim() || 'admin123';
    const passwordHash = await bcrypt.hash(initialPassword, 10);
    this.writeGmConfig({
      passwordHash,
      updatedAt: new Date().toISOString(),
    });
    return passwordHash;
  }

  private readGmConfig(): GmConfigFile | null {
    try {
      if (!fs.existsSync(GM_CONFIG_PATH)) {
        return null;
      }
      const raw = JSON.parse(fs.readFileSync(GM_CONFIG_PATH, 'utf-8')) as Partial<GmConfigFile>;
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

  private writeGmConfig(config: GmConfigFile): void {
    fs.mkdirSync(resolveServerDataPath(), { recursive: true });
    fs.writeFileSync(GM_CONFIG_PATH, `${JSON.stringify(config, null, 2)}\n`, 'utf-8');
  }
}
