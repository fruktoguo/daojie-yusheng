/**
 * 本文件参与服务端启动、就绪或关闭生命周期管理，负责协调依赖状态和对外可用性。
 *
 * 维护时要保证 readiness 与 shutdown 语义清晰，避免服务还未恢复完成就提前接流量。
 */
import { Injectable } from '@nestjs/common';

export type ShutdownPhase =
  | 'drain_requested'
  | 'traffic_closed'
  | 'sessions_draining'
  | 'runtime_frozen'
  | 'workers_stopping'
  | 'final_flushing'
  | 'leases_releasing'
  | 'node_deregistering'
  | 'drain_completed'
  | 'drain_failed'
  | 'force_exit';

export interface ShutdownPhaseSnapshot {
  phase: ShutdownPhase;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metrics: Record<string, unknown>;
}

export interface ShutdownResultSnapshot {
  shutdownRunId: string;
  reason: string;
  signal: string | null;
  phase: ShutdownPhase;
  completed: boolean;
  forced: boolean;
  blocking: boolean;
  startedAt: string;
  updatedAt: string;
  durationMs: number | null;
  phases: ShutdownPhaseSnapshot[];
  players: {
    detached: number;
    flushFailed: string[];
    presenceFailed: string[];
  };
  instances: {
    flushed: number;
    flushFailed: string[];
    leaseReleased: number;
    leaseReleaseSkipped: string[];
    leaseReleaseFailed: string[];
  };
  node: {
    deregistered: boolean;
    deregisterFailed: string | null;
  };
}

const SHUTDOWN_PHASES: ShutdownPhase[] = [
  'drain_requested',
  'traffic_closed',
  'sessions_draining',
  'runtime_frozen',
  'workers_stopping',
  'final_flushing',
  'leases_releasing',
  'node_deregistering',
  'drain_completed',
  'drain_failed',
  'force_exit',
];

@Injectable()
export class ShutdownStatusService {
  private readonly shutdownRunId = `shutdown:${process.pid}:${Date.now()}`;
  private readonly startedAt = new Date();
  private updatedAt = this.startedAt;
  private currentPhase: ShutdownPhase = 'drain_requested';
  private completed = false;
  private forced = false;
  private blocking = false;
  private reason = 'drain_requested';
  private signal: string | null = null;
  private readonly phases = new Map<ShutdownPhase, ShutdownPhaseSnapshot>();
  private readonly players = { detached: 0, flushFailed: [] as string[], presenceFailed: [] as string[] };
  private readonly instances = { flushed: 0, flushFailed: [] as string[], leaseReleased: 0, leaseReleaseSkipped: [] as string[], leaseReleaseFailed: [] as string[] };
  private readonly node = { deregistered: false, deregisterFailed: null as string | null };

  constructor() {
    for (const phase of SHUTDOWN_PHASES) {
      this.phases.set(phase, this.createPhaseSnapshot(phase));
    }
  }

  begin(reason: string, signal: string | null = null): void {
    const now = new Date();
    this.updatedAt = now;
    this.currentPhase = 'drain_requested';
    this.completed = false;
    this.forced = false;
    this.blocking = true;
    this.reason = reason || 'drain_requested';
    this.signal = signal;
    this.resetSummary();
    const snapshot = this.getMutablePhase('drain_requested');
    snapshot.status = 'running';
    snapshot.startedAt = now.toISOString();
    snapshot.finishedAt = null;
    snapshot.durationMs = null;
    snapshot.errorCode = null;
    snapshot.errorMessage = null;
    snapshot.metrics = { reason: this.reason, signal: this.signal };
  }

  beginPhase(phase: ShutdownPhase, reason: string = phase): void {
    const now = new Date();
    this.currentPhase = phase;
    this.updatedAt = now;
    this.reason = reason;
    const snapshot = this.getMutablePhase(phase);
    snapshot.status = 'running';
    snapshot.startedAt = now.toISOString();
    snapshot.finishedAt = null;
    snapshot.durationMs = null;
    snapshot.errorCode = null;
    snapshot.errorMessage = null;
    snapshot.metrics = { ...(snapshot.metrics ?? {}), reason };
  }

  completePhase(phase: ShutdownPhase, metrics?: Record<string, unknown>): void {
    const now = new Date();
    this.updatedAt = now;
    const snapshot = this.getMutablePhase(phase);
    snapshot.status = 'completed';
    snapshot.finishedAt = now.toISOString();
    snapshot.durationMs = computeDurationMs(snapshot.startedAt, snapshot.finishedAt);
    snapshot.metrics = { ...snapshot.metrics, ...(metrics ?? {}) };
  }

  failPhase(phase: ShutdownPhase, error: unknown, metrics?: Record<string, unknown>): void {
    const now = new Date();
    const message = error instanceof Error ? error.message : String(error);
    this.currentPhase = 'drain_failed';
    this.completed = false;
    this.blocking = true;
    this.updatedAt = now;
    const snapshot = this.getMutablePhase(phase);
    snapshot.status = 'failed';
    snapshot.finishedAt = now.toISOString();
    snapshot.durationMs = computeDurationMs(snapshot.startedAt, snapshot.finishedAt);
    snapshot.errorCode = error instanceof Error && error.name ? error.name : 'shutdown_failed';
    snapshot.errorMessage = message;
    snapshot.metrics = { ...snapshot.metrics, ...(metrics ?? {}), failedPhase: phase };
    const global = this.getMutablePhase('drain_failed');
    global.status = 'failed';
    global.startedAt = global.startedAt ?? now.toISOString();
    global.finishedAt = now.toISOString();
    global.durationMs = computeDurationMs(global.startedAt, global.finishedAt);
    global.errorCode = snapshot.errorCode;
    global.errorMessage = message;
  }

