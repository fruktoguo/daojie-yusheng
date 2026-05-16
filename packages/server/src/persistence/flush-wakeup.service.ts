/**
 * 刷盘唤醒信号服务。
 * 收集玩家和实例的 flush 唤醒提示，供调度器按需触发落库。
 */
import { Injectable, Logger } from '@nestjs/common';

const DEFAULT_FLUSH_WAKEUP_KEY_LIMIT = 20000;

/** 刷盘唤醒信号收集器：记录需要落库的玩家/实例 ID */
@Injectable()
export class FlushWakeupService {
  private readonly logger = new Logger(FlushWakeupService.name);
  private readonly wakeupKeys = new Set<string>();
  private readonly maxWakeupKeys = resolveWakeupKeyLimit();

  signalPlayerFlush(playerId: string): void {
    const key = buildWakeupKey('player', playerId);
    if (!key) {
      return;
    }
    this.rememberWakeupKey(key);
    this.logger.debug(`flush wakeup hint: ${key}`);
  }

  signalInstanceFlush(instanceId: string): void {
    const key = buildWakeupKey('instance', instanceId);
    if (!key) {
      return;
    }
    this.rememberWakeupKey(key);
    this.logger.debug(`flush wakeup hint: ${key}`);
  }

  listWakeupKeys(): string[] {
    return Array.from(this.wakeupKeys.values()).sort();
  }

  clearWakeupKeys(): void {
    this.wakeupKeys.clear();
  }

  private rememberWakeupKey(key: string): void {
    if (this.wakeupKeys.has(key)) {
      this.wakeupKeys.delete(key);
    }
    this.wakeupKeys.add(key);
    while (this.wakeupKeys.size > this.maxWakeupKeys) {
      const oldest = this.wakeupKeys.values().next().value as string | undefined;
      if (oldest === undefined) {
        break;
      }
      this.wakeupKeys.delete(oldest);
    }
  }
}

function buildWakeupKey(scope: 'player' | 'instance', id: string): string {
  const normalized = typeof id === 'string' ? id.trim() : '';
  if (!normalized) {
    return '';
  }
  return `flush:wakeup:${scope}:${normalized}`;
}

function resolveWakeupKeyLimit(): number {
  const raw = process.env.SERVER_FLUSH_WAKEUP_KEY_LIMIT ?? process.env.FLUSH_WAKEUP_KEY_LIMIT;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    return DEFAULT_FLUSH_WAKEUP_KEY_LIMIT;
  }
  return Math.max(128, Math.min(100000, Math.trunc(value)));
}
