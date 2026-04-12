/**
 * Bot（傀儡）管理：生成、AI 漫游、移除
 */
import { Injectable } from '@nestjs/common';
import {
  DEFAULT_BASE_ATTRS,
  DEFAULT_BONE_AGE_YEARS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  isOffsetInRange,
  PlayerState,
  VIEW_RADIUS,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';

@Injectable()
/** BotService：封装相关状态与行为。 */
export class BotService {
  private readonly botIds = new Set<string>();
  private nextBotSeq = 1;

  constructor(
    private readonly attrService: AttrService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly navigationService: NavigationService,
  ) {}

  /** 在指定玩家附近生成 Bot */
  spawnBots(anchor: PlayerState, count: number): number {
    return this.spawnBotsAt(anchor.mapId, anchor.x, anchor.y, count);
  }

  /** 在指定地图坐标附近生成指定数量的 Bot */
  spawnBotsAt(mapId: string, centerX: number, centerY: number, count: number): number {
/** targetCount：定义该变量以承载业务值。 */
    const targetCount = Math.max(0, Math.min(50, Math.floor(count)));
/** created：定义该变量以承载业务值。 */
    let created = 0;

    for (let index = 0; index < targetCount; index++) {
      const pos = this.findSpawnPosition(mapId, centerX, centerY);
      if (!pos) break;

/** botId：定义该变量以承载业务值。 */
      const botId = `bot_${Date.now()}_${this.nextBotSeq++}`;
/** bot：定义该变量以承载业务值。 */
      const bot: PlayerState = {
        id: botId,
        name: `傀儡${String(this.nextBotSeq - 1).padStart(2, '0')}`,
        isBot: true,
        mapId,
        x: pos.x,
        y: pos.y,
        facing: Direction.South,
        viewRange: VIEW_RADIUS,
        hp: 1,
        maxHp: 1,
        qi: 0,
        dead: false,
        foundation: 0,
        combatExp: 0,
        boneAgeBaseYears: DEFAULT_BONE_AGE_YEARS,
        lifeElapsedTicks: 0,
        lifespanYears: null,
        baseAttrs: { ...DEFAULT_BASE_ATTRS },
        bonuses: [],
        temporaryBuffs: [],
        inventory: { items: [], capacity: DEFAULT_INVENTORY_CAPACITY },
        equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
        techniques: [],
        actions: [],
        quests: [],
        unlockedMinimapIds: [],
        autoBattle: false,
        autoBattleSkills: [],
        autoUsePills: [],
        combatTargetingRules: { hostile: ['monster', 'retaliators', 'terrain'], friendly: ['non_hostile_players'] },
        autoBattleTargetingMode: 'auto',
        autoRetaliate: false,
        allowAoePlayerHit: false,
        autoIdleCultivation: false,
        idleTicks: 0,
      };
      this.attrService.recalcPlayer(bot);
      bot.hp = bot.maxHp;
      bot.qi = Math.round(bot.numericStats?.maxQi ?? 0);

      this.playerService.addRuntimePlayer(bot);
      this.mapService.addOccupant(bot.mapId, bot.x, bot.y, bot.id, 'player');
      this.botIds.add(bot.id);
      created += 1;
    }

    return created;
  }

  /** 每 tick 驱动 Bot AI：随机漫游寻路 */
  tickBots(mapId: string) {
/** bots：定义该变量以承载业务值。 */
    const bots = this.playerService.getPlayersByMap(mapId).filter((player) => player.isBot);
    for (const bot of bots) {
      if (bot.dead) continue;
      if (!this.navigationService.hasMoveTarget(bot.id) || Math.random() < 0.12) {
/** target：定义该变量以承载业务值。 */
        const target = this.findRoamTarget(bot);
        if (!target) continue;
        this.navigationService.setMoveTarget(bot, target.x, target.y);
      }
    }
  }

  /** 移除指定或全部 Bot */
  removeBots(playerIds?: string[]): number {
/** targets：定义该变量以承载业务值。 */
    const targets = playerIds && playerIds.length > 0
      ? playerIds.filter((id) => this.botIds.has(id))
      : [...this.botIds];

/** removed：定义该变量以承载业务值。 */
    let removed = 0;
    for (const playerId of targets) {
      const bot = this.playerService.getPlayer(playerId);
      if (!bot?.isBot) continue;
      this.navigationService.clearMoveTarget(bot.id);
      this.mapService.removeOccupant(bot.mapId, bot.x, bot.y, bot.id);
      this.playerService.removeRuntimePlayer(bot.id);
      this.botIds.delete(bot.id);
      removed += 1;
    }

    return removed;
  }

/** getBotCount：执行对应的业务逻辑。 */
  getBotCount(): number {
    return this.botIds.size;
  }

/** clearRuntimeState：执行对应的业务逻辑。 */
  clearRuntimeState(): void {
    this.botIds.clear();
  }

  /** 在中心点附近搜索可用出生位置 */
  private findSpawnPosition(mapId: string, centerX: number, centerY: number): { x: number; y: number } | null {
    for (let radius = 1; radius <= 8; radius++) {
      const candidates: Array<{ x: number; y: number }> = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const x = centerX + dx;
/** y：定义该变量以承载业务值。 */
          const y = centerY + dy;
          if (!this.mapService.isWalkable(mapId, x, y, { actorType: 'player' })) continue;
          candidates.push({ x, y });
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return null;
  }

  /** 为 Bot 随机选取一个漫游目标点 */
  private findRoamTarget(bot: PlayerState): { x: number; y: number } | null {
/** candidates：定义该变量以承载业务值。 */
    const candidates: Array<{ x: number; y: number }> = [];
    for (let attempt = 0; attempt < 16; attempt++) {
      const dx = Math.floor(Math.random() * 11) - 5;
      const dy = Math.floor(Math.random() * 11) - 5;
/** x：定义该变量以承载业务值。 */
      const x = bot.x + dx;
/** y：定义该变量以承载业务值。 */
      const y = bot.y + dy;
      if ((x === bot.x && y === bot.y) || !this.mapService.isTerrainWalkable(bot.mapId, x, y)) continue;
      candidates.push({ x, y });
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}

