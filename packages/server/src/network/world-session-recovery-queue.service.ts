/**
 * 会话恢复队列服务。
 * 管理断线重连时的恢复任务并发控制、优先级排序和超时告警。
 */

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
  private readonly maxQueueLength = normalizePositiveInteger(
    readTrimmedEnv('SERVER_BOOTSTRAP_RECOVERY_QUEUE_MAX', 'BOOTSTRAP_RECOVERY_QUEUE_MAX'),
    5_000,
    64,
    20_000,
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
      this.rejectQueuedTaskByKey(key, new Error('recovery_queue_superseded'));
      if (this.queue.length >= this.maxQueueLength) {
        reject(new Error('recovery_queue_full'));
        return;
      }
      this.insertTaskSorted({
        key,
        priority: input.priority ?? 'normal',
        timeoutMs: normalizePositiveInteger(input.timeoutMs, this.defaultTimeoutMs, 1, 120_000),
        run: input.run,
        resolve,
        reject,
      } as RecoveryTask<unknown>);
      void this.drain();
    });
  }

  getSnapshot(): { concurrency: number; inFlight: number; queued: number; maxQueued: number; keys: string[] } {
    return {
      concurrency: this.concurrency,
      inFlight: this.inFlight,
      queued: this.queue.length,
      maxQueued: this.maxQueueLength,
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
    let slowWarned = false;
    const timeoutHandle = setTimeout(() => {
      slowWarned = true;
      this.logger.warn(
        `恢复队列任务超过阈值，继续等待数据库真源 key=${task.key} priority=${task.priority} thresholdMs=${task.timeoutMs}`,
      );
    }, task.timeoutMs);
    timeoutHandle.unref?.();
    try {
      const result = await task.run();
      if (slowWarned) {
        this.logger.warn(`恢复队列慢任务最终完成 key=${task.key} priority=${task.priority}`);
      }
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

  private insertTaskSorted(task: RecoveryTask<unknown>): void {
    let low = 0;
    let high = this.queue.length;
    while (low < high) {
      const mid = (low + high) >> 1;
      const existing = this.queue[mid] ?? null;
      if (!existing) {
        high = mid;
        continue;
      }
      const priorityGap = priorityWeight(task.priority) - priorityWeight(existing.priority);
      if (priorityGap > 0 || (priorityGap === 0 && task.key.localeCompare(existing.key) < 0)) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }
    this.queue.splice(low, 0, task);
  }

  private rejectQueuedTaskByKey(key: string, reason: Error): void {
    const existingIndex = this.queue.findIndex((entry) => entry.key === key);
    if (existingIndex < 0) {
      return;
    }
    const [existing] = this.queue.splice(existingIndex, 1);
    if (existing) {
      existing.reject(reason);
    }
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
  if (typeof value === 'string' && value.trim() === '') {
    return defaultValue;
  }
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
