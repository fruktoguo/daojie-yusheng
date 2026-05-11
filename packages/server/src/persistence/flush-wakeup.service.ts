/**
 * 刷盘唤醒信号服务。
 * 收集玩家和实例的 flush 唤醒提示，供调度器按需触发落库。
 */
import { Injectable, Logger } from '@nestjs/common';

/** 刷盘唤醒信号收集器：记录需要落库的玩家/实例 ID */
@Injectable()
export class FlushWakeupService {
  private readonly logger = new Logger(FlushWakeupService.name);
  private readonly wakeupKeys = new Set<string>();

  signalPlayerFlush(playerId: string): void {
    const key = buildWakeupKey('player', playerId);
    if (!key) {
      return;
    }
    this.wakeupKeys.add(key);
    this.logger.debug(`flush wakeup hint: ${key}`);
  }

  signalInstanceFlush(instanceId: string): void {
    const key = buildWakeupKey('instance', instanceId);
    if (!key) {
      return;
    }
    this.wakeupKeys.add(key);
    this.logger.debug(`flush wakeup hint: ${key}`);
  }

  listWakeupKeys(): string[] {
    return Array.from(this.wakeupKeys.values()).sort();
  }

  clearWakeupKeys(): void {
    this.wakeupKeys.clear();
  }
}

function buildWakeupKey(scope: 'player' | 'instance', id: string): string {
  const normalized = typeof id === 'string' ? id.trim() : '';
  if (!normalized) {
    return '';
  }
  return `flush:wakeup:${scope}:${normalized}`;
}
