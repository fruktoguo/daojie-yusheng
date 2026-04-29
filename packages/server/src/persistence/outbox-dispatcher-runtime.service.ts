import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxEventConsumerRegistryService } from './outbox-event-consumer-registry.service';

const DEFAULT_OUTBOX_DISPATCH_INTERVAL_MS = 1_000;
const DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE = 32;
const DEFAULT_OUTBOX_CONSUMER_CLAIM_TTL_MS = 30_000;
const DEFAULT_OUTBOX_RETRY_DELAY_MS = 5_000;
const DEFAULT_OUTBOX_MAX_ATTEMPTS = 8;

@Injectable()
export class OutboxDispatcherRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherRuntimeService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private readonly processedEventIds = new Set<string>();
  private readonly processedOperationIds = new Set<string>();
  private eventConsumer: ((event: Record<string, unknown>) => Promise<void> | void) | null = null;

  constructor(
    private readonly outboxDispatcherService: OutboxDispatcherService,
    private readonly outboxEventConsumerRegistryService: OutboxEventConsumerRegistryService | null = null,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.eventConsumer && this.outboxEventConsumerRegistryService) {
      this.eventConsumer = (event) => this.outboxEventConsumerRegistryService!.consume(event);
    }
    if (!this.outboxDispatcherService.isEnabled()) {
      this.logger.log('outbox dispatcher runtime 已跳过：dispatcher 未启用');
      return;
    }
    if (!isOutboxRuntimeEnabled()) {
      this.logger.log('outbox dispatcher runtime 已跳过：未开启 SERVER_OUTBOX_RUNTIME_ENABLED/DATABASE_OUTBOX_RUNTIME_ENABLED');
      return;
    }

    const intervalMs = resolveOutboxDispatchIntervalMs();
    this.timer = setInterval(() => {
      void this.dispatchPendingEvents();
    }, intervalMs);
    this.timer.unref();
    this.logger.log(`outbox dispatcher runtime 已启动，轮询间隔 ${intervalMs}ms`);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async dispatchPendingEvents(input?: {
    topicPrefixes?: string[];
  }): Promise<number> {
    if (this.running || !this.outboxDispatcherService.isEnabled()) {
      return 0;
    }

    this.running = true;
    let processedCount = 0;
    try {
      const events = await this.outboxDispatcherService.claimReadyEvents({
        dispatcherId: resolveDispatcherId(),
        limit: resolveOutboxDispatchBatchSize(),
        topicPrefixes: input?.topicPrefixes,
      });
      for (const event of events) {
        try {
          await this.consumeEvent(event);
          processedCount += 1;
        } catch (error: unknown) {
          await this.handleConsumeFailure(event, error);
        }
      }
    } catch (error: unknown) {
      this.logger.error(
        'outbox dispatcher runtime 轮询失败',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
    return processedCount;
  }

  async consumeEvent(
    event: Record<string, unknown>,
    onConsume?: (event: Record<string, unknown>) => Promise<void> | void,
  ): Promise<void> {
    const eventId = typeof event.event_id === 'string' ? event.event_id : '';
    const operationId = typeof event.operation_id === 'string' ? event.operation_id : '';
    const topic = typeof event.topic === 'string' ? event.topic : 'unknown';
    if (!eventId) {
      return;
    }
    if (this.isDuplicateEvent(eventId, operationId)) {
      this.logger.debug(`outbox event skipped by dedupe topic=${topic} eventId=${eventId}`);
      await this.outboxDispatcherService.markDelivered(eventId);
      return;
    }
    const consumerId = resolveConsumerId();
    const claimed = await this.outboxDispatcherService.claimConsumerDedupe({
      eventId,
      operationId,
      topic,
      consumerId,
      claimTtlMs: DEFAULT_OUTBOX_CONSUMER_CLAIM_TTL_MS,
    });
    if (!claimed) {
      this.logger.debug(`outbox event skipped by shared dedupe topic=${topic} eventId=${eventId}`);
      this.markProcessedEvent(eventId, operationId);
      await this.outboxDispatcherService.markDelivered(eventId);
      return;
    }

    // 当前阶段只做最小可验证 wiring：认领 -> 处理 -> 标记 delivered。
    const consumer = onConsume ?? this.eventConsumer;
    try {
      if (typeof consumer === 'function') {
        await consumer(event);
      }
      this.logger.debug(`outbox event delivered topic=${topic} eventId=${eventId}`);
      this.markProcessedEvent(eventId, operationId);
      await this.outboxDispatcherService.markConsumerDedupeDelivered({
        eventId,
        operationId,
      });
      await this.outboxDispatcherService.markDelivered(eventId);
    } catch (error) {
      await this.outboxDispatcherService.releaseConsumerDedupe({
        eventId,
        operationId,
        consumerId,
      }).catch(() => undefined);
      throw error;
    }
  }

  setEventConsumer(
    consumer: ((event: Record<string, unknown>) => Promise<void> | void) | null,
  ): void {
    this.eventConsumer = consumer;
  }

  isDuplicateEvent(eventId: string, operationId: string): boolean {
    return this.processedEventIds.has(eventId) || (operationId ? this.processedOperationIds.has(operationId) : false);
  }

  markProcessedEvent(eventId: string, operationId: string): void {
    if (eventId) {
      this.processedEventIds.add(eventId);
    }
    if (operationId) {
      this.processedOperationIds.add(operationId);
    }
  }

  clearProcessedEvents(): void {
    this.processedEventIds.clear();
    this.processedOperationIds.clear();
  }

  private async handleConsumeFailure(
    event: Record<string, unknown>,
    error: unknown,
  ): Promise<void> {
    const eventId = typeof event.event_id === 'string' ? event.event_id : '';
    const topic = typeof event.topic === 'string' ? event.topic : 'unknown';
    this.logger.error(
      `outbox event consume failed topic=${topic} eventId=${eventId || 'unknown'}`,
      error instanceof Error ? error.stack : String(error),
    );
    if (!eventId) {
      return;
    }
    try {
      await this.outboxDispatcherService.markFailed(
        eventId,
        resolveOutboxRetryDelayMs(),
        resolveOutboxMaxAttempts(),
      );
    } catch (markFailedError: unknown) {
      this.logger.error(
        `outbox event markFailed failed topic=${topic} eventId=${eventId}`,
        markFailedError instanceof Error ? markFailedError.stack : String(markFailedError),
      );
    }
  }
}

function resolveDispatcherId(): string {
  const explicit = process.env.SERVER_OUTBOX_DISPATCHER_ID?.trim();
  if (explicit) {
    return explicit;
  }
  return `outbox-dispatcher:${process.pid.toString(36)}`;
}

function resolveOutboxDispatchIntervalMs(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_DISPATCH_INTERVAL_MS);
  return Number.isFinite(parsed) ? Math.max(250, Math.trunc(parsed)) : DEFAULT_OUTBOX_DISPATCH_INTERVAL_MS;
}

