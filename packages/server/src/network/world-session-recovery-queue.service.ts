import { Injectable, Logger } from '@nestjs/common';

import { readTrimmedEnv } from '../config/env-alias';

type WorldSessionRecoveryPriority = 'vip' | 'recent' | 'normal';

interface RecoveryTask<T> {
  key: string;
  priority: WorldSessionRecoveryPriority;
  timeoutMs: number;
  run: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}

@Injectable()
export class WorldSessionRecoveryQueueService {
  private readonly logger = new Logger(WorldSessionRecoveryQueueService.name);
  private readonly queue: RecoveryTask<unknown>[] = [];
  private inFlight = 0;
  private readonly concurrency = normalizePositiveInteger(
    readTrimmedEnv('SERVER_BOOTSTRAP_RECOVERY_CONCURRENCY', 'BOOTSTRAP_RECOVERY_CONCURRENCY'),
    32,
    1,
    64,
  );
  private readonly defaultTimeoutMs = normalizePositiveInteger(
    readTrimmedEnv('SERVER_BOOTSTRAP_RECOVERY_TIMEOUT_MS', 'BOOTSTRAP_RECOVERY_TIMEOUT_MS'),
    15_000,
    1_000,
    120_000,
  );

  enqueue<T>(input: {
    key: string;
    priority?: WorldSessionRecoveryPriority;
    timeoutMs?: number;
    run: () => Promise<T>;
  }): Promise<T> {
    const key = normalizeKey(input.key);
    if (!key) {
      return Promise.reject(new Error('recovery_queue_key_required'));
    }
    return new Promise<T>((resolve, reject) => {
      this.queue.push({
        key,
        priority: input.priority ?? 'normal',
        timeoutMs: normalizePositiveInteger(String(input.timeoutMs ?? ''), this.defaultTimeoutMs, 1, 120_000),
        run: input.run,
        resolve,
        reject,
      });
      this.sortQueue();
      void this.drain();
    });
  }

  getSnapshot(): { concurrency: number; inFlight: number; queued: number; keys: string[] } {
    return {
      concurrency: this.concurrency,
      inFlight: this.inFlight,
      queued: this.queue.length,
      keys: this.queue.map((entry) => entry.key),
    };
  }

  private async drain(): Promise<void> {
    while (this.inFlight < this.concurrency && this.queue.length > 0) {
      const task = this.queue.shift();
      if (!task) {
        return;
      }
      this.inFlight += 1;
      void this.executeTask(task).finally(() => {
        this.inFlight = Math.max(0, this.inFlight - 1);
        void this.drain();
      });
    }
  }

  private async executeTask(task: RecoveryTask<unknown>): Promise<void> {
    const timeoutHandle = setTimeout(() => undefined, task.timeoutMs);
    timeoutHandle.unref?.();
    try {
      const result = await Promise.race([
        task.run(),
        new Promise<never>((_, reject) => {
          const timer = setTimeout(() => reject(new Error(`recovery_timeout:${task.key}`)), task.timeoutMs);
          timer.unref?.();
        }),
      ]);
      task.resolve(result);
    } catch (error: unknown) {
      this.logger.warn(
        `恢复队列任务失败 key=${task.key} priority=${task.priority}: ${error instanceof Error ? error.stack || error.message : String(error)}`,
      );
      task.reject(error);
    } finally {
      clearTimeout(timeoutHandle);
    }
  }

  private sortQueue(): void {
    this.queue.sort((left, right) => {
      const priorityGap = priorityWeight(right.priority) - priorityWeight(left.priority);
      if (priorityGap !== 0) {
        return priorityGap;
      }
      return left.key.localeCompare(right.key);
    });
  }
}

function priorityWeight(priority: WorldSessionRecoveryPriority): number {
  if (priority === 'vip') {
    return 3;
  }
  if (priority === 'recent') {
    return 2;
  }
  return 1;
}

function normalizeKey(value: string): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePositiveInteger(value: string | number | null | undefined, defaultValue: number, min: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return defaultValue;
  }
  const normalized = Math.trunc(parsed);
  if (normalized < min) {
    return min;
  }
  if (normalized > max) {
    return max;
  }
  return normalized;
}
