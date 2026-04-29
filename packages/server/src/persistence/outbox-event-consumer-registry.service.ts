import { Injectable, Logger } from '@nestjs/common';

type OutboxEventRecord = Record<string, unknown>;
type OutboxEventConsumer = (event: OutboxEventRecord) => Promise<void> | void;

@Injectable()
export class OutboxEventConsumerRegistryService {
  private readonly logger = new Logger(OutboxEventConsumerRegistryService.name);
  private readonly exactConsumers = new Map<string, OutboxEventConsumer>();
  private readonly prefixConsumers: Array<{ prefix: string; consumer: OutboxEventConsumer }> = [];

  constructor() {
    this.registerBuiltInTopics();
  }

  registerExact(topic: string, consumer: OutboxEventConsumer): void {
    const normalizedTopic = normalizeTopic(topic);
    if (!normalizedTopic || typeof consumer !== 'function') {
      return;
    }
    this.exactConsumers.set(normalizedTopic, consumer);
  }

  registerPrefix(prefix: string, consumer: OutboxEventConsumer): void {
    const normalizedPrefix = normalizeTopic(prefix);
    if (!normalizedPrefix || typeof consumer !== 'function') {
      return;
    }
    this.prefixConsumers.push({ prefix: normalizedPrefix, consumer });
    this.prefixConsumers.sort((left, right) => right.prefix.length - left.prefix.length);
  }

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
      this.logger.debug(`outbox built-in consumer ack topic=${topic} eventId=${eventId}`);
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
  }
}

function normalizeTopic(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}