function resolveOutboxDispatchBatchSize(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_DISPATCH_BATCH_SIZE);
  return Number.isFinite(parsed)
    ? Math.max(1, Math.trunc(parsed))
    : DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE;
}

function resolveConsumerId(): string {
  const explicit = process.env.SERVER_OUTBOX_CONSUMER_ID?.trim();
  if (explicit) {
    return explicit;
  }
  return `outbox-consumer:${process.pid.toString(36)}`;
}

function resolveOutboxRetryDelayMs(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_RETRY_DELAY_MS ?? process.env.DATABASE_OUTBOX_RETRY_DELAY_MS);
  return Number.isFinite(parsed) ? Math.max(250, Math.trunc(parsed)) : DEFAULT_OUTBOX_RETRY_DELAY_MS;
}

function resolveOutboxMaxAttempts(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_MAX_ATTEMPTS ?? process.env.DATABASE_OUTBOX_MAX_ATTEMPTS);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : DEFAULT_OUTBOX_MAX_ATTEMPTS;
}

function isOutboxRuntimeEnabled(): boolean {
  const explicit = process.env.SERVER_OUTBOX_RUNTIME_ENABLED ?? process.env.DATABASE_OUTBOX_RUNTIME_ENABLED;
  if (typeof explicit !== 'string') {
    return false;
  }
  return /^(1|true|yes|on)$/iu.test(explicit.trim());
}
