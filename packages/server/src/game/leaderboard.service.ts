import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  Attributes,
  LeaderboardBodyTrainingEntry,
  LeaderboardDeathEntry,
  LeaderboardMonsterKillEntry,
  LeaderboardPlayerKillEntry,
  LeaderboardPlayerLocationEntry,
  LeaderboardRealmEntry,
  LeaderboardSpiritStoneEntry,
  LeaderboardSupremeAttrEntry,
  LeaderboardWorldSummary,
  PlayerState,
  S2C_Leaderboard,
  S2C_LeaderboardPlayerLocations,
  S2C_WorldSummary,
  calculateMarketTradeTotalCost,
} from '@mud/shared';
import { In, Repository } from 'typeorm';
import { MarketOrderEntity } from '../database/entities/market-order.entity';
import { PlayerEntity } from '../database/entities/player.entity';
import { MARKET_CURRENCY_ITEM_ID } from '../constants/gameplay/market';
import { AlchemyService } from './alchemy.service';
import { AttrService } from './attr.service';
import { EnhancementService } from './enhancement.service';
import { MapService } from './map.service';
import { PlayerService } from './player.service';
import { TechniqueService } from './technique.service';

/** DEFAULT_LEADERBOARD_LIMIT：定义该变量以承载业务值。 */
const DEFAULT_LEADERBOARD_LIMIT = 10;
/** MAX_LEADERBOARD_LIMIT：定义该变量以承载业务值。 */
const MAX_LEADERBOARD_LIMIT = 10;
/** LEADERBOARD_REFRESH_INTERVAL_MS：定义该变量以承载业务值。 */
const LEADERBOARD_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** SupremeAttrKey：定义该类型的结构与数据语义。 */
type SupremeAttrKey = 'constitution' | 'spirit' | 'perception' | 'talent';

/** LeaderboardSnapshot：定义该接口的能力与字段约束。 */
interface LeaderboardSnapshot {
/** playerId：定义该变量以承载业务值。 */
  playerId: string;
/** playerName：定义该变量以承载业务值。 */
  playerName: string;
/** realmLv：定义该变量以承载业务值。 */
  realmLv: number;
/** realmName：定义该变量以承载业务值。 */
  realmName: string;
  realmShortName?: string;
/** realmProgress：定义该变量以承载业务值。 */
  realmProgress: number;
/** foundation：定义该变量以承载业务值。 */
  foundation: number;
/** monsterKillCount：定义该变量以承载业务值。 */
  monsterKillCount: number;
/** eliteMonsterKillCount：定义该变量以承载业务值。 */
  eliteMonsterKillCount: number;
/** bossMonsterKillCount：定义该变量以承载业务值。 */
  bossMonsterKillCount: number;
/** spiritStoneCount：定义该变量以承载业务值。 */
  spiritStoneCount: number;
/** marketStorageSpiritStoneCount：定义该变量以承载业务值。 */
  marketStorageSpiritStoneCount: number;
/** playerKillCount：定义该变量以承载业务值。 */
  playerKillCount: number;
/** deathCount：定义该变量以承载业务值。 */
  deathCount: number;
/** bodyTrainingLevel：定义该变量以承载业务值。 */
  bodyTrainingLevel: number;
/** bodyTrainingExp：定义该变量以承载业务值。 */
  bodyTrainingExp: number;
/** bodyTrainingExpToNext：定义该变量以承载业务值。 */
  bodyTrainingExpToNext: number;
/** finalAttrs：定义该变量以承载业务值。 */
  finalAttrs: Pick<Attributes, SupremeAttrKey>;
}

/** SUPREME_ATTR_LABELS：定义该变量以承载业务值。 */
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
/** cachedLeaderboard：定义该变量以承载业务值。 */
  private cachedLeaderboard: S2C_Leaderboard | null = null;
  private cachedWorldSummary: S2C_WorldSummary | null = null;

  constructor(
    @InjectRepository(PlayerEntity)
    private readonly playerRepo: Repository<PlayerEntity>,
    @InjectRepository(MarketOrderEntity)
    private readonly marketOrderRepo: Repository<MarketOrderEntity>,
    private readonly playerService: PlayerService,
    private readonly attrService: AttrService,
    private readonly techniqueService: TechniqueService,
    private readonly alchemyService: AlchemyService,
    private readonly enhancementService: EnhancementService,
    private readonly mapService: MapService,
  ) {}

