/**
 * 本文件属于服务端调度器模块，负责登记、控制和持久化后台任务的运行状态。
 *
 * 维护时要区分任务定义、运行开关和实际 worker 逻辑，避免多个节点重复执行同一职责。
 */
import { Injectable } from '@nestjs/common';

import type { SchedulerBarrierSnapshot, SchedulerSnapshot, SchedulerTaskDefinition, SchedulerTaskRuntimeState } from './scheduler.types';

@Injectable()
export class SchedulerStateService {
  private readonly states = new Map<string, SchedulerTaskRuntimeState>();
  private barrier: SchedulerBarrierSnapshot | null = null;
  private initialized = false;
  private stopping = false;

  markInitialized(): void {
    this.initialized = true;
    this.stopping = false;
  }

  markStopping(): void {
    this.stopping = true;
    for (const state of this.states.values()) {
      if (!state.running) state.status = 'stopping';
    }
  }

  setBarrierSnapshot(snapshot: SchedulerBarrierSnapshot | null): void {
    this.barrier = snapshot ? { ...snapshot } : null;
  }

  restoreFromSnapshot(snapshot: SchedulerSnapshot | null): void {
    // 进程启动恢复持久化 snapshot 时不能继承 running/stopping 状态：
    // 1. 上次进程已退出，任何 running=true 都是死状态，会让 beginRun() 永久拒绝调度；
    // 2. stopping 是关闭流程内态，新进程启动时必须是 false；
    // 3. lastFailure 等历史指标保留（用于观测），但运行态字段重置为干净值。
    this.initialized = false;
    this.stopping = false;
    this.barrier = snapshot?.barrier ? { ...snapshot.barrier } : null;
    this.states.clear();
    for (const task of snapshot?.tasks ?? []) {
      const sanitized: SchedulerTaskRuntimeState = {
        ...task,
        running: false,
        status: task.enabled ? (task.paused ? 'paused' : 'idle') : 'disabled',
      };
      this.states.set(task.id, sanitized);
    }
  }

  registerTask(definition: SchedulerTaskDefinition): SchedulerTaskRuntimeState {
    const existing = this.states.get(definition.id);
    if (existing) {
      existing.kind = definition.kind;
      existing.scope = definition.scope;
      existing.priority = definition.priority;
      existing.enabled = definition.enabled;
      existing.status = resolveStatus(existing);
      return { ...existing };
    }
    const state = createState(definition);
    this.states.set(definition.id, state);
    return { ...state };
  }

  setPaused(taskId: string, paused: boolean): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state) return null;
    state.paused = paused;
    state.status = resolveStatus(state);
    return { ...state };
  }

  setEnabled(taskId: string, enabled: boolean): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state) return null;
    state.enabled = enabled;
    if (!enabled) {
      state.running = false;
      state.paused = false;
    }
    state.status = resolveStatus(state);
    return { ...state };
  }

  setBacklogCount(taskId: string, backlogCount: number): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state) return null;
    state.backlogCount = Math.max(0, Math.trunc(Number(backlogCount) || 0));
    return { ...state };
  }

  beginRun(taskId: string): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state || state.running || state.paused || !state.enabled || this.stopping) return null;
    state.running = true;
    state.status = 'running';
    state.lastHeartbeatAt = new Date().toISOString();
    return { ...state };
  }

  completeRun(taskId: string, input: { processedCount?: number; durationMs: number; nextRunAt?: number | null }): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state) return null;
    state.running = false;
    state.status = resolveStatus(state);
    state.lastHeartbeatAt = new Date().toISOString();
    state.lastSuccessAt = state.lastHeartbeatAt;
    state.lastFailure = null;
    state.lastDurationMs = Math.max(0, Math.round(input.durationMs));
    state.processedCount += Math.max(0, Math.trunc(Number(input.processedCount) || 0));
    state.runCount += 1;
    state.nextRunAt = toIsoOrNull(input.nextRunAt);
    return { ...state };
  }

  failRun(taskId: string, input: { error: unknown; durationMs: number }): SchedulerTaskRuntimeState | null {
    const state = this.states.get(taskId);
    if (!state) return null;
    state.running = false;
    state.status = resolveStatus(state);
    state.lastHeartbeatAt = new Date().toISOString();
    state.lastFailureAt = state.lastHeartbeatAt;
    state.lastFailure = input.error instanceof Error ? input.error.message : String(input.error);
    state.lastDurationMs = Math.max(0, Math.round(input.durationMs));
    state.runCount += 1;
    state.failureCount += 1;
    return { ...state };
  }

  getSnapshot(): SchedulerSnapshot {
    return {
      initialized: this.initialized,
      stopping: this.stopping,
      barrier: this.barrier ? { ...this.barrier } : null,
      tasks: Array.from(this.states.values()).map((state) => ({ ...state })),
    };
  }
}

function createState(definition: SchedulerTaskDefinition): SchedulerTaskRuntimeState {
  return {
    id: definition.id,
    kind: definition.kind,
    scope: definition.scope,
    priority: definition.priority,
    enabled: definition.enabled,
    running: false,
    paused: false,
    status: definition.enabled ? 'idle' : 'disabled',
    lastHeartbeatAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastFailure: null,
    processedCount: 0,
    nextRunAt: null,
    backlogCount: 0,
    lastDurationMs: 0,
    runCount: 0,
    failureCount: 0,
  };
}

function resolveStatus(state: SchedulerTaskRuntimeState) {
  if (!state.enabled) return 'disabled';
  if (state.running) return 'running';
  if (state.paused) return 'paused';
  return 'idle';
}

function toIsoOrNull(value: number | null | undefined): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return new Date(value).toISOString();
}
