import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Attributes,
  LeaderboardBodyTrainingEntry,
  LeaderboardDeathEntry,
  LeaderboardMonsterKillEntry,
  LeaderboardPlayerKillEntry,
  LeaderboardRealmEntry,
  LeaderboardSpiritStoneEntry,
  LeaderboardSupremeAttrEntry,
  PlayerState,
  S2C_Leaderboard,
} from '@mud/shared';
import { Repository } from 'typeorm';
import { PlayerEntity } from '../database/entities/player.entity';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';
import { AttrService } from './attr.service';
import { PlayerService } from './player.service';

const DEFAULT_LEADERBOARD_LIMIT = 10;
const MAX_LEADERBOARD_LIMIT = 10;
const LEADERBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** SupremeAttrKey：定义该类型的结构与数据语义。 */
type SupremeAttrKey = 'constitution' | 'spirit' | 'perception' | 'talent';

/** LeaderboardSnapshot：定义该接口的能力与字段约束。 */
interface LeaderboardSnapshot {
  playerId: string;
  playerName: string;
  realmLv: number;
  realmName: string;
  realmShortName?: string;
  realmProgress: number;
  foundation: number;
  monsterKillCount: number;
  eliteMonsterKillCount: number;
  bossMonsterKillCount: number;
  spiritStoneCount: number;
  playerKillCount: number;
  deathCount: number;
  bodyTrainingLevel: number;
  bodyTrainingExp: number;
  bodyTrainingExpToNext: number;
  finalAttrs: Pick<Attributes, SupremeAttrKey>;
}

const SUPREME_ATTR_LABELS: Record<SupremeAttrKey, string> = {
  constitution: '体魄',
  spirit: '神识',
  perception: '身法',
  talent: '根骨',
};

/** clampLeaderboardLimit：执行对应的业务逻辑。 */
function clampLeaderboardLimit(limit?: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LEADERBOARD_LIMIT;
  }
  return Math.max(1, Math.min(MAX_LEADERBOARD_LIMIT, Math.floor(Number(limit))));
}

/** compareName：执行对应的业务逻辑。 */
function compareName(left: LeaderboardSnapshot, right: LeaderboardSnapshot): number {
  return left.playerName.localeCompare(right.playerName, 'zh-Hans-CN');
}