/** buildLeaderboard：执行对应的业务逻辑。 */
  async buildLeaderboard(limit?: number): Promise<S2C_Leaderboard> {
/** effectiveLimit：定义该变量以承载业务值。 */
    const effectiveLimit = clampLeaderboardLimit(limit);
/** cached：定义该变量以承载业务值。 */
    const cached = this.cachedLeaderboard;
    if (cached && Date.now() - cached.generatedAt < LEADERBOARD_REFRESH_INTERVAL_MS) {
      return this.sliceLeaderboard(cached, effectiveLimit);
    }

/** snapshots：定义该变量以承载业务值。 */
    const snapshots = await this.collectSnapshots();
/** fullPayload：定义该变量以承载业务值。 */
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

/** sliceLeaderboard：执行对应的业务逻辑。 */
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

/** buildWorldSummary：执行对应的业务逻辑。 */
  async buildWorldSummary(): Promise<S2C_WorldSummary> {
/** cached：定义该变量以承载业务值。 */
    const cached = this.cachedWorldSummary;
    if (cached && Date.now() - cached.generatedAt < LEADERBOARD_REFRESH_INTERVAL_MS) {
      return cached;
    }

/** snapshots：定义该变量以承载业务值。 */
    const snapshots = await this.collectSnapshots();
/** reservedSpiritStoneTotal：定义该变量以承载业务值。 */
    const reservedSpiritStoneTotal = await this.collectReservedSpiritStoneTotal();
/** payload：定义该变量以承载业务值。 */
    const payload: S2C_WorldSummary = {
      generatedAt: Date.now(),
      summary: this.buildWorldBoard(snapshots, reservedSpiritStoneTotal),
    };
    this.cachedWorldSummary = payload;
    return payload;
  }

  async buildPlayerLocations(playerIds: string[]): Promise<S2C_LeaderboardPlayerLocations> {
/** normalizedIds：定义该变量以承载业务值。 */
    const normalizedIds = [...new Set(
      (playerIds ?? [])
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0),
    )].slice(0, MAX_LEADERBOARD_LIMIT);
    if (normalizedIds.length <= 0) {
      return {
        generatedAt: Date.now(),
        entries: [],
      };
    }

/** livePlayersById：定义该变量以承载业务值。 */
    const livePlayersById = new Map(
      this.playerService.getAllPlayers()
        .filter((player) => player.isBot !== true)
        .map((player) => [player.id, player] as const),
    );
/** entries：定义该变量以承载业务值。 */
    const entries: LeaderboardPlayerLocationEntry[] = [];
/** missingIds：定义该变量以承载业务值。 */
    const missingIds: string[] = [];

    for (const playerId of normalizedIds) {
      const livePlayer = livePlayersById.get(playerId);
      if (livePlayer) {
        entries.push(this.createPlayerLocationEntry(livePlayer));
      } else {
        missingIds.push(playerId);
      }
    }

    if (missingIds.length > 0) {
/** entities：定义该变量以承载业务值。 */
      const entities = await this.playerRepo.find({
        where: { id: In(missingIds) },
      });
/** entityById：定义该变量以承载业务值。 */
      const entityById = new Map(entities.map((entity) => [entity.id, entity] as const));
      for (const playerId of missingIds) {
        const entity = entityById.get(playerId);
        if (!entity) {
          continue;
        }
        entries.push(this.createPlayerLocationEntry(this.playerService.hydrateStoredPlayerForRead(entity)));
      }
    }

    return {
      generatedAt: Date.now(),
      entries,
    };
  }

/** collectSnapshots：执行对应的业务逻辑。 */
  private async collectSnapshots(): Promise<LeaderboardSnapshot[]> {
/** livePlayers：定义该变量以承载业务值。 */
    const livePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot);
/** livePlayerMap：定义该变量以承载业务值。 */
    const livePlayerMap = new Map(livePlayers.map((player) => [player.id, player] as const));
/** entities：定义该变量以承载业务值。 */
    const entities = await this.playerRepo.find();
/** snapshots：定义该变量以承载业务值。 */
    const snapshots = livePlayers.map((player) => this.createSnapshot(player));

    for (const entity of entities) {
      if (livePlayerMap.has(entity.id)) {
        continue;
      }
      snapshots.push(this.createSnapshot(this.playerService.hydrateStoredPlayerForRead(entity)));
    }

    return snapshots;
  }