  markCompleted(metrics?: Record<string, unknown>): void {
    const now = new Date();
    this.currentPhase = 'drain_completed';
    this.completed = true;
    this.forced = false;
    this.blocking = false;
    this.updatedAt = now;
    const snapshot = this.getMutablePhase('drain_completed');
    snapshot.status = 'completed';
    snapshot.startedAt = snapshot.startedAt ?? now.toISOString();
    snapshot.finishedAt = now.toISOString();
    snapshot.durationMs = computeDurationMs(snapshot.startedAt, snapshot.finishedAt);
    snapshot.metrics = { ...snapshot.metrics, ...(metrics ?? {}) };
  }

  markForced(metrics?: Record<string, unknown>): void {
    const now = new Date();
    this.currentPhase = 'force_exit';
    this.completed = false;
    this.forced = true;
    this.blocking = true;
    this.updatedAt = now;
    const snapshot = this.getMutablePhase('force_exit');
    snapshot.status = 'running';
    snapshot.startedAt = snapshot.startedAt ?? now.toISOString();
    snapshot.finishedAt = now.toISOString();
    snapshot.durationMs = computeDurationMs(snapshot.startedAt, snapshot.finishedAt);
    snapshot.metrics = { ...snapshot.metrics, ...(metrics ?? {}) };
  }

  recordPlayerDetached(): void {
    this.players.detached += 1;
  }

  recordPlayerPresenceFailed(playerId: string): void {
    if (playerId) {
      this.players.presenceFailed.push(playerId);
    }
  }

  recordPlayerFlushFailed(playerId: string): void {
    if (playerId) {
      this.players.flushFailed.push(playerId);
    }
  }

  recordInstanceFlushed(): void {
    this.instances.flushed += 1;
  }

  recordInstanceFlushFailed(instanceId: string): void {
    if (instanceId) {
      this.instances.flushFailed.push(instanceId);
    }
  }

  recordLeaseReleased(): void {
    this.instances.leaseReleased += 1;
  }

  recordLeaseReleaseSkipped(instanceId: string): void {
    if (instanceId) {
      this.instances.leaseReleaseSkipped.push(instanceId);
    }
  }

  recordLeaseReleaseFailed(instanceId: string): void {
    if (instanceId) {
      this.instances.leaseReleaseFailed.push(instanceId);
    }
  }

  markNodeDeregistered(): void {
    this.node.deregistered = true;
    this.node.deregisterFailed = null;
  }

  markNodeDeregisterFailed(error: unknown): void {
    this.node.deregistered = false;
    this.node.deregisterFailed = error instanceof Error ? error.message : String(error);
  }

  getSnapshot(): ShutdownResultSnapshot {
    return {
      shutdownRunId: this.shutdownRunId,
      reason: this.reason,
      signal: this.signal,
      phase: this.currentPhase,
      completed: this.completed,
      forced: this.forced,
      blocking: this.blocking,
      startedAt: this.startedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      durationMs: computeDurationMs(this.startedAt.toISOString(), this.updatedAt.toISOString()),
      phases: SHUTDOWN_PHASES.map((phase) => ({ ...this.getMutablePhase(phase) })),
      players: {
        detached: this.players.detached,
        flushFailed: [...this.players.flushFailed],
        presenceFailed: [...this.players.presenceFailed],
      },
      instances: {
        flushed: this.instances.flushed,
        flushFailed: [...this.instances.flushFailed],
        leaseReleased: this.instances.leaseReleased,
        leaseReleaseSkipped: [...this.instances.leaseReleaseSkipped],
        leaseReleaseFailed: [...this.instances.leaseReleaseFailed],
      },
      node: {
        deregistered: this.node.deregistered,
        deregisterFailed: this.node.deregisterFailed,
      },
    };
  }

  private resetSummary(): void {
    this.players.detached = 0;
    this.players.flushFailed = [];
    this.players.presenceFailed = [];
    this.instances.flushed = 0;
    this.instances.flushFailed = [];
    this.instances.leaseReleased = 0;
    this.instances.leaseReleaseSkipped = [];
    this.instances.leaseReleaseFailed = [];
    this.node.deregistered = false;
    this.node.deregisterFailed = null;
  }

  private getMutablePhase(phase: ShutdownPhase): ShutdownPhaseSnapshot {
    let snapshot = this.phases.get(phase);
    if (!snapshot) {
      snapshot = this.createPhaseSnapshot(phase);
      this.phases.set(phase, snapshot);
    }
    return snapshot;
  }

  private createPhaseSnapshot(phase: ShutdownPhase): ShutdownPhaseSnapshot {
    return {
      phase,
      status: phase === 'drain_requested' ? 'running' : 'pending',
      startedAt: phase === 'drain_requested' ? this.startedAt.toISOString() : null,
      finishedAt: null,
      durationMs: phase === 'drain_requested' ? 0 : null,
      errorCode: null,
      errorMessage: null,
      metrics: {},
    };
  }
}

function computeDurationMs(startedAt: string | null, finishedAt: string | null): number | null {
  if (!startedAt || !finishedAt) {
    return null;
  }
  const started = new Date(startedAt).getTime();
  const finished = new Date(finishedAt).getTime();
  if (!Number.isFinite(started) || !Number.isFinite(finished)) {
    return null;
  }
  return Math.max(0, finished - started);
}
