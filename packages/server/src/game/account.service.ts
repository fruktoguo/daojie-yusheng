/**
 * 账号管理业务逻辑：密码修改、显示名称与角色名变更
 */
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BasicOkRes } from '@mud/shared';
import { UserEntity } from '../database/entities/user.entity';
import { PlayerEntity } from '../database/entities/player.entity';
import { PlayerService } from './player.service';
import {
  normalizeDisplayName,
  resolveDisplayName,
  validateDisplayName,
  validatePassword,
  validateRoleName,
} from '../auth/account-validation';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly playerService: PlayerService,
  ) {}

  /** 验证旧密码后更新为新密码 */
  async updatePassword(userId: string, currentPassword: string, newPassword: string): Promise<BasicOkRes> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new BadRequestException('当前密码错误');
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
    return { ok: true };
  }

  /** GM 直接重设账号密码，服务端统一写入 bcrypt 哈希 */
  async updatePasswordByGm(userId: string, newPassword: string): Promise<BasicOkRes> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      throw new BadRequestException(passwordError);
    }

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    await this.userRepo.save(user);
    return { ok: true };
  }

  /** 更新用户显示名称，同步到在线玩家状态 */
  async updateDisplayName(userId: string, displayName: string): Promise<{ displayName: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const normalizedDisplayName = normalizeDisplayName(displayName);
    const displayNameError = validateDisplayName(normalizedDisplayName);
    if (displayNameError) {
      throw new BadRequestException(displayNameError);
    }

    const currentDisplayName = resolveDisplayName(user.displayName, user.username);
    if (normalizedDisplayName === currentDisplayName) {
      return { displayName: normalizedDisplayName };
    }

    const existing = await this.findUserByEffectiveDisplayName(normalizedDisplayName, userId);
    if (existing && existing.id !== userId) {
      throw new BadRequestException('显示名称已存在');
    }

    user.displayName = normalizedDisplayName;
    await this.userRepo.save(user);
    await this.playerService.updatePlayerDisplayName(userId, normalizedDisplayName);
    return { displayName: normalizedDisplayName };
  }

  /** 更新角色名，同步到在线玩家状态 */
  async updateRoleName(userId: string, roleName: string): Promise<{ roleName: string }> {
    const normalizedRoleName = roleName.normalize('NFC').trim();
    const roleNameError = validateRoleName(normalizedRoleName);
    if (roleNameError) {
      throw new BadRequestException(roleNameError);
    }

    await this.playerRepo.update({ userId }, { name: normalizedRoleName });
    await this.playerService.updatePlayerRoleName(userId, normalizedRoleName);
    return { roleName: normalizedRoleName };
  }

  /** 按生效显示名称查找用户（含 displayName 为空时回退到 username 首字的情况） */
  private findUserByEffectiveDisplayName(displayName: string, excludeUserId: string): Promise<UserEntity | null> {
    return this.userRepo.createQueryBuilder('user')
      .where(new Brackets((qb) => {
        qb.where('user.displayName = :displayName', { displayName })
          .orWhere('(user.displayName IS NULL AND LEFT(user.username, 1) = :displayName)', { displayName });
      }))
      .andWhere('user.id != :excludeUserId', { excludeUserId })
      .getOne();
  }
}