/** createSnapshot：执行对应的业务逻辑。 */
  private createSnapshot(player: PlayerState): LeaderboardSnapshot {
/** finalAttrs：定义该变量以承载业务值。 */
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
      marketStorageSpiritStoneCount: this.getMarketStorageItemCount(player, MARKET_CURRENCY_ITEM_ID),
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

  private createPlayerLocationEntry(player: PlayerState): LeaderboardPlayerLocationEntry {
/** mapMeta：定义该变量以承载业务值。 */
    const mapMeta = this.mapService.getMapMeta(player.mapId);
    return {
      playerId: player.id,
      mapId: player.mapId,
      mapName: mapMeta?.name ?? player.mapId,
      x: Math.max(0, Math.floor(player.x ?? 0)),
      y: Math.max(0, Math.floor(player.y ?? 0)),
      online: player.online === true,
    };
  }

/** buildRealmBoard：执行对应的业务逻辑。 */
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

/** buildMonsterKillBoard：执行对应的业务逻辑。 */
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

/** buildSpiritStoneBoard：执行对应的业务逻辑。 */
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

/** buildPlayerKillBoard：执行对应的业务逻辑。 */
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

/** buildDeathBoard：执行对应的业务逻辑。 */
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

/** buildBodyTrainingBoard：执行对应的业务逻辑。 */
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

/** buildSupremeAttrBoard：执行对应的业务逻辑。 */
  private buildSupremeAttrBoard(snapshots: LeaderboardSnapshot[]): LeaderboardSupremeAttrEntry[] {
    return (Object.keys(SUPREME_ATTR_LABELS) as SupremeAttrKey[])
      .map((attr) => {
/** top：定义该变量以承载业务值。 */
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

/** buildWorldBoard：执行对应的业务逻辑。 */
  private buildWorldBoard(
    snapshots: LeaderboardSnapshot[],
    reservedSpiritStoneTotal: number,
  ): LeaderboardWorldSummary {
/** livePlayers：定义该变量以承载业务值。 */
    const livePlayers = this.playerService.getAllPlayers().filter((player) => !player.isBot && player.inWorld !== false && !player.dead);
/** totalSpiritStones：定义该变量以承载业务值。 */
    const totalSpiritStones = snapshots.reduce((total, snapshot) => (
      total + snapshot.spiritStoneCount + snapshot.marketStorageSpiritStoneCount
    ), 0) + reservedSpiritStoneTotal;
/** eliteMonsterKills：定义该变量以承载业务值。 */
    const eliteMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.eliteMonsterKillCount, 0);
/** bossMonsterKills：定义该变量以承载业务值。 */
    const bossMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.bossMonsterKillCount, 0);
/** totalMonsterKills：定义该变量以承载业务值。 */
    const totalMonsterKills = snapshots.reduce((total, snapshot) => total + snapshot.monsterKillCount, 0);

    return {
      totalSpiritStones,
      actionCounts: {
        cultivation: livePlayers.filter((player) => this.techniqueService.hasCultivationBuff(player)).length,
        combat: livePlayers.filter((player) => (
          player.autoBattle === true
          || Boolean(player.pendingSkillCast)
          || typeof player.combatTargetId === 'string'
        )).length,
        alchemy: livePlayers.filter((player) => this.alchemyService.hasActiveAlchemyJob(player)).length,
        enhancement: livePlayers.filter((player) => this.enhancementService.hasActiveEnhancementJob(player)).length,
      },
      realmCounts: {
        initial: snapshots.filter((snapshot) => snapshot.realmLv <= 1).length,
        mortal: snapshots.filter((snapshot) => snapshot.realmLv >= 2 && snapshot.realmLv <= 18).length,
        qiRefiningOrAbove: snapshots.filter((snapshot) => snapshot.realmLv >= 19).length,
      },
      killCounts: {
        normalMonsters: Math.max(0, totalMonsterKills - eliteMonsterKills - bossMonsterKills),
        eliteMonsters: eliteMonsterKills,
        bossMonsters: bossMonsterKills,
        playerKills: snapshots.reduce((total, snapshot) => total + snapshot.playerKillCount, 0),
        playerDeaths: snapshots.reduce((total, snapshot) => total + snapshot.deathCount, 0),
      },
    };
  }

/** collectReservedSpiritStoneTotal：执行对应的业务逻辑。 */
  private async collectReservedSpiritStoneTotal(): Promise<number> {
/** orders：定义该变量以承载业务值。 */
    const orders = await this.marketOrderRepo.find({
      where: {
        status: 'open',
        side: 'buy',
      },
    });

    return orders.reduce((total, order) => (
      total + (calculateMarketTradeTotalCost(order.remainingQuantity, order.unitPrice) ?? 0)
    ), 0);
  }

/** getInventoryItemCount：执行对应的业务逻辑。 */
  private getInventoryItemCount(player: PlayerState, itemId: string): number {
    return player.inventory.items.reduce((total, item) => (
      item.itemId === itemId ? total + Math.max(0, Math.floor(item.count)) : total
    ), 0);
  }

/** getMarketStorageItemCount：执行对应的业务逻辑。 */
  private getMarketStorageItemCount(player: PlayerState, itemId: string): number {
    return (player.marketStorage?.items ?? []).reduce((total, item) => (
      item.itemId === itemId ? total + Math.max(0, Math.floor(item.count)) : total
    ), 0);
  }
}
