/**
 * 实例 deadline 调度器。
 *
 * 这里只维护轻量内存索引，不拥有实例权威状态。实例仍由 WorldRuntimeService 管理，
 * checkpoint 仍只持久化 tick/tickSpeed/paused；进程重启后由已恢复实例重建本索引。
 */
import { Injectable } from '@nestjs/common';
import { MAX_INSTANCE_TICK_SPEED, gameplayConstants } from '@mud/shared';

export interface SchedulableInstanceRuntime {
  meta?: { instanceId?: string; runtimeStatus?: string; status?: string };
  tickSpeed?: number;
  paused?: boolean;
}

export interface InstanceTickSchedulePlan<TInstance extends SchedulableInstanceRuntime = SchedulableInstanceRuntime> {
  instanceId: string;
  instance: TInstance;
  steps: number;
  speed: number;
  /** 超出有界追赶窗口而被丢弃的旧逻辑息，仅用于固定维度性能诊断。 */
  droppedSteps: number;
}

interface ScheduleState {
  instanceId: string;
  generation: number;
  speed: number;
  nextDueAtMs: number;
  accelerated: boolean;
}

interface DeadlineNode {
  instanceId: string;
  generation: number;
  dueAtMs: number;
}

const BASE_INTERVAL_MS = gameplayConstants.WORLD_TICK_INTERVAL_MS;
const MIN_INTERVAL_MS = BASE_INTERVAL_MS / MAX_INSTANCE_TICK_SPEED;
/** 保留既有普通实例过载缓冲，避免短时调度抖动直接丢失逻辑息。 */
const MIN_CATCH_UP_STEPS_PER_INSTANCE = 4;
/** 高倍实例至少补偿最近一个现实基准周期，避免倍率越高反而丢失越多逻辑息。 */
const MAX_CATCH_UP_WINDOW_MS = BASE_INTERVAL_MS;
/** 10000 个 1x 实例在 10Hz dispatcher 下平均每批 1000 个；保留约两倍错峰偏斜余量。 */
const MAX_PLANS_PER_BATCH = 2_048;
/** 仅用于避免已到期 deadline 形成 0ms 忙轮询；全局帧起始频率由 WorldTickService 限制为最高 10Hz。 */
const MIN_WAKE_DELAY_MS = 5;

/** 仅按 deadline 排序的二叉最小堆。 */
class DeadlineMinHeap {
  private readonly nodes: DeadlineNode[] = [];

  get size(): number {
    return this.nodes.length;
  }

  peek(): DeadlineNode | null {
    return this.nodes[0] ?? null;
  }

  push(node: DeadlineNode): void {
    this.nodes.push(node);
    let index = this.nodes.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareDeadlineNode(this.nodes[parent], node) <= 0) {
        break;
      }
      this.nodes[index] = this.nodes[parent];
      index = parent;
    }
    this.nodes[index] = node;
  }

  pop(): DeadlineNode | null {
    const root = this.nodes[0] ?? null;
    const last = this.nodes.pop();
    if (!root || !last || this.nodes.length === 0) {
      return root;
    }
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.nodes.length) {
        break;
      }
      let child = left;
      if (right < this.nodes.length && compareDeadlineNode(this.nodes[right], this.nodes[left]) < 0) {
        child = right;
      }
      if (compareDeadlineNode(last, this.nodes[child]) <= 0) {
        break;
      }
      this.nodes[index] = this.nodes[child];
      index = child;
    }
    this.nodes[index] = last;
    return root;
  }

  clear(): void {
    this.nodes.length = 0;
  }
}

@Injectable()
export class WorldRuntimeInstanceScheduleService {
  private readonly stateByInstanceId = new Map<string, ScheduleState>();
  private readonly normalHeap = new DeadlineMinHeap();
  private readonly acceleratedHeap = new DeadlineMinHeap();
  private nextGeneration = 1;
  private scheduleChangedListener: (() => void) | null = null;
  private droppedLogicalStepCount = 0;

  setScheduleChangedListener(listener: (() => void) | null): void {
    this.scheduleChangedListener = listener;
  }

  rebuild(
    entries: Iterable<[string, SchedulableInstanceRuntime]>,
    nowMs = performance.now(),
  ): void {
    this.stateByInstanceId.clear();
    this.normalHeap.clear();
    this.acceleratedHeap.clear();
    for (const [instanceId, instance] of entries) {
      this.upsertSchedule(instanceId, instance, nowMs, true);
    }
    this.notifyScheduleChanged();
  }

  registerOrUpdate(
    instanceId: string,
    instance: SchedulableInstanceRuntime,
    nowMs = performance.now(),
  ): void {
    if (this.upsertSchedule(instanceId, instance, nowMs)) {
      this.notifyScheduleChanged();
    }
  }

