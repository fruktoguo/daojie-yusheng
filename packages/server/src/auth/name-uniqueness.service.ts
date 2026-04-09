import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { isDuplicateFriendlyDisplayName } from '@mud/shared';
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

  async findConflict(
    value: string,
    requestedKind: UniqueNameKind,
    options: NameConflictCheckOptions = {},
  ): Promise<NameConflictEntry | null> {
    if (!value) {
      return null;
    }
    if (requestedKind === 'display' && isDuplicateFriendlyDisplayName(value)) {
      return null;
    }

    const conflicts = await this.findConflictsByKind(value, requestedKind);

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
    const conflict = await this.findConflict(value, requestedKind, options);
    if (!conflict) {
      return null;
    }
    return this.buildConflictMessage(requestedKind, conflict.kind);
  }

  private async findConflictsByKind(value: string, requestedKind: UniqueNameKind): Promise<NameConflictEntry[]> {
    if (requestedKind === 'account') {
      const users = await this.userRepo.find({
        select: ['id', 'username'],
        where: { username: value },
      });
      return users
        .filter((user) => normalizeUsername(user.username) === value)
        .map((user) => ({ kind: 'account' as const, userId: user.id }));
    }

    if (requestedKind === 'role') {
      const [users, players] = await Promise.all([
        this.userRepo.find({
          select: ['id', 'pendingRoleName'],
          where: { pendingRoleName: value },
        }),
        this.playerRepo.find({
          select: ['userId', 'name'],
          where: { name: value },
        }),
      ]);

      return [
        ...users
          .filter((user) => normalizeRoleName(user.pendingRoleName ?? '') === value)
          .map((user) => ({ kind: 'role' as const, userId: user.id })),
        ...players
          .filter((player) => normalizeRoleName(player.name) === value)
          .map((player) => ({ kind: 'role' as const, userId: player.userId })),
      ];
    }

    if (isDuplicateFriendlyDisplayName(value)) {
      return [];
    }

    const users = await this.userRepo.createQueryBuilder('user')
      .select(['user.id', 'user.username', 'user.displayName'])
      .where(new Brackets((qb) => {
        qb.where('user.displayName = :value', { value })
          .orWhere('(user.displayName IS NULL AND LEFT(user.username, 1) = :value)', { value });
      }))
      .getMany();
    return users
      .filter((user) => resolveDisplayName(user.displayName, user.username) === value)
      .map((user) => ({ kind: 'display' as const, userId: user.id }));
  }

  private buildConflictMessage(requestedKind: UniqueNameKind, conflictKind: UniqueNameKind): string {
    if (requestedKind === 'account' || conflictKind === 'account') {
      return '账号已存在';
    }
    if (requestedKind === 'role' || conflictKind === 'role') {
      return '角色名称已存在';
    }
    return '显示名称已存在';
  }
}
