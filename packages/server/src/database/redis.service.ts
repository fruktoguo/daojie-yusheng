import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { PlayerState } from '@mud/shared';

const PLAYER_KEY = (id: string) => `player:${id}`;

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly client: Redis;
  private readonly logger = new Logger(RedisService.name);

  constructor() {
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

  async onModuleDestroy() {
    await this.client.quit();
  }

  /** 缓存玩家状态到 Redis */
  async setPlayer(state: PlayerState): Promise<void> {
    await this.client.hset(PLAYER_KEY(state.id), {
      name: state.name,
      mapId: state.mapId,
      x: String(state.x),
      y: String(state.y),
      facing: String(state.facing),
      viewRange: String(state.viewRange),
      hp: String(state.hp),
      maxHp: String(state.maxHp),
      qi: String(state.qi),
      dead: state.dead ? '1' : '0',
      baseAttrs: JSON.stringify(state.baseAttrs),
      bonuses: JSON.stringify(state.bonuses),
      inventory: JSON.stringify(state.inventory),
      equipment: JSON.stringify(state.equipment),
      techniques: JSON.stringify(state.techniques),
      quests: JSON.stringify(state.quests),
      actions: JSON.stringify(state.actions),
      autoBattle: state.autoBattle ? '1' : '0',
      autoBattleSkills: JSON.stringify(state.autoBattleSkills),
      autoRetaliate: state.autoRetaliate === false ? '0' : '1',
      cultivatingTechId: state.cultivatingTechId ?? '',
    });
  }

  /** 删除玩家缓存 */
  async removePlayer(playerId: string): Promise<void> {
    await this.client.del(PLAYER_KEY(playerId));
  }
}
