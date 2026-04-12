/**
 * Redis 服务 —— 管理玩家在线状态的实时缓存
 */
import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PlayerState } from '@mud/shared';
import type { PersistedPlayerCollections } from '../game/player-storage';
import { PLAYER_KEY } from '../constants/storage/redis';

@Injectable()
/** RedisService：封装相关状态与行为。 */
export class RedisService implements OnModuleDestroy {
/** client：定义该变量以承载业务值。 */
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

/** constructor：处理当前场景中的对应操作。 */
  constructor() {
/** redisUrl：定义该变量以承载业务值。 */
    const redisUrl = process.env.REDIS_URL;
    this.client = redisUrl
      ? new Redis(redisUrl, { lazyConnect: true })
      : new Redis({
          host: process.env.REDIS_HOST || 'localhost',
          port: Number(process.env.REDIS_PORT) || 6379,
          lazyConnect: true,
        });
    this.client.connect().catch(err => {
      this.logger.error(`Redis 连接失败: ${err.message}`);
    });
  }

/** onModuleDestroy：处理当前场景中的对应操作。 */
  async onModuleDestroy() {
    await this.client.quit();
  }

  /** 缓存玩家状态到 Redis */
  async setPlayer(state: PlayerState, persisted?: PersistedPlayerCollections): Promise<void> {
    await this.client.hset(PLAYER_KEY(state.id), {
      name: state.name,
      mapId: state.mapId,
      respawnMapId: state.respawnMapId ?? '',
      x: String(state.x),
      y: String(state.y),
      facing: String(state.facing),
      viewRange: String(state.viewRange),
      hp: String(state.hp),
      maxHp: String(state.maxHp),
      qi: String(state.qi),
      dead: state.dead ? '1' : '0',
      playerKillCount: String(state.playerKillCount ?? 0),
      monsterKillCount: String(state.monsterKillCount ?? 0),
      eliteMonsterKillCount: String(state.eliteMonsterKillCount ?? 0),
      bossMonsterKillCount: String(state.bossMonsterKillCount ?? 0),
      deathCount: String(state.deathCount ?? 0),
      boneAgeBaseYears: String(state.boneAgeBaseYears ?? 0),
      lifeElapsedTicks: String(state.lifeElapsedTicks ?? 0),
/** lifespanYears：定义该变量以承载业务值。 */
      lifespanYears: state.lifespanYears == null ? '' : String(state.lifespanYears),
      baseAttrs: JSON.stringify(state.baseAttrs),
      bonuses: JSON.stringify(state.bonuses),
      temporaryBuffs: JSON.stringify(persisted?.temporaryBuffs ?? state.temporaryBuffs ?? []),
      inventory: JSON.stringify(persisted?.inventory ?? state.inventory),
      marketStorage: JSON.stringify(persisted?.marketStorage ?? state.marketStorage ?? { items: [] }),
      equipment: JSON.stringify(persisted?.equipment ?? state.equipment),
      techniques: JSON.stringify(persisted?.techniques ?? state.techniques),
      bodyTraining: JSON.stringify(persisted?.bodyTraining ?? state.bodyTraining ?? null),
      quests: JSON.stringify(persisted?.quests ?? state.quests),
      questCrossMapNavCooldownUntilLifeTicks: String(state.questCrossMapNavCooldownUntilLifeTicks ?? 0),
      actions: JSON.stringify(state.actions),
      heavenGate: JSON.stringify(state.heavenGate ?? null),
      spiritualRoots: JSON.stringify(state.spiritualRoots ?? null),
      unlockedMinimapIds: JSON.stringify(state.unlockedMinimapIds ?? []),
      alchemySkill: JSON.stringify(state.alchemySkill ?? null),
      enhancementSkill: JSON.stringify(state.enhancementSkill ?? null),
      alchemyPresets: JSON.stringify(state.alchemyPresets ?? []),
      alchemyJob: JSON.stringify(state.alchemyJob ?? null),
      autoBattle: state.autoBattle ? '1' : '0',
      autoBattleSkills: JSON.stringify(state.autoBattleSkills),
      autoUsePills: JSON.stringify(state.autoUsePills ?? []),
      combatTargetingRules: JSON.stringify(state.combatTargetingRules ?? { hostile: ['monster', 'retaliators', 'terrain'], friendly: ['non_hostile_players'] }),
      autoBattleTargetingMode: state.autoBattleTargetingMode ?? 'auto',
      combatTargetId: state.combatTargetId ?? '',
/** combatTargetLocked：定义该变量以承载业务值。 */
      combatTargetLocked: state.combatTargetLocked === true ? '1' : '0',
/** autoRetaliate：定义该变量以承载业务值。 */
      autoRetaliate: state.autoRetaliate === false ? '0' : '1',
/** autoBattleStationary：定义该变量以承载业务值。 */
      autoBattleStationary: state.autoBattleStationary === true ? '1' : '0',
/** allowAoePlayerHit：定义该变量以承载业务值。 */
      allowAoePlayerHit: state.allowAoePlayerHit === true ? '1' : '0',
/** autoIdleCultivation：定义该变量以承载业务值。 */
      autoIdleCultivation: state.autoIdleCultivation === false ? '0' : '1',
/** autoSwitchCultivation：定义该变量以承载业务值。 */
      autoSwitchCultivation: state.autoSwitchCultivation === true ? '1' : '0',
      cultivatingTechId: state.cultivatingTechId ?? '',
/** online：定义该变量以承载业务值。 */
      online: state.online === true ? '1' : '0',
/** inWorld：定义该变量以承载业务值。 */
      inWorld: state.inWorld === false ? '0' : '1',
      lastHeartbeatAt: state.lastHeartbeatAt ? String(state.lastHeartbeatAt) : '',
      offlineSinceAt: state.offlineSinceAt ? String(state.offlineSinceAt) : '',
    });
  }

  /** 删除玩家缓存 */
  async removePlayer(playerId: string): Promise<void> {
    await this.client.del(PLAYER_KEY(playerId));
  }

/** clearPlayerCache：执行对应的业务逻辑。 */
  async clearPlayerCache(): Promise<void> {
/** cursor：定义该变量以承载业务值。 */
    let cursor = '0';
    do {
      const [nextCursor, keys] = await this.client.scan(cursor, 'MATCH', PLAYER_KEY('*'), 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.client.del(...keys);
      }
    } while (cursor !== '0');
  }
}

