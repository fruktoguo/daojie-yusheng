/**
 * Outbox 事件消费者注册表。
 * 管理精确匹配和前缀匹配两类 topic 消费者，支持内置 topic 的日志确认。
 */
import { Injectable, Logger } from '@nestjs/common';

/** Outbox 事件记录类型 */
type OutboxEventRecord = Record<string, unknown>;
/** Outbox 事件消费者回调 */
type OutboxEventConsumer = (event: OutboxEventRecord) => Promise<void> | void;

/** Outbox 事件消费者注册表服务：按 topic 精确/前缀匹配分发事件 */
@Injectable()
export class OutboxEventConsumerRegistryService {
  private readonly logger = new Logger(OutboxEventConsumerRegistryService.name);
  private readonly exactConsumers = new Map<string, OutboxEventConsumer>();
  private readonly prefixConsumers: Array<{ prefix: string; consumer: OutboxEventConsumer }> = [];

  constructor() {
    this.registerBuiltInTopics();
  }

  /** 注册精确 topic 消费者 */
  registerExact(topic: string, consumer: OutboxEventConsumer): void {
    const normalizedTopic = normalizeTopic(topic);
    if (!normalizedTopic || typeof consumer !== 'function') {
      return;
    }
    this.exactConsumers.set(normalizedTopic, consumer);
  }

  /** 注册前缀匹配消费者，按前缀长度降序排列保证最长匹配优先 */
  registerPrefix(prefix: string, consumer: OutboxEventConsumer): void {
    const normalizedPrefix = normalizeTopic(prefix);
    if (!normalizedPrefix || typeof consumer !== 'function') {
      return;
    }
    this.prefixConsumers.push({ prefix: normalizedPrefix, consumer });
    this.prefixConsumers.sort((left, right) => right.prefix.length - left.prefix.length);
  }

  /** 按 topic 查找并执行对应消费者，未命中时静默跳过 */
  async consume(event: OutboxEventRecord): Promise<void> {
    const topic = typeof event.topic === 'string' ? event.topic.trim() : '';
    const consumer = this.resolveConsumer(topic);
    if (!consumer) {
      this.logger.debug(`outbox topic 未命中 consumer，按 no-op 处理：${topic || 'unknown'}`);
      return;
    }
    await consumer(event);
  }

  hasConsumer(topic: string): boolean {
    return this.resolveConsumer(topic) !== null;
  }

  listExactTopics(): string[] {
    return Array.from(this.exactConsumers.keys()).sort();
  }

  private resolveConsumer(topic: string): OutboxEventConsumer | null {
    const normalizedTopic = normalizeTopic(topic);
    if (!normalizedTopic) {
      return null;
    }
    const exact = this.exactConsumers.get(normalizedTopic);
    if (exact) {
      return exact;
    }
    const matchedPrefix = this.prefixConsumers.find((entry) => normalizedTopic.startsWith(entry.prefix));
    return matchedPrefix?.consumer ?? null;
  }

  private registerBuiltInTopics(): void {
    const logOnly = (event: OutboxEventRecord) => {
      const topic = typeof event.topic === 'string' ? event.topic : 'unknown';
      const eventId = typeof event.event_id === 'string' ? event.event_id : 'unknown';
      this.logger.debug(`outbox 内置消费者确认 topic=${topic} eventId=${eventId}`);
    };

    this.registerExact('player.mail.claimed', logOnly);
    this.registerExact('player.market.storage.claimed', logOnly);
    this.registerExact('player.npc_shop.item_purchased', logOnly);
    this.registerExact('player.wallet.updated', logOnly);
    this.registerExact('player.equipment.updated', logOnly);
    this.registerExact('player.market.sell_now', logOnly);
    this.registerExact('player.market.sell_now.trade_delivered', logOnly);
    this.registerExact('player.market.buy_now', logOnly);
    this.registerExact('player.active_job.updated', logOnly);
    this.registerExact('player.active_job.started', logOnly);
    this.registerExact('player.active_job.cancelled', logOnly);
    this.registerExact('player.active_job.completed', logOnly);
    this.registerExact('player.inventory.granted', logOnly);
    this.registerExact('player.quest.submitted', logOnly);
    this.registerExact('combat.audit.recorded', logOnly);
  }
}

function normalizeTopic(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}
