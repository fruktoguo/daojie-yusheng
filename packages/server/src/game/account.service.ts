/**
 * 账号管理业务逻辑：密码修改、显示名称与角色名变更
 */
import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { BasicOkRes } from '@mud/shared';
import { UserEntity } from '../database/entities/user.entity';
import { PlayerEntity } from '../database/entities/player.entity';
import { PlayerService } from './player.service';
import {
  normalizeDisplayName,
  normalizeRoleName,
  normalizeUsername,
  resolveDisplayName,
  validateDisplayName,
  validatePassword,
  validateRoleName,
  validateUsername,
} from '../auth/account-validation';
import { NameUniquenessService } from '../auth/name-uniqueness.service';
import { RoleNameModerationService } from '../auth/role-name-moderation.service';

@Injectable()
export class AccountService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly playerService: PlayerService,
    private readonly nameUniquenessService: NameUniquenessService,
    private readonly roleNameModerationService: RoleNameModerationService,
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

  /** GM 直接修改账号名，必要时同步在线玩家的生效显示名 */
  async updateUsernameByGm(userId: string, username: string): Promise<{ username: string }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      throw new UnauthorizedException('用户不存在');
    }

    const normalizedUsername = normalizeUsername(username);
    const usernameError = validateUsername(normalizedUsername);
    if (usernameError) {
      throw new BadRequestException(usernameError);
    }

    if (normalizedUsername === user.username) {
      return { username: normalizedUsername };
    }

    const usernameConflict = await this.nameUniquenessService.ensureAvailable(normalizedUsername, 'account', {
      exclude: [{ userId, kind: 'account' }],
    });
    if (usernameConflict) {
      throw new BadRequestException(usernameConflict);
    }

    const previousDisplayName = resolveDisplayName(user.displayName, user.username);
    const nextDisplayName = resolveDisplayName(user.displayName, normalizedUsername);
    if (nextDisplayName !== previousDisplayName) {
      const displayNameConflict = await this.nameUniquenessService.ensureAvailable(nextDisplayName, 'display', {
        exclude: [{ userId, kind: 'display' }],
      });
      if (displayNameConflict) {
        throw new BadRequestException(displayNameConflict);
      }
    }

    user.username = normalizedUsername;
    await this.userRepo.save(user);

    if (nextDisplayName !== previousDisplayName) {
      await this.playerService.updatePlayerDisplayName(userId, nextDisplayName);
    }

    return { username: normalizedUsername };
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

    const displayNameConflict = await this.nameUniquenessService.ensureAvailable(normalizedDisplayName, 'display', {
      exclude: [{ userId, kind: 'display' }],
    });
    if (displayNameConflict) {
      throw new BadRequestException(displayNameConflict);
    }

    user.displayName = normalizedDisplayName;
    await this.userRepo.save(user);
    await this.playerService.updatePlayerDisplayName(userId, normalizedDisplayName);
    return { displayName: normalizedDisplayName };
  }

  /** 更新角色名，同步到在线玩家状态 */
  async updateRoleName(userId: string, roleName: string): Promise<{ roleName: string }> {
    const player = await this.playerRepo.findOne({
      select: ['userId', 'name'],
      where: { userId },
    });
    if (!player) {
      throw new UnauthorizedException('角色不存在');
    }

    const normalizedRoleName = normalizeRoleName(roleName);
    const roleNameError = validateRoleName(normalizedRoleName);
    if (roleNameError) {
      throw new BadRequestException(roleNameError);
    }
    const roleNameSensitiveError = this.roleNameModerationService.validateRoleName(normalizedRoleName);
    if (roleNameSensitiveError) {
      throw new BadRequestException(roleNameSensitiveError);
    }

    if (normalizedRoleName === normalizeRoleName(player.name)) {
      return { roleName: normalizedRoleName };
    }

    const roleNameConflict = await this.nameUniquenessService.ensureAvailable(normalizedRoleName, 'role', {
      exclude: [{ userId, kind: 'role' }],
    });
    if (roleNameConflict) {
      throw new BadRequestException(roleNameConflict);
    }

    await this.playerRepo.update({ userId }, { name: normalizedRoleName });
    await this.playerService.updatePlayerRoleName(userId, normalizedRoleName);
    return { roleName: normalizedRoleName };
  }
}
