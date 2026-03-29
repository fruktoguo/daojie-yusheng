import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { PlayerEntity } from '../database/entities/player.entity';
import { UserEntity } from '../database/entities/user.entity';
import { normalizeRoleName, normalizeUsername, resolveDisplayName } from './account-validation';

export type UniqueNameKind = 'account' | 'display' | 'role';

type NameConflictEntry = {
  kind: UniqueNameKind;
  userId: string;
};

type NameConflictCheckOptions = {
  exclude?: NameConflictEntry[];
};

@Injectable()
export class NameUniquenessService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
  ) {}

  async findConflict(value: string, options: NameConflictCheckOptions = {}): Promise<NameConflictEntry | null> {
    if (!value) {
      return null;
    }

    const [users, players] = await Promise.all([
      this.userRepo.createQueryBuilder('user')
        .select(['user.id', 'user.username', 'user.displayName', 'user.pendingRoleName'])
        .where('user.username = :value', { value })
        .orWhere('user.pendingRoleName = :value', { value })
        .orWhere(new Brackets((qb) => {
          qb.where('user.displayName = :value', { value })
            .orWhere('(user.displayName IS NULL AND LEFT(user.username, 1) = :value)', { value });
        }))
        .getMany(),
      this.playerRepo.find({
        select: ['userId', 'name'],
        where: { name: value },
      }),
    ]);

    const conflicts: NameConflictEntry[] = [];
    for (const user of users) {
      const username = normalizeUsername(user.username);
      if (username === value) {
        conflicts.push({ kind: 'account', userId: user.id });
      }

      const effectiveDisplayName = resolveDisplayName(user.displayName, user.username);
      if (effectiveDisplayName === value) {
        conflicts.push({ kind: 'display', userId: user.id });
      }

      const pendingRoleName = typeof user.pendingRoleName === 'string'
        ? normalizeRoleName(user.pendingRoleName)
        : '';
      if (pendingRoleName === value) {
        conflicts.push({ kind: 'role', userId: user.id });
      }
    }

    for (const player of players) {
      const roleName = normalizeRoleName(player.name);
      if (roleName === value) {
        conflicts.push({ kind: 'role', userId: player.userId });
      }
    }

    const exclude = options.exclude ?? [];
    return conflicts.find((entry) => !exclude.some((candidate) => (
      candidate.kind === entry.kind && candidate.userId === entry.userId
    ))) ?? null;
  }

  async ensureAvailable(
    value: string,
    requestedKind: UniqueNameKind,
    options: NameConflictCheckOptions = {},
  ): Promise<string | null> {
    const conflict = await this.findConflict(value, options);
    if (!conflict) {
      return null;
    }
    return this.buildConflictMessage(requestedKind, conflict.kind);
  }

  private buildConflictMessage(requestedKind: UniqueNameKind, conflictKind: UniqueNameKind): string {
    if (requestedKind === 'account') {
      if (conflictKind === 'account') {
        return '账号已存在';
      }
      if (conflictKind === 'role') {
        return '账号名已被角色名占用';
      }
      return '账号名已被显示名称占用';
    }

    if (requestedKind === 'role') {
      if (conflictKind === 'role') {
        return '角色名称已存在';
      }
      if (conflictKind === 'account') {
        return '角色名称与账号重名';
      }
      return '角色名称与显示名称冲突';
    }

    if (conflictKind === 'display') {
      return '显示名称已存在';
    }
    if (conflictKind === 'account') {
      return '显示名称与账号重名';
    }
    return '显示名称与角色名称冲突';
  }
}