  private upsertSchedule(
    instanceId: string,
    instance: SchedulableInstanceRuntime,
    nowMs: number,
    staggerInitialDeadline = false,
  ): boolean {
    const normalizedInstanceId = normalizeInstanceId(instanceId, instance);
    if (!normalizedInstanceId) {
      return false;
    }
    const speed = resolveScheduleSpeed(instance);
    const current = this.stateByInstanceId.get(normalizedInstanceId);
    if (speed <= 0) {
      if (current) {
        this.stateByInstanceId.delete(normalizedInstanceId);
        return true;
      }
      return false;
    }
    if (current && current.speed === speed) {
      return false;
    }
    const intervalMs = resolveIntervalMs(speed);
    const generation = this.nextGeneration++;
    const state: ScheduleState = {
      instanceId: normalizedInstanceId,
      generation,
      speed,
      // 恢复时按实例 ID 确定性错峰，避免 10000 实例同秒惊群；主动改速仍从完整新间隔起算。
      nextDueAtMs: nowMs + resolveInitialDelayMs(normalizedInstanceId, intervalMs, staggerInitialDeadline),
      accelerated: speed > 1,
    };
    this.stateByInstanceId.set(normalizedInstanceId, state);
    this.pushState(state);
    return true;
  }

  unregister(instanceId: string): void {
    const normalized = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (normalized && this.stateByInstanceId.delete(normalized)) {
      this.notifyScheduleChanged();
    }
  }

  collectDue<TInstance extends SchedulableInstanceRuntime>(
    nowMs: number,
    resolveInstance: (instanceId: string) => TInstance | null,
    isWritable?: (instance: TInstance) => boolean,
  ): InstanceTickSchedulePlan<TInstance>[] {
    const plans: InstanceTickSchedulePlan<TInstance>[] = [];
    const plannedInstanceIds = new Set<string>();
    // 普通实例先出队，确保加速实例积压时也不能饿死正常地图。
    this.collectHeapDue(this.normalHeap, nowMs, resolveInstance, isWritable, plans, plannedInstanceIds);
    if (plans.length < MAX_PLANS_PER_BATCH) {
      this.collectHeapDue(this.acceleratedHeap, nowMs, resolveInstance, isWritable, plans, plannedInstanceIds);
    }
    return plans;
  }

  resolveNextDelayMs(nowMs = performance.now()): number {
    const normalDueAt = this.resolveValidHeapHeadDueAt(this.normalHeap);
    const acceleratedDueAt = this.resolveValidHeapHeadDueAt(this.acceleratedHeap);
    const nextDueAt = Math.min(normalDueAt, acceleratedDueAt, nowMs + BASE_INTERVAL_MS);
    return Math.max(MIN_WAKE_DELAY_MS, Math.min(BASE_INTERVAL_MS, nextDueAt - nowMs));
  }

  getScheduledInstanceCount(): number {
    return this.stateByInstanceId.size;
  }

  getDroppedLogicalStepCount(): number {
    return this.droppedLogicalStepCount;
  }

  private collectHeapDue<TInstance extends SchedulableInstanceRuntime>(
    heap: DeadlineMinHeap,
    nowMs: number,
    resolveInstance: (instanceId: string) => TInstance | null,
    isWritable: ((instance: TInstance) => boolean) | undefined,
    plans: InstanceTickSchedulePlan<TInstance>[],
    plannedInstanceIds: Set<string>,
  ): void {
    const deferredNodes: DeadlineNode[] = [];
    try {
      while (plans.length < MAX_PLANS_PER_BATCH) {
        const node = this.peekValidNode(heap);
        if (!node || node.dueAtMs > nowMs) {
          return;
        }
        heap.pop();
        if (plannedInstanceIds.has(node.instanceId)) {
          // 同一实例单批最多形成一个计划；剩余积压留给下一次唤醒，避免绕过补帧上限。
          deferredNodes.push(node);
          continue;
        }
        const state = this.stateByInstanceId.get(node.instanceId);
        if (!state || state.generation !== node.generation) {
          continue;
        }
        const instance = resolveInstance(node.instanceId);
        if (!instance || isTerminalInstance(instance)) {
          this.stateByInstanceId.delete(node.instanceId);
          continue;
        }
        if (isWritable && !isWritable(instance)) {
          // lease_degraded/fenced 可能在续租后恢复；只暂停本地逻辑时间，不永久遗失索引。
          state.nextDueAtMs = nowMs + BASE_INTERVAL_MS;
          this.pushState(state);
          continue;
        }
        const currentSpeed = resolveScheduleSpeed(instance);
        if (currentSpeed <= 0) {
          this.stateByInstanceId.delete(node.instanceId);
          continue;
        }
        if (currentSpeed !== state.speed) {
          this.stateByInstanceId.delete(node.instanceId);
          this.registerOrUpdate(node.instanceId, instance, nowMs);
          continue;
        }
        const intervalMs = resolveIntervalMs(state.speed);
        const overdueSteps = Math.floor(Math.max(0, nowMs - state.nextDueAtMs) / intervalMs) + 1;
        const maxCatchUpSteps = resolveMaxCatchUpSteps(state.speed);
        const steps = Math.max(1, Math.min(maxCatchUpSteps, overdueSteps));
        const droppedSteps = Math.max(0, overdueSteps - steps);
        plans.push({ instanceId: node.instanceId, instance, steps, speed: state.speed, droppedSteps });
        plannedInstanceIds.add(node.instanceId);
        if (droppedSteps > 0) {
          // 超载时只补有限逻辑息，其余债务直接丢弃并重同步到当前时间，防止永久追债。
          this.droppedLogicalStepCount += droppedSteps;
          state.nextDueAtMs = nowMs + intervalMs;
        } else {
          state.nextDueAtMs += steps * intervalMs;
        }
        this.pushState(state);
      }
    } finally {
      for (const node of deferredNodes) {
        heap.push(node);
      }
    }
  }

