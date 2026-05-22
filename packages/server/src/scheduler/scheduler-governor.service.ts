/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import os from 'node:os';

import { FlushDiagnosticsService } from '../persistence/flush-diagnostics.service';
import type { SchedulerGovernorDecision, SchedulerGovernorSnapshot, SchedulerTaskDefinition } from './scheduler.types';

@Injectable()
export class SchedulerGovernorService {
  constructor(
    @Optional() @Inject(FlushDiagnosticsService)
    private readonly flushDiagnosticsService?: FlushDiagnosticsService,
  ) {}

  getSnapshot(): SchedulerGovernorSnapshot {
    const availableParallelism = resolveAvailableParallelism();
    const flushSnapshot = this.flushDiagnosticsService?.getSnapshot() ?? null;
    const flushPoolWaiting = toCount(flushSnapshot?.pgPools?.flush?.waitingCount);
    const lockWaitCount = toCount(flushSnapshot?.pgLockWait?.waitingCount);
    const backlogCount = toCount(flushSnapshot?.player?.dirtyPlayerCount) + toCount(flushSnapshot?.map?.dirtyInstanceCount);
    return {
      availableParallelism,
      cpuReserve: Math.max(1, availableParallelism - 2),
      flushPoolWaiting,
      lockWaitCount,
      backlogCount,
      backlogPressureLevel: resolvePressureLevel(flushPoolWaiting, lockWaitCount, backlogCount),
    };
  }

  evaluate(definition: SchedulerTaskDefinition): SchedulerGovernorDecision {
    const snapshot = this.getSnapshot();
    const allow = shouldAllowTask(definition, snapshot);
    return {
      allow,
      reason: allow ? null : resolveDeferReason(definition, snapshot),
      snapshot,
    };
  }
}

function shouldAllowTask(definition: SchedulerTaskDefinition, snapshot: SchedulerGovernorSnapshot): boolean {
  if (definition.priority === 'high') {
    return snapshot.lockWaitCount === 0 || definition.kind === 'tick' || definition.kind === 'flush';
  }
  if (definition.kind === 'maintenance' && snapshot.flushPoolWaiting > 0) {
    return false;
  }
  if (snapshot.backlogPressureLevel === 'critical') {
    return definition.kind === 'flush' || definition.kind === 'tick';
  }
  if (snapshot.backlogPressureLevel === 'high' && definition.priority === 'low') {
    return false;
  }
  if (snapshot.lockWaitCount > 0) {
    return false;
  }
  if (snapshot.flushPoolWaiting > 0 && definition.priority === 'low') {
    return false;
  }
  if (snapshot.availableParallelism <= 2 && definition.priority === 'low') {
    return false;
  }
  return true;
}

function resolveDeferReason(definition: SchedulerTaskDefinition, snapshot: SchedulerGovernorSnapshot): string {
  if (snapshot.lockWaitCount > 0) {
    return 'pg_lock_wait_backpressure';
  }
  if (snapshot.flushPoolWaiting > 0 && definition.priority === 'low') {
    return 'flush_pool_waiting_backpressure';
  }
  if (snapshot.backlogPressureLevel === 'critical') {
    return 'backlog_pressure_critical';
  }
  if (snapshot.backlogPressureLevel === 'high' && definition.priority === 'low') {
    return 'backlog_pressure_high';
  }
  if (snapshot.availableParallelism <= 2 && definition.priority === 'low') {
    return 'cpu_budget_exhausted';
  }
  return 'scheduler_governor_backpressure';
}

function resolvePressureLevel(flushPoolWaiting: number, lockWaitCount: number, backlogCount: number): SchedulerGovernorSnapshot['backlogPressureLevel'] {
  const pressure = flushPoolWaiting * 50 + lockWaitCount * 200 + backlogCount;
  if (pressure >= 1_000) return 'critical';
  if (pressure >= 200) return 'high';
  if (pressure >= 50) return 'medium';
  return 'low';
}

function resolveAvailableParallelism(): number {
  try {
    const available = typeof os.availableParallelism === 'function' ? os.availableParallelism() : os.cpus().length;
    return Math.max(1, Math.trunc(Number(available) || 1));
  } catch {
    return 1;
  }
}

function toCount(value: unknown): number {
  return Math.max(0, Math.trunc(Number(value) || 0));
}
