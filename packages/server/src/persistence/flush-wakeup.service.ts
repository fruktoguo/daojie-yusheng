import { Injectable, Logger } from '@nestjs/common';

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
