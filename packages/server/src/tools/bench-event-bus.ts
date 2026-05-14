/**
 * RuntimeEventBusService 性能基准。
 *
 * 运行：pnpm --filter @mud/server bench:event-bus
 */

import { RuntimeEventBusMetricsService } from '../runtime/event-bus/runtime-event-bus-metrics.service';
import { RuntimeEventBusService } from '../runtime/event-bus/runtime-event-bus.service';

type BenchUnit = 'ns' | 'ms';

interface BenchThreshold {
  avgNs?: number;
  p95Ns?: number;
  avgMs?: number;
  p95Ms?: number;
}

interface BenchResult {
  name: string;
  unit: BenchUnit;
  iterations: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  threshold: BenchThreshold | null;
  pass: boolean;
}

const WARMUP_ITERATIONS = 1000;
const SAMPLE_ITERATIONS = 20_000;
const FLUSH_WARMUP_TICKS = 5;
const FLUSH_SAMPLE_TICKS = 40;

const PLAYER_COUNTS = [50, 200, 500, 5000] as const;
const INSTANCE_COUNTS = [100, 1000] as const;

const THRESHOLDS: Record<string, BenchThreshold> = Object.freeze({
  'queue-notice': { avgNs: 2000, p95Ns: 5000 },
  'queue-panelPatch': { avgNs: 25000, p95Ns: 60000 },
  'queue-combatEffect': { avgNs: 1000, p95Ns: 3000 },
  'queue-aoiPresentation': { avgNs: 2000, p95Ns: 6000 },
  'queue-feedback': { avgNs: 1000, p95Ns: 3000 },
  'queue-stateDelta': { avgNs: 3000, p95Ns: 8000 },
  'flush-50': { avgMs: 0.3, p95Ms: 0.8 },
  'flush-200': { avgMs: 0.8, p95Ms: 2.0 },
  'flush-500': { avgMs: 2.0, p95Ms: 5.0 },
  'flush-5000': { avgMs: 10.0, p95Ms: 20.0 },
  'flush-instances-100': { avgMs: 0.8, p95Ms: 2.0 },
  'flush-instances-1000': { avgMs: 5.0, p95Ms: 10.0 },
  'mixed-50': { avgMs: 0.5, p95Ms: 1.5 },
  'mixed-200': { avgMs: 2.0, p95Ms: 5.0 },
  'mixed-500': { avgMs: 5.0, p95Ms: 12.0 },
  'mixed-5000': { avgMs: 35.0, p95Ms: 70.0 },
});

function main(): void {
  const results: BenchResult[] = [];

  results.push(benchQueueNotice());
  results.push(benchQueuePanelPatch());
  results.push(benchQueueCombatEffect());
  results.push(benchQueueAoiPresentation());
  results.push(benchQueueFeedback());
  results.push(benchQueueStateDelta());

  for (const playerCount of PLAYER_COUNTS) {
    results.push(benchFlushPlayers(playerCount));
  }
  for (const instanceCount of INSTANCE_COUNTS) {
    results.push(benchFlushInstances(instanceCount));
  }
  for (const playerCount of PLAYER_COUNTS) {
    results.push(benchMixed(playerCount));
  }

  const gate = evaluateGate(results);
  if (!gate.ok) {
    process.exitCode = 1;
  }

  console.log(JSON.stringify({ ok: gate.ok, gate, results }, null, 2));
}

function benchQueueNotice(): BenchResult {
  const svc = createService();
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queuePlayerNotice(`warmup_${i % 10}`, { kind: 'system', text: `msg-${i}` });
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queuePlayerNotice(`p_${i % 100}`, { kind: 'system', text: `bench-${i}` });
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-notice', durations, 'ns');
}

function benchQueuePanelPatch(): BenchResult {
  const svc = createService();
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queuePlayerPanelPatch(`warmup_${i % 10}`, 'inventory', { added: { [`item_${i}`]: { qty: 1 } } });
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queuePlayerPanelPatch(`p_${i % 100}`, 'inventory', { added: { [`item_${i}`]: { qty: i } } });
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-panelPatch', durations, 'ns');
}

function benchQueueCombatEffect(): BenchResult {
  const svc = createService();
  const effect = { type: 'float' as const, x: 1, y: 1, text: '-42', variant: 'damage' as const };
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queueCombatEffect(`inst_${i % 5}`, effect);
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queueCombatEffect(`inst_${i % 20}`, effect);
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-combatEffect', durations, 'ns');
}

function benchQueueAoiPresentation(): BenchResult {
  const svc = createService();
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queueAoiPresentation(`inst_${i % 5}`, { type: 'statusChange', entityId: `e_${i % 50}`, entityType: 'monster', x: i, y: 0 });
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queueAoiPresentation(`inst_${i % 20}`, { type: 'statusChange', entityId: `e_${i % 200}`, entityType: 'monster', x: i, y: 0 });
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-aoiPresentation', durations, 'ns');
}

function benchQueueFeedback(): BenchResult {
  const svc = createService();
  const feedback = { type: 'reject' as const, action: 'cast', message: 'cooldown' };
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queuePlayerFeedback(`warmup_${i % 10}`, feedback);
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queuePlayerFeedback(`p_${i % 100}`, feedback);
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-feedback', durations, 'ns');
}

