import { Injectable } from '@nestjs/common';
import {
  DEFAULT_BASE_ATTRS,
  DEFAULT_INVENTORY_CAPACITY,
  Direction,
  PlayerState,
  VIEW_RADIUS,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { MapService } from './map.service';
import { NavigationService } from './navigation.service';
import { PlayerService } from './player.service';

@Injectable()
export class BotService {
  private readonly botIds = new Set<string>();
  private nextBotSeq = 1;

  constructor(
    private readonly attrService: AttrService,
    private readonly playerService: PlayerService,
    private readonly mapService: MapService,
    private readonly navigationService: NavigationService,
  ) {}

  spawnBots(anchor: PlayerState, count: number): number {
    const targetCount = Math.max(0, Math.min(50, Math.floor(count)));
    let created = 0;

    for (let index = 0; index < targetCount; index++) {
      const pos = this.findSpawnPosition(anchor.mapId, anchor.x, anchor.y);
      if (!pos) break;

      const botId = `bot_${Date.now()}_${this.nextBotSeq++}`;
      const bot: PlayerState = {
        id: botId,
        name: `傀儡${String(this.nextBotSeq - 1).padStart(2, '0')}`,
        isBot: true,
        mapId: anchor.mapId,
        x: pos.x,
        y: pos.y,
        facing: Direction.South,
        viewRange: VIEW_RADIUS,
        hp: 1,
        maxHp: 1,
        qi: 0,
        dead: false,
        baseAttrs: { ...DEFAULT_BASE_ATTRS },
        bonuses: [],
        temporaryBuffs: [],
        inventory: { items: [], capacity: DEFAULT_INVENTORY_CAPACITY },
        equipment: { weapon: null, head: null, body: null, legs: null, accessory: null },
        techniques: [],
        actions: [],
        quests: [],
        autoBattle: false,
        autoBattleSkills: [],
        autoRetaliate: false,
      };
      this.attrService.recalcPlayer(bot);
      bot.hp = bot.maxHp;
      bot.qi = Math.round(bot.numericStats?.maxQi ?? 0);

      this.playerService.addRuntimePlayer(bot);
      this.mapService.setOccupied(bot.mapId, bot.x, bot.y, bot.id);
      this.botIds.add(bot.id);
      created += 1;
    }

    return created;
  }

  tickBots(mapId: string) {
    const bots = this.playerService.getPlayersByMap(mapId).filter((player) => player.isBot);
    for (const bot of bots) {
      if (bot.dead) continue;
      if (!this.navigationService.hasMoveTarget(bot.id) || Math.random() < 0.12) {
        const target = this.findRoamTarget(bot);
        if (!target) continue;
        this.navigationService.setMoveTarget(bot, target.x, target.y);
      }
    }
  }

  removeBots(playerIds?: string[]): number {
    const targets = playerIds && playerIds.length > 0
      ? playerIds.filter((id) => this.botIds.has(id))
      : [...this.botIds];

    let removed = 0;
    for (const playerId of targets) {
      const bot = this.playerService.getPlayer(playerId);
      if (!bot?.isBot) continue;
      this.navigationService.clearMoveTarget(bot.id);
      this.mapService.setOccupied(bot.mapId, bot.x, bot.y, null);
      this.playerService.removeRuntimePlayer(bot.id);
      this.botIds.delete(bot.id);
      removed += 1;
    }

    return removed;
  }

  getBotCount(): number {
    return this.botIds.size;
  }

  private findSpawnPosition(mapId: string, centerX: number, centerY: number): { x: number; y: number } | null {
    for (let radius = 1; radius <= 8; radius++) {
      const candidates: Array<{ x: number; y: number }> = [];
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
          const x = centerX + dx;
          const y = centerY + dy;
          if (!this.mapService.isWalkable(mapId, x, y)) continue;
          candidates.push({ x, y });
        }
      }
      if (candidates.length > 0) {
        return candidates[Math.floor(Math.random() * candidates.length)];
      }
    }
    return null;
  }

  private findRoamTarget(bot: PlayerState): { x: number; y: number } | null {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let attempt = 0; attempt < 16; attempt++) {
      const dx = Math.floor(Math.random() * 11) - 5;
      const dy = Math.floor(Math.random() * 11) - 5;
      const x = bot.x + dx;
      const y = bot.y + dy;
      if ((x === bot.x && y === bot.y) || !this.mapService.isTerrainWalkable(bot.mapId, x, y)) continue;
      candidates.push({ x, y });
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
