import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, isAbsolute, resolve as resolvePath } from 'node:path';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../app.module';
import { resolveServerDatabaseUrl } from '../config/env-alias';
import { OutboxEventConsumerRegistryService } from '../persistence/outbox-event-consumer-registry.service';
import { OutboxDispatcherRuntimeService } from '../persistence/outbox-dispatcher-runtime.service';
import { OutboxDispatcherService } from '../persistence/outbox-dispatcher.service';

const DEFAULT_OUTBOX_WORKER_IDLE_MS = 1_000;

async function main(): Promise<void> {
  const databaseUrl = resolveServerDatabaseUrl();
  if (!databaseUrl.trim()) {
    console.log(
      JSON.stringify(
        {
          ok: true,
          skipped: true,
          reason: 'SERVER_DATABASE_URL/DATABASE_URL missing',
          answers: 'worker 可单独进程轮询认领 ready outbox 事件，并在 once 模式下完成单轮认领与投递',
          excludes: '不证明真实多节点 worker 竞争、下游消费者幂等或分布式共享去重存储',
          completionMapping: 'replace-ready:proof:with-db.outbox-dispatcher-worker',
        },
        null,
        2,
      ),
    );
    return;
  }

  const { once, idleMs, topicPrefixes } = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const dispatcher = app.get(OutboxDispatcherService);
  const registry = app.get(OutboxEventConsumerRegistryService);
  const runtimeService = new OutboxDispatcherRuntimeService(dispatcher, registry);
  const { consumer, mode } = await loadOutboxEventConsumer(registry);
  runtimeService.setEventConsumer(consumer);

  try {
    if (once) {
      const processedCount = await runtimeService.dispatchPendingEvents({ topicPrefixes });
      console.log(
        JSON.stringify(
          {
            ok: true,
            once: true,
            processedCount,
            dispatcherEnabled: dispatcher.isEnabled(),
            consumerMode: mode,
            consumerModule: resolveOutboxConsumerModulePath() || null,
            answers: 'worker once 模式已独立认领 ready outbox 事件；默认会从 AppModule 取 formal outbox consumer registry provider 处理内建 topic，若配置 SERVER_OUTBOX_CONSUMER_MODULE/DATABASE_OUTBOX_CONSUMER_MODULE 则会在 delivered 前执行外部真实 consumer',
            excludes: '不证明真实多节点 worker 竞争、下游消费者幂等或分布式共享去重存储',
            completionMapping: 'replace-ready:proof:with-db.outbox-dispatcher-worker',
          },
          null,
          2,
        ),
      );
      return;
    }

    let processedCountTotal = 0;
    while (dispatcher.isEnabled()) {
      processedCountTotal += await runtimeService.dispatchPendingEvents({ topicPrefixes });
      await sleep(resolveIdleMs(idleMs));
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          once: false,
          processedCountTotal,
          dispatcherEnabled: dispatcher.isEnabled(),
          consumerMode: mode,
          consumerModule: resolveOutboxConsumerModulePath() || null,
          answers: 'worker loop 模式已独立轮询认领 ready outbox 事件；默认会从 AppModule 取 formal outbox consumer registry provider 处理内建 topic，若配置 SERVER_OUTBOX_CONSUMER_MODULE/DATABASE_OUTBOX_CONSUMER_MODULE 则会在 delivered 前执行外部真实 consumer',
          excludes: '不证明真实多节点 worker 竞争、下游消费者幂等或分布式共享去重存储',
          completionMapping: 'replace-ready:proof:with-db.outbox-dispatcher-worker',
        },
        null,
        2,
      ),
    );
  } finally {
    await app.close().catch(() => undefined);
  }
}

function parseArgs(argv: string[]): { once: boolean; idleMs: number; topicPrefixes: string[] } {
  let once = false;
  let idleMs = DEFAULT_OUTBOX_WORKER_IDLE_MS;
  const topicPrefixes: string[] = [];
  for (const arg of argv) {
    if (arg === '--once') {
      once = true;
      continue;
    }
    if (arg.startsWith('--idle-ms=')) {
      const parsed = Number(arg.slice('--idle-ms='.length));
      if (Number.isFinite(parsed)) {
        idleMs = Math.max(250, Math.trunc(parsed));
      }
      continue;
    }
    if (arg.startsWith('--topic-prefix=')) {
      const prefix = arg.slice('--topic-prefix='.length).trim();
      if (prefix) {
        topicPrefixes.push(prefix);
      }
    }
  }
  return { once, idleMs, topicPrefixes };
}

function resolveIdleMs(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OUTBOX_WORKER_IDLE_MS;
  }
  return Math.max(250, Math.trunc(value));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOutboxConsumerModulePath(): string {
  return (
    process.env.SERVER_OUTBOX_CONSUMER_MODULE?.trim()
    || process.env.DATABASE_OUTBOX_CONSUMER_MODULE?.trim()
    || ''
  );
}

async function loadOutboxEventConsumer(
  registry: OutboxEventConsumerRegistryService,
): Promise<{
  consumer: ((event: Record<string, unknown>) => Promise<void> | void) | null;
  mode: 'registry' | 'module';
}> {
  const consumerModulePath = resolveOutboxConsumerModulePath();
  if (!consumerModulePath) {
    return {
      consumer: async (event: Record<string, unknown>) => {
        await registry.consume(event);
        appendDefaultRegistryConsumeLog(event);
      },
      mode: 'registry' as const,
    };
  }
  const resolvedPath = isAbsolute(consumerModulePath)
    ? consumerModulePath
    : resolvePath(process.cwd(), consumerModulePath);
  // 支持 default / named 两种导出，便于 worker 独立进程最小挂接真实 consumer。
  const loaded = require(resolvedPath) as {
    default?: unknown;
    consumeOutboxEvent?: unknown;
  };
  const consumer = typeof loaded.consumeOutboxEvent === 'function'
    ? loaded.consumeOutboxEvent
    : typeof loaded.default === 'function'
      ? loaded.default
      : null;
  if (!consumer) {
    throw new Error(`invalid_outbox_consumer_module:${resolvedPath}`);
  }
  return {
    consumer: consumer as (event: Record<string, unknown>) => Promise<void> | void,
    mode: 'module' as const,
  };
}

function resolveDefaultRegistryConsumeLogPath(): string {
  return (
    process.env.SERVER_OUTBOX_WORKER_REGISTRY_LOG?.trim()
    || process.env.DATABASE_OUTBOX_WORKER_REGISTRY_LOG?.trim()
    || ''
  );
}

function appendDefaultRegistryConsumeLog(event: Record<string, unknown>): void {
  const logPath = resolveDefaultRegistryConsumeLogPath();
  if (!logPath) {
    return;
  }
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(
    logPath,
    `${JSON.stringify({
      eventId: typeof event.event_id === 'string' ? event.event_id : null,
      operationId: typeof event.operation_id === 'string' ? event.operation_id : null,
      topic: typeof event.topic === 'string' ? event.topic : null,
      consumerMode: 'registry',
    })}\n`,
    'utf8',
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exit(1);
});
