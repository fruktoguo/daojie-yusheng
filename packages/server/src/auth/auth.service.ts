import { Injectable, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthTokenRes, GmLoginRes } from '@mud/shared';
import { UserEntity } from '../database/entities/user.entity';

const GM_TOKEN_EXPIRES_IN = 60 * 60 * 12;

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
  ) {}

  async register(username: string, password: string): Promise<AuthTokenRes> {
    const existing = await this.userRepo.findOne({ where: { username } });
    if (existing) {
      throw new BadRequestException('用户名已存在');
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = this.userRepo.create({ username, passwordHash });
    await this.userRepo.save(user);
    return this.issueTokens(user.id, user.username);
  }

  async login(username: string, password: string): Promise<AuthTokenRes> {
    const user = await this.userRepo.findOne({ where: { username } });
    if (!user) throw new UnauthorizedException('用户不存在');
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) throw new UnauthorizedException('密码错误');
    return this.issueTokens(user.id, user.username);
  }

  async refresh(refreshToken: string): Promise<AuthTokenRes> {
    try {
      const payload = this.jwtService.verify(refreshToken);
      return this.issueTokens(payload.sub, payload.username);
    } catch {
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
  }

  validateToken(token: string): { userId: string; username: string } | null {
    try {
      const payload = this.jwtService.verify(token);
      if (payload?.role === 'gm') return null;
      if (typeof payload?.sub !== 'string' || typeof payload?.username !== 'string') {
        return null;
      }
      return { userId: payload.sub, username: payload.username };
    } catch {
      return null;
    }
  }

  loginGm(password: string): GmLoginRes {
    const configuredPassword = process.env.GM_PASSWORD;
    if (!configuredPassword) {
      throw new UnauthorizedException('GM 密码未配置');
    }
    if (password !== configuredPassword) {
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

  validateGmToken(token: string): boolean {
    try {
      const payload = this.jwtService.verify(token);
      return payload?.role === 'gm';
    } catch {
      return false;
    }
  }

  private issueTokens(userId: string, username: string): AuthTokenRes {
    const payload = { sub: userId, username };
    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '30d' }),
    };
  }
}