function benchQueueStateDelta(): BenchResult {
  const svc = createService();
  for (let i = 0; i < WARMUP_ITERATIONS; i += 1) {
    svc.queuePlayerStateDelta(`warmup_${i % 10}`, { hp: 100 + i, mp: 50 + i });
  }
  svc.flushTick();

  const durations: number[] = [];
  for (let i = 0; i < SAMPLE_ITERATIONS; i += 1) {
    const start = process.hrtime.bigint();
    svc.queuePlayerStateDelta(`p_${i % 100}`, { hp: 100 + i, mp: 50 + i });
    durations.push(Number(process.hrtime.bigint() - start));
  }
  svc.flushTick();

  return buildResult('queue-stateDelta', durations, 'ns');
}

function benchFlushPlayers(playerCount: number): BenchResult {
  const svc = createService();

  for (let tick = 0; tick < FLUSH_WARMUP_TICKS; tick += 1) {
    fillPlayerTick(svc, playerCount);
    svc.flushTick();
  }

  const durations: number[] = [];
  for (let tick = 0; tick < FLUSH_SAMPLE_TICKS; tick += 1) {
    fillPlayerTick(svc, playerCount);
    const start = process.hrtime.bigint();
    svc.flushTick();
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  return buildResult(`flush-${playerCount}`, durations, 'ms');
}

function benchFlushInstances(instanceCount: number): BenchResult {
  const svc = createService();

  for (let tick = 0; tick < FLUSH_WARMUP_TICKS; tick += 1) {
    fillInstanceTick(svc, instanceCount);
    svc.flushTick();
  }

  const durations: number[] = [];
  for (let tick = 0; tick < FLUSH_SAMPLE_TICKS; tick += 1) {
    fillInstanceTick(svc, instanceCount);
    const start = process.hrtime.bigint();
    svc.flushTick();
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  return buildResult(`flush-instances-${instanceCount}`, durations, 'ms');
}

function benchMixed(playerCount: number): BenchResult {
  const svc = createService();

  for (let tick = 0; tick < FLUSH_WARMUP_TICKS; tick += 1) {
    fillPlayerTick(svc, playerCount);
    fillInstanceTick(svc, Math.max(1, Math.floor(playerCount / 10)));
    svc.flushTick();
  }

  const durations: number[] = [];
  for (let tick = 0; tick < FLUSH_SAMPLE_TICKS; tick += 1) {
    const start = process.hrtime.bigint();
    fillPlayerTick(svc, playerCount);
    fillInstanceTick(svc, Math.max(1, Math.floor(playerCount / 10)));
    svc.flushTick();
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
  }

  return buildResult(`mixed-${playerCount}`, durations, 'ms');
}

function createService(): RuntimeEventBusService {
  const metrics = new RuntimeEventBusMetricsService();
  return new RuntimeEventBusService(metrics);
}

function fillPlayerTick(svc: RuntimeEventBusService, playerCount: number): void {
  for (let i = 0; i < playerCount; i += 1) {
    const pid = `player_${i}`;
    svc.queuePlayerNotice(pid, { kind: 'system', text: `tick-msg-${i}` });
    svc.queuePlayerPanelPatch(pid, 'inventory', { added: { [`slot_${i % 20}`]: { qty: i } } });
    svc.queuePlayerFeedback(pid, { type: 'confirm', action: `fb-${i}` });
    svc.queuePlayerStateDelta(pid, { hp: 100 + i });
  }
}

function fillInstanceTick(svc: RuntimeEventBusService, instanceCount: number): void {
  for (let i = 0; i < instanceCount; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      svc.queueCombatEffect(`instance_${i}`, {
        type: 'float',
        x: j,
        y: i,
        text: `-${10 + j}`,
        variant: 'damage',
      });
      svc.queueAoiPresentation(`instance_${i}`, {
        type: 'statusChange',
        entityId: `monster_${j}`,
        entityType: 'monster',
        x: j,
        y: i,
      });
    }
  }
}

function buildResult(name: string, durations: number[], unit: BenchUnit): BenchResult {
  const sorted = [...durations].sort((a, b) => a - b);
  const len = sorted.length;
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  const avg = sum / len;
  const p50 = sorted[Math.floor(len * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(len * 0.95)] ?? 0;
  const p99 = sorted[Math.min(Math.floor(len * 0.99), len - 1)] ?? 0;
  const max = sorted[len - 1] ?? 0;

  const threshold = THRESHOLDS[name] ?? null;
  let pass = true;
  if (threshold) {
    if (unit === 'ns') {
      if (avg > (threshold.avgNs ?? Number.POSITIVE_INFINITY) || p95 > (threshold.p95Ns ?? Number.POSITIVE_INFINITY)) pass = false;
    } else if (avg > (threshold.avgMs ?? Number.POSITIVE_INFINITY) || p95 > (threshold.p95Ms ?? Number.POSITIVE_INFINITY)) {
      pass = false;
    }
  }

  return {
    name,
    unit,
    iterations: len,
    avg: round(avg),
    p50: round(p50),
    p95: round(p95),
    p99: round(p99),
    max: round(max),
    threshold,
    pass,
  };
}

function evaluateGate(results: BenchResult[]): { ok: boolean; total: number; passed: number; failed: number; failures: string[] } {
  const failures = results.filter((result) => !result.pass);
  return {
    ok: failures.length === 0,
    total: results.length,
    passed: results.length - failures.length,
    failed: failures.length,
    failures: failures.map((failure) => failure.name),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

main();