  private resolveValidHeapHeadDueAt(heap: DeadlineMinHeap): number {
    return this.peekValidNode(heap)?.dueAtMs ?? Number.POSITIVE_INFINITY;
  }

  private peekValidNode(heap: DeadlineMinHeap): DeadlineNode | null {
    while (heap.size > 0) {
      const node = heap.peek();
      if (!node) {
        return null;
      }
      const state = this.stateByInstanceId.get(node.instanceId);
      if (state && state.generation === node.generation && state.nextDueAtMs === node.dueAtMs) {
        return node;
      }
      heap.pop();
    }
    return null;
  }

  private pushState(state: ScheduleState): void {
    const node = {
      instanceId: state.instanceId,
      generation: state.generation,
      dueAtMs: state.nextDueAtMs,
    };
    (state.accelerated ? this.acceleratedHeap : this.normalHeap).push(node);
  }

  private notifyScheduleChanged(): void {
    this.scheduleChangedListener?.();
  }
}

function resolveScheduleSpeed(instance: SchedulableInstanceRuntime): number {
  if (instance?.paused === true) {
    return 0;
  }
  const rawSpeed = Number(instance?.tickSpeed ?? 1);
  if (!Number.isFinite(rawSpeed) || rawSpeed <= 0) {
    return 0;
  }
  return Math.max(0.1, Math.min(MAX_INSTANCE_TICK_SPEED, rawSpeed));
}

function resolveIntervalMs(speed: number): number {
  return Math.max(MIN_INTERVAL_MS, BASE_INTERVAL_MS / Math.max(0.1, speed));
}

function resolveMaxCatchUpSteps(speed: number): number {
  const normalizedSpeed = Math.max(0.1, Math.min(MAX_INSTANCE_TICK_SPEED, speed));
  return Math.max(
    MIN_CATCH_UP_STEPS_PER_INSTANCE,
    Math.ceil(normalizedSpeed * MAX_CATCH_UP_WINDOW_MS / BASE_INTERVAL_MS),
  );
}

/** 启动冷路径使用稳定散列分布首个 deadline，不改变实例后续固定周期。 */
function resolveInitialDelayMs(instanceId: string, intervalMs: number, stagger: boolean): number {
  if (!stagger) {
    return intervalMs;
  }
  let hash = 2166136261;
  for (let index = 0; index < instanceId.length; index += 1) {
    hash ^= instanceId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const phase = ((hash >>> 0) % 1024 + 1) / 1024;
  return Math.max(MIN_WAKE_DELAY_MS, intervalMs * phase);
}

function normalizeInstanceId(instanceId: string, instance: SchedulableInstanceRuntime): string {
  const direct = typeof instanceId === 'string' ? instanceId.trim() : '';
  if (direct) {
    return direct;
  }
  return typeof instance?.meta?.instanceId === 'string' ? instance.meta.instanceId.trim() : '';
}

function isTerminalInstance(instance: SchedulableInstanceRuntime): boolean {
  return instance?.meta?.runtimeStatus === 'stopped'
    || instance?.meta?.status === 'destroyed';
}

function compareDeadlineNode(left: DeadlineNode, right: DeadlineNode): number {
  if (left.dueAtMs !== right.dueAtMs) {
    return left.dueAtMs - right.dueAtMs;
  }
  return left.instanceId < right.instanceId ? -1 : left.instanceId > right.instanceId ? 1 : 0;
}
