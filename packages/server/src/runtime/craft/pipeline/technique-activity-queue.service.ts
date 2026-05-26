/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
/**
 * 技艺活动队列服务。
 * 管理玩家技艺活动的排队、休眠、唤醒和自动启动，
 * 支持 append/prepend/replace 入队模式和条件型技艺的自动重试。
 */
import {
  TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH,
  TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS,
  type TechniqueActivityQueueItem,
  type TechniqueActivityQueueMode,
  type RuntimeTechniqueActivityKind,
} from '@mud/shared';
import {
  getStrategyActiveJob,
  type PipelineContext,
} from './technique-activity-strategy';
import type { TechniqueActivityPipelineService, CraftMutationResult } from './technique-activity-pipeline.service';

/** 玩家队列字段名。 */
const QUEUE_SLOT = 'techniqueActivityQueue';

/**
 * TechniqueActivityQueueService
 *
 * 统一技艺活动队列管理。支持：
 * - 入队（append/prepend/replace）
 * - 出队并启动
 * - 休眠（条件不满足时移到队尾）
 * - 唤醒（条件恢复时重新启动）
 * - 每 tick 推进队列
 */
export class TechniqueActivityQueueService {
  constructor(private pipeline: TechniqueActivityPipelineService) {}

  // ─── 队列读取 ───

  /** 获取玩家队列（不存在则初始化空数组）。 */
  getQueue(player: any): TechniqueActivityQueueItem[] {
    if (!Array.isArray(player[QUEUE_SLOT])) {
      player[QUEUE_SLOT] = [];
    }
    return player[QUEUE_SLOT];
  }

  /** 队列长度。 */
  getQueueLength(player: any): number {
    return this.getQueue(player).length;
  }

  // ─── 入队 ───

  /** 入队。返回是否成功。 */
  enqueue(player: any, item: TechniqueActivityQueueItem, mode: TechniqueActivityQueueMode): boolean {
    const queue = this.getQueue(player);
    if (mode === 'replace') {
      queue.length = 0;
      queue.push(item);
      return true;
    }
    if (queue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) {
      return false;
    }
    if (mode === 'prepend') {
      queue.unshift(item);
    } else {
      queue.push(item);
    }
    return true;
  }

  /** 将条件不满足的 job 休眠入队列尾部。 */
  sleepToQueue(player: any, kind: RuntimeTechniqueActivityKind, payload: unknown, label: string, reason: string): void {
    const queue = this.getQueue(player);
    if (queue.length >= TECHNIQUE_ACTIVITY_QUEUE_MAX_LENGTH) return;
    queue.push({
      queueId: generateQueueId(),
      kind,
      payload,
      label,
      state: 'sleeping',
      sleepReason: reason,
      sleepingSince: Date.now(),
      retryAfterTicks: TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS,
      createdAt: Date.now(),
    });
  }

  // ─── 队列推进 ───

  /**
   * 每 tick 推进队列：尝试启动队列头部的 pending 项，
   * 对 sleeping 项递减 retryAfterTicks 并在到期时检查条件。
   */
  tickQueue(player: any, ctx: PipelineContext): CraftMutationResult | null {
    const queue = this.getQueue(player);
    if (queue.length === 0) return null;

    // 尝试启动队列头部
    const head = queue[0];
    if (!head) return null;

    const strategy = this.pipeline.getStrategy(head.kind);
    if (!strategy) {
      // 无效策略，移除
      queue.shift();
      markQueueDirty(player, ctx);
      return queueMutationResult();
    }

    // 当前槽是否空闲
    const currentJob = getStrategyActiveJob(strategy, player);
    if (currentJob && Number(currentJob.remainingTicks) > 0) {
      // 槽占用，不启动
      return null;
    }

    if (head.state === 'pending') {
      // 尝试启动
      queue.shift();
      return this.pipeline.start(player, head.kind, head.payload, ctx);
    }

    if (head.state === 'sleeping') {
      // 递减重试计时器
      head.retryAfterTicks = Math.max(0, (head.retryAfterTicks ?? 0) - 1);
      if (head.retryAfterTicks > 0) return null;

      // 检查条件
      if (strategy.conditional && strategy.checkContinueCondition) {
        const conditionJob = buildConditionProbeJob(head);
        const condition = strategy.checkContinueCondition(player, conditionJob as any, ctx);
        if (condition.satisfied) {
          // 条件恢复 → 唤醒并启动
          queue.shift();
          strategy.onConditionRestored?.(player, conditionJob as any, ctx);
          return this.pipeline.start(player, head.kind, head.payload, ctx);
        }
        if (condition.shouldCancel) {
          // 条件永久不满足 → 移除
          queue.shift();
          markQueueDirty(player, ctx);
          return queueMutationResult();
        }
        // 条件仍不满足 → 移到队尾，重置计时器
        queue.shift();
        head.retryAfterTicks = TECHNIQUE_ACTIVITY_SLEEP_RETRY_TICKS;
        queue.push(head);
        markQueueDirty(player, ctx);
      }
      return null;
    }

    return null;
  }

  // ─── 队列操作 ───

  /** 移除指定 queueId 的项。 */
  removeByQueueId(player: any, queueId: string): boolean {
    const queue = this.getQueue(player);
    const idx = queue.findIndex(item => item.queueId === queueId);
    if (idx < 0) return false;
    queue.splice(idx, 1);
    return true;
  }

  /** 清空队列。 */
  clear(player: any): void {
    const queue = this.getQueue(player);
    queue.length = 0;
  }
}

// ─── 工具 ───

let queueIdCounter = 0;
function generateQueueId(): string {
  return `q_${Date.now().toString(36)}_${(++queueIdCounter).toString(36)}`;
}

function queueMutationResult(): CraftMutationResult {
  return {
    ok: true,
    panelChanged: true,
    messages: [],
    groundDrops: [],
  };
}

function markQueueDirty(player: any, ctx: PipelineContext): void {
  if (player?.dirtyDomains && typeof player.dirtyDomains.add === 'function') {
    player.dirtyDomains.add('active_job');
  }
  const runtimeService = (ctx.deps as {
    playerRuntimeService?: {
      markPersistenceDirtyDomains?: (player: any, domains: string[]) => void;
      bumpPersistentRevision?: (player: any) => void;
    };
  } | null)?.playerRuntimeService;
  if (typeof runtimeService?.markPersistenceDirtyDomains === 'function') {
    runtimeService.markPersistenceDirtyDomains(player, ['active_job']);
  }
  if (typeof runtimeService?.bumpPersistentRevision === 'function') {
    runtimeService.bumpPersistentRevision(player);
  }
}

function buildConditionProbeJob(item: TechniqueActivityQueueItem): Record<string, unknown> {
  const payload = item.payload && typeof item.payload === 'object'
    ? item.payload as Record<string, unknown>
    : {};
  return {
    ...payload,
    remainingTicks: 1,
    totalTicks: 1,
    workRemainingTicks: 1,
    workTotalTicks: 1,
  };
}
