import { Injectable } from '@nestjs/common';

export type StartupPhase =
  | 'created'
  | 'preparing'
  | 'recovering_world'
  | 'recovering_players'
  | 'starting_loops'
  | 'ready'
  | 'degraded'
  | 'failed'
  | 'draining';

export interface StartupPhaseSnapshot {
  phase: StartupPhase;
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  metrics: Record<string, unknown>;
}

export interface StartupStatusSnapshot {
  startupRunId: string;
  phase: StartupPhase;
  ready: boolean;
  degraded: boolean;
  failed: boolean;
  blocking: boolean;
  reason: string;
  startedAt: string;
  updatedAt: string;
  phases: StartupPhaseSnapshot[];
}

const STARTUP_PHASES: StartupPhase[] = [
  'created',
  'preparing',
  'recovering_world',
  'recovering_players',
  'starting_loops',
  'ready',
  'degraded',
  'failed',
  'draining',
];

@Injectable()
export class StartupStatusService {
  private readonly startupRunId = `startup:${process.pid}:${Date.now()}`;
  private readonly startedAt = new Date();
  private updatedAt = this.startedAt;
  private currentPhase: StartupPhase = 'created';
  private ready = false;
  private degraded = false;
  private failed = false;
  private blocking = true;
  private reason = 'created';
  private readonly phases = new Map<StartupPhase, StartupPhaseSnapshot>();

  constructor() {
    for (const phase of STARTUP_PHASES) {
      this.phases.set(phase, {
        phase,
        status: phase === 'created' ? 'completed' : 'pending',
        startedAt: phase === 'created' ? this.startedAt.toISOString() : null,
        finishedAt: phase === 'created' ? this.startedAt.toISOString() : null,
        durationMs: phase === 'created' ? 0 : null,
        errorCode: null,
        errorMessage: null,
        metrics: {},
      });
    }
  }

  beginPhase(phase: StartupPhase, reason: string = phase): void {
    const now = new Date();
    this.currentPhase = phase;
    this.updatedAt = now;
    this.reason = reason;
    this.ready = false;
    this.blocking = true;
    const snapshot = this.getMutablePhase(phase);
    snapshot.status = 'running';
    snapshot.startedAt = now.toISOString();
    snapshot.finishedAt = null;
    snapshot.durationMs = null;
    snapshot.errorCode = null;
    snapshot.errorMessage = null;
  }

  completePhase(phase: StartupPhase, metrics?: Record<string, unknown>): void {
    const now = new Date();
    this.updatedAt = now;
    const snapshot = this.getMutablePhase(phase);
    snapshot.status = 'completed';
    snapshot.finishedAt = now.toISOString();
    snapshot.durationMs = computeDurationMs(snapshot.startedAt, snapshot.finishedAt);
    snapshot.metrics = { ...snapshot.metrics, ...(metrics ?? {}) };
  }

  markReady(reason: string = 'ready', metrics?: Record<string, unknown>): void {
    this.currentPhase = 'ready';
    this.ready = true;
    this.degraded = false;
    this.failed = false;
    this.blocking = false;
    this.reason = reason;
    this.completePhase('ready', metrics);
  }

  markDegraded(reason: string, metrics?: Record<string, unknown>): void {
    this.currentPhase = 'degraded';
    this.ready = true;
    this.degraded = true;
    this.failed = false;
    this.blocking = false;
    this.reason = reason;
    this.completePhase('degraded', metrics);
  }

  markFailed(error: unknown, phase = this.currentPhase): void {
    const now = new Date();
    const message = error instanceof Error ? error.message : String(error);
    this.currentPhase = 'failed';
    this.ready = false;
    this.failed = true;
    this.blocking = true;
    this.reason = message || 'startup_failed';
    this.updatedAt = now;
    const failedPhase = this.getMutablePhase(phase);
    failedPhase.status = 'failed';
    failedPhase.finishedAt = now.toISOString();
    failedPhase.durationMs = computeDurationMs(failedPhase.startedAt, failedPhase.finishedAt);
    failedPhase.errorCode = error instanceof Error && error.name ? error.name : 'startup_failed';
    failedPhase.errorMessage = message;
    const globalFailed = this.getMutablePhase('failed');
    globalFailed.status = 'failed';
    globalFailed.startedAt = globalFailed.startedAt ?? now.toISOString();
    globalFailed.finishedAt = now.toISOString();
    globalFailed.durationMs = computeDurationMs(globalFailed.startedAt, globalFailed.finishedAt);
    globalFailed.errorCode = failedPhase.errorCode;
    globalFailed.errorMessage = failedPhase.errorMessage;
  }

  markDraining(reason: string = 'draining'): void {
    this.currentPhase = 'draining';
    this.ready = false;
    this.blocking = true;
    this.reason = reason;
    this.beginPhase('draining', reason);
  }

  getSnapshot(): StartupStatusSnapshot {
    return {
      startupRunId: this.startupRunId,
      phase: this.currentPhase,
      ready: this.ready,
      degraded: this.degraded,
      failed: this.failed,
      blocking: this.blocking,
      reason: this.reason,
      startedAt: this.startedAt.toISOString(),
      updatedAt: this.updatedAt.toISOString(),
      phases: STARTUP_PHASES.map((phase) => ({ ...this.getMutablePhase(phase) })),
    };
  }

  private getMutablePhase(phase: StartupPhase): StartupPhaseSnapshot {
    let snapshot = this.phases.get(phase);
    if (!snapshot) {
      snapshot = {
        phase,
        status: 'pending',
        startedAt: null,
        finishedAt: null,
        durationMs: null,
        errorCode: null,
        errorMessage: null,
        metrics: {},
      };
      this.phases.set(phase, snapshot);
    }
    return snapshot;
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