@Injectable()
/** LeaderboardService：封装相关状态与行为。 */
export class LeaderboardService {
  private cachedLeaderboard: S2C_Leaderboard | null = null;

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    private readonly playerService: PlayerService,
    private readonly attrService: AttrService,
  ) {}

  async buildLeaderboard(limit?: number): Promise<S2C_Leaderboard> {
    const effectiveLimit = clampLeaderboardLimit(limit);
    const cached = this.cachedLeaderboard;
    if (cached && Date.now() - cached.generatedAt < LEADERBOARD_REFRESH_INTERVAL_MS) {
      return this.sliceLeaderboard(cached, effectiveLimit);
    }

    const snapshots = await this.collectSnapshots();
    const fullPayload: S2C_Leaderboard = {
      generatedAt: Date.now(),
      limit: MAX_LEADERBOARD_LIMIT,
      boards: {
        realm: this.buildRealmBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        monsterKills: this.buildMonsterKillBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        spiritStones: this.buildSpiritStoneBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        playerKills: this.buildPlayerKillBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        deaths: this.buildDeathBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        bodyTraining: this.buildBodyTrainingBoard(snapshots, MAX_LEADERBOARD_LIMIT),
        supremeAttrs: this.buildSupremeAttrBoard(snapshots),
      },
    };
    this.cachedLeaderboard = fullPayload;

    return this.sliceLeaderboard(fullPayload, effectiveLimit);
  }

  private sliceLeaderboard(source: S2C_Leaderboard, limit: number): S2C_Leaderboard {
    if (limit >= source.limit) {
      return source;
    }
    return {
      generatedAt: source.generatedAt,
      limit,
      boards: {
        realm: source.boards.realm.slice(0, limit),
        monsterKills: source.boards.monsterKills.slice(0, limit),
        spiritStones: source.boards.spiritStones.slice(0, limit),
        playerKills: source.boards.playerKills.slice(0, limit),
        deaths: source.boards.deaths.slice(0, limit),
        bodyTraining: source.boards.bodyTraining.slice(0, limit),
        supremeAttrs: source.boards.supremeAttrs,
      },
    };
  }

  private async collectSnapshots(): Promise<LeaderboardSnapshot[]> {
    const livePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot);
    const livePlayerMap = new Map(livePlayers.map((player) => [player.id, player] as const));
    const entities = await this.playerRepo.find();
    const snapshots = livePlayers.map((player) => this.createSnapshot(player));

    for (const entity of entities) {
      if (livePlayerMap.has(entity.id)) {
        continue;
      }
      snapshots.push(this.createSnapshot(this.playerService.hydrateStoredPlayerForRead(entity)));
    }

    return snapshots;
  }

  private createSnapshot(player: PlayerState): LeaderboardSnapshot {
    const finalAttrs = this.attrService.getPlayerFinalAttrs(player);
    return {
      playerId: player.id,
      playerName: player.name,
      realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? player.realmLv ?? 1)),
      realmName: player.realm?.displayName ?? player.realmName ?? '凡俗武者',
      realmShortName: player.realm?.shortName ?? undefined,
      realmProgress: Math.max(0, Math.floor(player.realm?.progress ?? 0)),
      foundation: Math.max(0, Math.floor(player.foundation ?? 0)),
      monsterKillCount: Math.max(0, Math.floor(player.monsterKillCount ?? 0)),
      eliteMonsterKillCount: Math.max(0, Math.floor(player.eliteMonsterKillCount ?? 0)),
      bossMonsterKillCount: Math.max(0, Math.floor(player.bossMonsterKillCount ?? 0)),
      spiritStoneCount: this.getInventoryItemCount(player, MARKET_CURRENCY_ITEM_ID),
      playerKillCount: Math.max(0, Math.floor(player.playerKillCount ?? 0)),
      deathCount: Math.max(0, Math.floor(player.deathCount ?? 0)),
      bodyTrainingLevel: Math.max(0, Math.floor(player.bodyTraining?.level ?? 0)),
      bodyTrainingExp: Math.max(0, Math.floor(player.bodyTraining?.exp ?? 0)),
      bodyTrainingExpToNext: Math.max(0, Math.floor(player.bodyTraining?.expToNext ?? 0)),
      finalAttrs: {
        constitution: Math.max(0, Math.floor(finalAttrs.constitution ?? 0)),
        spirit: Math.max(0, Math.floor(finalAttrs.spirit ?? 0)),
        perception: Math.max(0, Math.floor(finalAttrs.perception ?? 0)),
        talent: Math.max(0, Math.floor(finalAttrs.talent ?? 0)),
      },
    };
  }

  private buildRealmBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardRealmEntry[] {
    return [...snapshots]
      .sort((left, right) => (
        right.realmLv - left.realmLv
        || right.realmProgress - left.realmProgress
        || right.bodyTrainingLevel - left.bodyTrainingLevel
        || right.foundation - left.foundation
        || right.bodyTrainingExp - left.bodyTrainingExp
        || compareName(left, right)
      ))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        realmLv: entry.realmLv,
        realmName: entry.realmName,
        realmShortName: entry.realmShortName,
        progress: entry.realmProgress,
        foundation: entry.foundation,
      }));
  }

  private buildMonsterKillBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardMonsterKillEntry[] {
    return [...snapshots]
      .sort((left, right) => (
        right.monsterKillCount - left.monsterKillCount
        || right.bossMonsterKillCount - left.bossMonsterKillCount
        || right.eliteMonsterKillCount - left.eliteMonsterKillCount
        || compareName(left, right)
      ))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        totalKills: entry.monsterKillCount,
        eliteKills: entry.eliteMonsterKillCount,
        bossKills: entry.bossMonsterKillCount,
      }));
  }

  private buildSpiritStoneBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardSpiritStoneEntry[] {
    return [...snapshots]
      .sort((left, right) => right.spiritStoneCount - left.spiritStoneCount || compareName(left, right))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        spiritStoneCount: entry.spiritStoneCount,
      }));
  }

  private buildPlayerKillBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardPlayerKillEntry[] {
    return [...snapshots]
      .sort((left, right) => right.playerKillCount - left.playerKillCount || compareName(left, right))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        playerKillCount: entry.playerKillCount,
      }));
  }

  private buildDeathBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardDeathEntry[] {
    return [...snapshots]
      .sort((left, right) => right.deathCount - left.deathCount || compareName(left, right))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        deathCount: entry.deathCount,
      }));
  }

  private buildBodyTrainingBoard(snapshots: LeaderboardSnapshot[], limit: number): LeaderboardBodyTrainingEntry[] {
    return [...snapshots]
      .sort((left, right) => (
        right.bodyTrainingLevel - left.bodyTrainingLevel
        || right.bodyTrainingExp - left.bodyTrainingExp
        || compareName(left, right)
      ))
      .slice(0, limit)
      .map((entry, index) => ({
        rank: index + 1,
        playerId: entry.playerId,
        playerName: entry.playerName,
        level: entry.bodyTrainingLevel,
        exp: entry.bodyTrainingExp,
        expToNext: entry.bodyTrainingExpToNext,
      }));
  }

  private buildSupremeAttrBoard(snapshots: LeaderboardSnapshot[]): LeaderboardSupremeAttrEntry[] {
    return (Object.keys(SUPREME_ATTR_LABELS) as SupremeAttrKey[])
      .map((attr) => {
        const top = [...snapshots].sort((left, right) => (
          right.finalAttrs[attr] - left.finalAttrs[attr]
          || right.realmLv - left.realmLv
          || compareName(left, right)
        ))[0];
        return {
          attr,
          label: SUPREME_ATTR_LABELS[attr],
          playerId: top?.playerId ?? '',
          playerName: top?.playerName ?? '暂无',
          value: top?.finalAttrs[attr] ?? 0,
        };
      });
  }

  private getInventoryItemCount(player: PlayerState, itemId: string): number {
    return player.inventory.items.reduce((total, item) => (
      item.itemId === itemId ? total + Math.max(0, Math.floor(item.count)) : total
    ), 0);
  }
}

