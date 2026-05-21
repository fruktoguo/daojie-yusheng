export type SchedulerTaskKind = 'tick' | 'flush' | 'outbox' | 'maintenance' | 'manual';
export type SchedulerTaskScope = 'global' | 'player' | 'instance' | 'node';
export type SchedulerTaskPriority = 'high' | 'normal' | 'low';
export type SchedulerLeaderMode = 'single' | 'sharded' | 'claim';
export type SchedulerTaskRunStatus = 'idle' | 'running' | 'paused' | 'stopping' | 'disabled';

export interface SchedulerRetryPolicy {
  maxAttempts: number;
  retryDelayMs: number;
  maxRetryDelayMs?: number;
}

export interface SchedulerBackoffPolicy {
  baseDelayMs: number;
  maxDelayMs: number;
  multiplier: number;
}

export interface SchedulerTaskDefinition {
  id: string;
  kind: SchedulerTaskKind;
  scope: SchedulerTaskScope;
  enabled: boolean;
  priority: SchedulerTaskPriority;
  intervalMs?: number;
  timeoutMs?: number;
  maxConcurrency?: number;
  retryPolicy?: SchedulerRetryPolicy;
  backoffPolicy?: SchedulerBackoffPolicy;
  leaderMode?: SchedulerLeaderMode;
  description?: string;
}

export interface SchedulerTaskRunResult {
  processedCount?: number;
  nextRunAt?: number | null;
  metadata?: Record<string, unknown>;
}

export type SchedulerTaskExecutor = () => Promise<SchedulerTaskRunResult | number | void>;

export interface SchedulerTaskRuntimeState {
  id: string;
  kind: SchedulerTaskKind;
  scope: SchedulerTaskScope;
  priority: SchedulerTaskPriority;
  enabled: boolean;
  running: boolean;
  paused: boolean;
  status: SchedulerTaskRunStatus;
  lastHeartbeatAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailure: string | null;
  processedCount: number;
  nextRunAt: string | null;
  backlogCount: number;
  lastDurationMs: number;
  runCount: number;
  failureCount: number;
}

export interface SchedulerBarrierSnapshot {
  trafficOpen?: boolean;
  tickOpen?: boolean;
  flushOpen?: boolean;
  outboxOpen?: boolean;
  workerOpen?: boolean;
  instanceWriteOpen?: boolean;
  instanceAttachOpen?: boolean;
  [key: string]: unknown;
}

export interface SchedulerGovernorSnapshot {
  availableParallelism: number;
  cpuReserve: number;
  flushPoolWaiting: number;
  lockWaitCount: number;
  backlogCount: number;
  backlogPressureLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface SchedulerGovernorDecision {
  allow: boolean;
  reason: string | null;
  snapshot: SchedulerGovernorSnapshot;
}

export interface SchedulerSnapshot {
  initialized: boolean;
  stopping: boolean;
  barrier: SchedulerBarrierSnapshot | null;
  tasks: SchedulerTaskRuntimeState[];
  governor?: SchedulerGovernorSnapshot | null;
}
