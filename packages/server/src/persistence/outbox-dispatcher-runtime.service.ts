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
import { createHash, randomUUID } from 'node:crypto';
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
const OUTBOX_CLAIM_OWNER_MAX_LENGTH = 120;

/** Outbox 分发运行时：定时轮询 + 本地/共享去重 + 消费者分发 */
@Injectable()
export class OutboxDispatcherRuntimeService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherRuntimeService.name);
  private running = false;
  private readonly processedEventIds = new Set<string>();
  private readonly processedEventIdOrder: string[] = [];
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
          if (await this.consumeEvent(event)) {
            processedCount += 1;
          }
        } catch (error: unknown) {
          if (error instanceof OutboxDeliveryFinalizationError) {
            this.logger.error(
              `发件箱事件消费结果收敛失败，保留 claim 等待恢复 topic=${resolveEventTopic(event)} eventId=${resolveEventId(event) || '未知'}`,
              error.originalError instanceof Error ? error.originalError.stack : String(error.originalError),
            );
          } else {
            await this.handleConsumeFailure(event, error);
          }
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
  ): Promise<boolean> {
    const eventId = resolveEventId(event);
    const operationId = typeof event.operation_id === 'string' ? event.operation_id : '';
    const topic = resolveEventTopic(event);
    const claimOwner = typeof event.claimed_by === 'string' ? event.claimed_by.trim() : '';
    if (!eventId || !claimOwner) {
      this.logger.warn(`发件箱事件缺少 event_id 或 claim owner，拒绝消费 topic=${topic} eventId=${eventId || '未知'}`);
      return false;
    }
    const claimTtlMs = resolveOutboxConsumerClaimTtlMs();
    let dedupeClaim: Awaited<ReturnType<OutboxDispatcherService['claimConsumerDedupe']>>;
    try {
      dedupeClaim = await this.outboxDispatcherService.claimConsumerDedupe({
        eventId,
        operationId,
        topic,
        claimOwner,
        claimTtlMs,
      });
    } catch (error) {
      throw new OutboxDeliveryFinalizationError(error);
    }
    if (dedupeClaim.status === 'delivered') {
      try {
        const delivered = await this.outboxDispatcherService.markDelivered({ eventId, claimOwner });
        if (delivered) {
          this.markProcessedEvent(eventId, operationId);
        }
        return delivered;
      } catch (error) {
        throw new OutboxDeliveryFinalizationError(error);
      }
    }
    if (dedupeClaim.status === 'processing') {
      this.logger.debug(`发件箱事件仍由其他 consumer 处理，延后而不确认 topic=${topic} eventId=${eventId}`);
      try {
        await this.outboxDispatcherService.deferClaim({ eventId, claimOwner, retryDelayMs: 1_000 });
        return false;
      } catch (error) {
        throw new OutboxDeliveryFinalizationError(error);
      }
    }
    if (dedupeClaim.status === 'stale') {
      this.logger.debug(`发件箱 claim 已被接管，拒绝进入 consumer topic=${topic} eventId=${eventId}`);
      return false;
    }

    const consumer = onConsume ?? this.eventConsumer;
    let claimRenewed = false;
    try {
      claimRenewed = await this.outboxDispatcherService.renewConsumerClaims({
        eventId,
        claimOwner,
        claimTtlMs,
      });
    } catch (error) {
      throw new OutboxDeliveryFinalizationError(error);
    }
    if (!claimRenewed) {
      this.logger.warn(`发件箱消费开始前 claim 已丢失，拒绝进入 consumer topic=${topic} eventId=${eventId}`);
      return false;
    }

    const heartbeat = startConsumerClaimHeartbeat({
      eventId,
      claimOwner,
      claimTtlMs,
      renew: () => this.outboxDispatcherService.renewConsumerClaims({ eventId, claimOwner, claimTtlMs }),
      onFailure: (error) => {
        this.logger.warn(
          `发件箱消费 claim 续租失败，消费结束后将拒绝确认或重试 topic=${topic} eventId=${eventId}: ${formatError(error)}`,
        );
      },
    });
    try {
      if (typeof consumer === 'function') {
        await consumer(event);
      }
    } catch (error) {
      const claimCurrent = await heartbeat.stop();
      if (!claimCurrent) {
        this.logger.warn(`发件箱消费失败时 claim 已丢失，拒绝重试 topic=${topic} eventId=${eventId}`);
        return false;
      }
      throw error;
    }
    const claimCurrent = await heartbeat.stop();
    if (!claimCurrent) {
      this.logger.warn(`发件箱消费完成时 claim 已丢失，拒绝确认 topic=${topic} eventId=${eventId}`);
      return false;
    }
    this.logger.debug(`发件箱事件已投递 topic=${topic} eventId=${eventId}`);
    try {
      const dedupeCompletion = await this.outboxDispatcherService.markConsumerDedupeDelivered({
        eventId,
        claimOwner,
      });
      if (dedupeCompletion !== 'delivered') {
        this.logger.warn(
          `发件箱 consumer claim 已丢失，拒绝确认 outbox topic=${topic} eventId=${eventId} dedupeState=${dedupeCompletion}`,
        );
        return false;
      }
      const delivered = await this.outboxDispatcherService.markDelivered({ eventId, claimOwner });
      if (!delivered) {
        this.logger.debug(`发件箱 outbox claim 已被接管，消费结果由后续 claim 收敛 topic=${topic} eventId=${eventId}`);
        return false;
      }
      this.markProcessedEvent(eventId, operationId);
      return true;
    } catch (error) {
      throw new OutboxDeliveryFinalizationError(error);
    }
  }

  setEventConsumer(
    consumer: ((event: Record<string, unknown>) => Promise<void> | void) | null,
  ): void {
    // claim 续租只能阻止旧 owner 错误确认，无法撤销已经发生的下游副作用；consumer 必须按 event_id 幂等。
    this.eventConsumer = consumer;
  }

  isDuplicateEvent(eventId: string, operationId: string): boolean {
    void operationId;
    return this.processedEventIds.has(eventId);
  }

  markProcessedEvent(eventId: string, operationId: string): void {
    void operationId;
    addBoundedDedupeKey(this.processedEventIds, this.processedEventIdOrder, eventId, resolveOutboxLocalDedupeLimit());
  }

  clearProcessedEvents(): void {
    this.processedEventIds.clear();
    this.processedEventIdOrder.length = 0;
  }

  private async handleConsumeFailure(
    event: Record<string, unknown>,
    error: unknown,
  ): Promise<void> {
    const eventId = typeof event.event_id === 'string' ? event.event_id : '';
    const claimOwner = typeof event.claimed_by === 'string' ? event.claimed_by.trim() : '';
    const topic = typeof event.topic === 'string' ? event.topic : 'unknown';
    this.logger.error(
      `发件箱事件消费失败 topic=${topic} eventId=${eventId || '未知'}`,
      error instanceof Error ? error.stack : String(error),
    );
    if (!eventId || !claimOwner) {
      return;
    }
    try {
      const transitioned = await this.outboxDispatcherService.markFailed({
        eventId,
        claimOwner,
        retryDelayMs: resolveOutboxRetryDelayMs(),
        maxAttempts: resolveOutboxMaxAttempts(),
      });
      if (!transitioned) {
        this.logger.debug(`发件箱失败结果因 claim 已被接管而忽略 topic=${topic} eventId=${eventId}`);
      }
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
  const label = explicit
    ? (explicit.includes(':') ? explicit : `outbox-dispatcher:${explicit}`)
    : `outbox-dispatcher:${process.pid.toString(36)}`;
  const token = randomUUID().replace(/-/gu, '');
  const claimOwner = `${label}:${process.pid.toString(36)}:${token}`;
  if (claimOwner.length <= OUTBOX_CLAIM_OWNER_MAX_LENGTH) {
    return claimOwner;
  }
  const labelDigest = createHash('sha256').update(label).digest('hex').slice(0, 24);
  return `outbox-dispatcher:sha256:${labelDigest}:${process.pid.toString(36)}:${token}`;
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

function resolveOutboxRetryDelayMs(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_RETRY_DELAY_MS ?? process.env.DATABASE_OUTBOX_RETRY_DELAY_MS);
  return Number.isFinite(parsed) ? Math.max(250, Math.trunc(parsed)) : DEFAULT_OUTBOX_RETRY_DELAY_MS;
}

function resolveOutboxMaxAttempts(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_MAX_ATTEMPTS ?? process.env.DATABASE_OUTBOX_MAX_ATTEMPTS);
  return Number.isFinite(parsed) ? Math.max(1, Math.trunc(parsed)) : DEFAULT_OUTBOX_MAX_ATTEMPTS;
}

