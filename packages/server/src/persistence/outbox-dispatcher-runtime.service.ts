/**
 * 本文件属于持久化边界，负责数据库真源、flush、兼容转换或失败策略等可靠性逻辑。
 *
 * 维护时要优先考虑幂等、崩溃恢复和自动清理，避免在 tick 内直接引入阻塞 IO。
 */
/**
 * Outbox 事件分发运行时服务。
 * 定时轮询 outbox_event 表，认领待处理事件并通过消费者注册表分发，
 * 支持本地去重、共享去重和失败重试。
 */
import { Inject, Injectable, Logger, Optional, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';

import { shouldStartOutboxDispatcher } from '../config/runtime-role';
import { OutboxDispatcherService } from './outbox-dispatcher.service';
import { OutboxEventConsumerRegistryService } from './outbox-event-consumer-registry.service';
import { SchedulerManagerService } from '../scheduler/scheduler-manager.service';

const DEFAULT_OUTBOX_DISPATCH_INTERVAL_MS = 250;
const DEFAULT_OUTBOX_DISPATCH_BATCH_SIZE = 128;
const DEFAULT_OUTBOX_CONSUMER_CLAIM_TTL_MS = 30_000;
const DEFAULT_OUTBOX_RETRY_DELAY_MS = 5_000;
const DEFAULT_OUTBOX_MAX_ATTEMPTS = 8;
const DEFAULT_OUTBOX_LOCAL_DEDUPE_LIMIT = 10_000;

/** Outbox 分发运行时：定时轮询 + 本地/共享去重 + 消费者分发 */
@Injectable()
export class OutboxDispatcherRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherRuntimeService.name);
  private running = false;
  private readonly processedEventIds = new Set<string>();
  private readonly processedOperationIds = new Set<string>();
  private readonly processedEventIdOrder: string[] = [];
  private readonly processedOperationIdOrder: string[] = [];
  private eventConsumer: ((event: Record<string, unknown>) => Promise<void> | void) | null = null;

  constructor(
    private readonly outboxDispatcherService: OutboxDispatcherService,
    @Inject(OutboxEventConsumerRegistryService)
    private readonly outboxEventConsumerRegistryService: OutboxEventConsumerRegistryService | null = null,
    @Optional() @Inject(SchedulerManagerService)
    private readonly schedulerManagerService?: SchedulerManagerService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.eventConsumer && this.outboxEventConsumerRegistryService) {
      this.eventConsumer = (event) => this.outboxEventConsumerRegistryService!.consume(event);
    }
    this.schedulerManagerService?.registerTask({
      id: 'outbox-dispatcher',
      kind: 'outbox',
      scope: 'global',
      enabled: this.isRuntimeEnabled(),
      priority: 'high',
      intervalMs: resolveOutboxDispatchIntervalMs(),
      maxConcurrency: 1,
      leaderMode: 'claim',
      description: 'Outbox dispatcher runtime adapter',
    });
    if (!this.isRuntimeEnabled()) {
      this.logger.log('发件箱调度运行时已跳过：当前配置或 role 不承载发件箱任务');
      return;
    }
    this.logger.log('发件箱调度运行时已交由调度管理器调度');
  }

  async onModuleDestroy(): Promise<void> {
    // no-op: 调度已转交 SchedulerManager，outbox runtime 仅保留执行器逻辑。
  }

  isRuntimeEnabled(): boolean {
    return this.outboxDispatcherService.isEnabled() && isOutboxRuntimeEnabled() && shouldStartOutboxDispatcher();
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
        '发件箱调度运行时轮询失败',
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
      this.logger.debug(`发件箱事件已去重跳过 topic=${topic} eventId=${eventId}`);
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
      this.logger.debug(`发件箱事件已被共享去重跳过 topic=${topic} eventId=${eventId}`);
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
      this.logger.debug(`发件箱事件已投递 topic=${topic} eventId=${eventId}`);
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
    addBoundedDedupeKey(this.processedEventIds, this.processedEventIdOrder, eventId, resolveOutboxLocalDedupeLimit());
    addBoundedDedupeKey(this.processedOperationIds, this.processedOperationIdOrder, operationId, resolveOutboxLocalDedupeLimit());
  }

  clearProcessedEvents(): void {
    this.processedEventIds.clear();
    this.processedOperationIds.clear();
    this.processedEventIdOrder.length = 0;
    this.processedOperationIdOrder.length = 0;
  }

  private async handleConsumeFailure(
    event: Record<string, unknown>,
    error: unknown,
  ): Promise<void> {
    const eventId = typeof event.event_id === 'string' ? event.event_id : '';
    const topic = typeof event.topic === 'string' ? event.topic : 'unknown';
    this.logger.error(
      `发件箱事件消费失败 topic=${topic} eventId=${eventId || '未知'}`,
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
        `发件箱事件标记失败异常 topic=${topic} eventId=${eventId}`,
        markFailedError instanceof Error ? markFailedError.stack : String(markFailedError),
      );
    }
  }
}

function resolveDispatcherId(): string {
  const explicit = process.env.SERVER_OUTBOX_DISPATCHER_ID?.trim();
  if (explicit) {
    return explicit.includes(':') ? explicit : `outbox-dispatcher:${explicit}`;
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

function resolveOutboxLocalDedupeLimit(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_LOCAL_DEDUPE_LIMIT ?? process.env.DATABASE_OUTBOX_LOCAL_DEDUPE_LIMIT);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OUTBOX_LOCAL_DEDUPE_LIMIT;
  }
  return Math.min(200_000, Math.max(1_000, Math.trunc(parsed)));
}

function addBoundedDedupeKey(target: Set<string>, order: string[], value: string, limit: number): void {
  const normalized = typeof value === 'string' ? value.trim() : '';
  if (!normalized || target.has(normalized)) {
    return;
  }
  target.add(normalized);
  order.push(normalized);
  while (order.length > limit) {
    const oldest = order.shift();
    if (oldest) {
      target.delete(oldest);
    }
  }
}

function isOutboxRuntimeEnabled(): boolean {
  const explicit = process.env.SERVER_OUTBOX_RUNTIME_ENABLED ?? process.env.DATABASE_OUTBOX_RUNTIME_ENABLED;
  // 未配置时默认开启；只有显式设为 0/false/no/off 才禁用
  if (typeof explicit !== 'string') {
    return true;
  }
  return !/^(0|false|no|off)$/iu.test(explicit.trim());
}