function resolveOutboxConsumerClaimTtlMs(): number {
  const parsed = Number(process.env.SERVER_OUTBOX_CONSUMER_CLAIM_TTL_MS);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_OUTBOX_CONSUMER_CLAIM_TTL_MS;
  }
  return Math.min(300_000, Math.max(1_000, Math.trunc(parsed)));
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

function resolveEventId(event: Record<string, unknown>): string {
  return typeof event.event_id === 'string' ? event.event_id.trim() : '';
}

function resolveEventTopic(event: Record<string, unknown>): string {
  return typeof event.topic === 'string' && event.topic.trim() ? event.topic.trim() : 'unknown';
}

class OutboxDeliveryFinalizationError extends Error {
  constructor(readonly originalError: unknown) {
    super('outbox_delivery_finalization_failed');
    this.name = 'OutboxDeliveryFinalizationError';
  }
}

function startConsumerClaimHeartbeat(input: {
  eventId: string;
  claimOwner: string;
  claimTtlMs: number;
  renew: () => Promise<boolean>;
  onFailure: (error: unknown) => void;
}): { stop: () => Promise<boolean> } {
  const intervalMs = Math.min(10_000, Math.max(250, Math.trunc(input.claimTtlMs / 3)));
  let stopped = false;
  let claimCurrent = true;
  let renewal: Promise<void> | null = null;

  const timer = setInterval(() => {
    if (stopped || renewal || !claimCurrent) {
      return;
    }
    renewal = input.renew()
      .then((renewed) => {
        if (!renewed) {
          claimCurrent = false;
          input.onFailure(new Error(`outbox_consumer_claim_lost:${input.eventId}:${input.claimOwner}`));
        }
      })
      .catch((error: unknown) => {
        claimCurrent = false;
        input.onFailure(error);
      })
      .finally(() => {
        renewal = null;
      });
  }, intervalMs);
  timer.unref();

  return {
    async stop(): Promise<boolean> {
      stopped = true;
      clearInterval(timer);
      if (renewal) {
        await renewal;
      }
      return claimCurrent;
    },
  };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
