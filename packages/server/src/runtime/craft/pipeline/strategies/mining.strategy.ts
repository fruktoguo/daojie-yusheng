/**
 * 本文件属于服务端权威运行时，负责挖矿技艺 job 的启动、推进和取消。
 *
 * 挖矿 job 负责持续恢复矿脉强制攻击意图，实际地块伤害/掉落/经验仍走战斗地块链路。
 */
import {
  isOreMinableTileType,
  parseTileTargetRef,
  uiLabels,
  type PlayerMiningJob,
  type TechniqueActivityConditionCheckResult,
  type TechniqueActivityResolveResult,
  type TechniqueActivityRefundResult,
  type TechniqueActivityStartValidationResult,
} from '@mud/shared';
import type { TechniqueActivityStrategy, PipelineContext, PersistenceDomain } from '../technique-activity-strategy';
import { bumpTechniqueActivityJobVersion } from '../../technique-activity-runtime.helpers';

type MiningValidatedPayload = {
  instanceId: string;
  targetX: number;
  targetY: number;
  tileType: string;
  tileName: string;
  currentHp: number;
  baseDamagePerTick: number;
};

type MiningDepsPort = {
  getInstanceRuntime?: (instanceId: string) => any;
  getInstanceRuntimeOrThrow?: (instanceId: string) => any;
  getPlayerLocation?: (playerId: string) => { instanceId?: string; x?: number; y?: number } | null;
  getPlayerLocationOrThrow?: (playerId: string) => { instanceId?: string; x?: number; y?: number };
  hasPendingCommand?: (playerId: string) => boolean;
  enqueuePendingCommand?: (playerId: string, command: unknown) => void;
  playerRuntimeService?: {
    markPersistenceDirtyDomains?: (player: any, domains: string[]) => void;
    bumpPersistentRevision?: (player: any) => void;
  };
};

export class MiningStrategy implements TechniqueActivityStrategy<PlayerMiningJob, MiningValidatedPayload> {
  readonly kind = 'mining' as const;
  readonly jobSlot = 'miningJob';
  readonly skillSlot = 'miningSkill';
  readonly activityLabel = '挖矿';
  readonly pauseTicks = 10;
  readonly conditional = true;

  getActiveJob(player: unknown): PlayerMiningJob | null {
    return (player as { miningJob?: PlayerMiningJob | null }).miningJob ?? null;
  }

  setActiveJob(player: unknown, job: PlayerMiningJob | null): void {
    (player as { miningJob?: PlayerMiningJob | null }).miningJob = job;
  }

  validateStart(player: unknown, payload: unknown, ctx: PipelineContext): TechniqueActivityStartValidationResult<MiningValidatedPayload> {
    const playerId = resolvePlayerId(player);
    if (!playerId) {
      return { ok: false, error: '玩家不存在。' };
    }
    const target = resolveMiningTarget(payload);
    if (!target) {
      return { ok: false, error: '挖矿目标不能为空。' };
    }
    const deps = resolveMiningDeps(ctx);
    const location = resolvePlayerLocation(playerId, player, deps);
    const instanceId = resolveInstanceId(payload, location, player);
    const instance = instanceId ? resolveInstance(instanceId, deps, ctx) : null;
    if (!instance || typeof instance.getTileCombatState !== 'function') {
      return { ok: false, error: '当前地图不可挖矿。' };
    }
    if (!isWithinMiningRange(location, target)) {
      return { ok: false, error: '距离矿脉太远。' };
    }
    const tileState = instance.getTileCombatState(target.x, target.y);
    if (!tileState || tileState.destroyed === true) {
      return { ok: false, error: '挖矿目标已经不存在。' };
    }
    const tileType = typeof tileState.tileType === 'string' ? tileState.tileType : '';
    if (!isOreMinableTileType(tileType)) {
      return { ok: false, error: '该地块不是矿脉。' };
    }
    const currentHp = Math.max(1, Math.trunc(Number(tileState.hp ?? tileState.maxHp) || 1));
    return {
      ok: true,
      validated: {
        instanceId,
        targetX: target.x,
        targetY: target.y,
        tileType,
        tileName: resolveTileName(tileType),
        currentHp,
        baseDamagePerTick: resolveMiningBaseDamage(player),
      },
    };
  }

  consumeResources(_player: unknown, _validated: MiningValidatedPayload, _ctx: PipelineContext): void {}

  createJob(_player: unknown, validated: MiningValidatedPayload, _ctx: PipelineContext): PlayerMiningJob {
    const jobRunId = `mining:${validated.instanceId}:${validated.targetX}:${validated.targetY}:${Date.now().toString(36)}`;
    return {
      jobRunId,
      jobType: 'mining',
      jobVersion: 1,
      miningNodeId: `${validated.instanceId}:${validated.targetX}:${validated.targetY}`,
      miningNodeName: validated.tileName,
      instanceId: validated.instanceId,
      targetX: validated.targetX,
      targetY: validated.targetY,
      tileType: validated.tileType,
      baseDamagePerTick: validated.baseDamagePerTick,
      phase: 'mining',
      startedAt: Date.now(),
      workTotalTicks: validated.currentHp,
      workRemainingTicks: validated.currentHp,
      totalTicks: validated.currentHp,
      remainingTicks: validated.currentHp,
      pausedTicks: 0,
      interruptWaitRemainingTicks: 0,
      interruptState: null,
      successRate: 1,
      spiritStoneCost: 0,
    };
  }

  executeTick(player: unknown, ctx: PipelineContext): unknown {
    const job = this.getActiveJob(player);
    if (!job || Number(job.remainingTicks) <= 0) {
      return emptyMiningTickResult();
    }
    if (job.phase === 'paused') {
      advanceMiningPause(job);
      markMiningDirty(player, ['active_job'], ctx);
      return { ...emptyMiningTickResult(), panelChanged: true };
    }

    const condition = this.checkContinueCondition(player, job, ctx);
    if (!condition.satisfied) {
      this.setActiveJob(player, null);
      markMiningDirty(player, ['active_job'], ctx);
      return {
        ...emptyMiningTickResult(),
        panelChanged: true,
        ...(condition.shouldCancel === true
          ? {}
          : { sleepPayload: buildMiningSleepPayload(job, condition.reason) }),
      };
    }

    const deps = resolveMiningDeps(ctx);
    const instance = resolveInstance(job.instanceId, deps, ctx);
    const tileState = instance?.getTileCombatState?.(job.targetX, job.targetY);
    const nextRemaining = Math.max(0, Math.trunc(Number(tileState?.hp ?? job.remainingTicks) || 0));
    const progressChanged = nextRemaining !== Math.max(0, Math.trunc(Number(job.remainingTicks) || 0));
    job.remainingTicks = nextRemaining;
    job.workRemainingTicks = nextRemaining;
    if (tileState?.destroyed === true || nextRemaining <= 0) {
      this.setActiveJob(player, null);
      markMiningDirty(player, ['active_job'], ctx);
      return { ...emptyMiningTickResult(), panelChanged: true };
    }
    const commandQueued = enqueueMiningAttackCommand(player, job, deps);
    markMiningDirty(player, ['active_job'], ctx);
    return {
      ...emptyMiningTickResult(),
      panelChanged: progressChanged || commandQueued,
    };
  }

  resolveResumePhase(_job: PlayerMiningJob): string {
    return 'mining';
  }

  isResolvePoint(job: PlayerMiningJob): boolean {
    return Number(job.remainingTicks) <= 0;
  }

  resolve(_player: unknown, _job: PlayerMiningJob, _ctx: PipelineContext): TechniqueActivityResolveResult {
    return {
      successCount: 1,
      failureCount: 0,
      outputs: [],
      expParams: {
        skillLevel: 1,
        targetLevel: 1,
        baseActionTicks: 1,
        getExpToNextByLevel: () => 100,
      },
      completed: true,
      messages: [],
    };
  }

  computeRefund(_player: unknown, _job: PlayerMiningJob): TechniqueActivityRefundResult {
    return { items: [], spiritStones: 0 };
  }

  dirtyDomains(): PersistenceDomain[] {
    return ['active_job', 'profession', 'inventory'];
  }

  checkContinueCondition(player: unknown, job: PlayerMiningJob, ctx: PipelineContext): TechniqueActivityConditionCheckResult {
    const deps = resolveMiningDeps(ctx);
    const location = resolvePlayerLocation(resolvePlayerId(player), player, deps);
    if (location.instanceId !== job.instanceId) {
      return { satisfied: false, reason: '离开矿脉范围。' };
    }
    const instance = resolveInstance(job.instanceId, deps, ctx);
    const tileState = instance?.getTileCombatState?.(job.targetX, job.targetY);
    if (!tileState || tileState.destroyed === true) {
      return { satisfied: false, reason: '矿脉已经不存在。', shouldCancel: true };
    }
    if (!isOreMinableTileType(tileState.tileType)) {
      return { satisfied: false, reason: '目标已不是矿脉。', shouldCancel: true };
    }
    return { satisfied: true };
  }
}

function emptyMiningTickResult() {
  return {
    ok: true,
    panelChanged: false,
    inventoryChanged: false,
    equipmentChanged: false,
    attrChanged: false,
    messages: [],
    groundDrops: [],
    craftRealmExpGain: 0,
  };
}

function resolvePlayerId(player: unknown): string {
  const playerId = (player as { playerId?: unknown } | null | undefined)?.playerId;
  return typeof playerId === 'string' && playerId.trim() ? playerId.trim() : '';
}

function resolveMiningTarget(payload: unknown): { x: number; y: number } | null {
  const record = payload as { targetRef?: unknown; targetX?: unknown; targetY?: unknown; x?: unknown; y?: unknown } | null | undefined;
  const targetRef = typeof record?.targetRef === 'string' ? record.targetRef.trim() : '';
  const fromRef = targetRef ? parseTileTargetRef(targetRef) : null;
  if (fromRef) {
    return { x: Math.trunc(fromRef.x), y: Math.trunc(fromRef.y) };
  }
  const rawX = record?.targetX ?? record?.x;
  const rawY = record?.targetY ?? record?.y;
  const x = Number(rawX);
  const y = Number(rawY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }
  return { x: Math.trunc(x), y: Math.trunc(y) };
}

function resolveInstanceId(payload: unknown, location: { instanceId: string }, player: unknown): string {
  const payloadInstanceId = (payload as { instanceId?: unknown } | null | undefined)?.instanceId;
  if (typeof payloadInstanceId === 'string' && payloadInstanceId.trim()) {
    return payloadInstanceId.trim();
  }
  const playerInstanceId = (player as { instanceId?: unknown } | null | undefined)?.instanceId;
  if (typeof playerInstanceId === 'string' && playerInstanceId.trim()) {
    return playerInstanceId.trim();
  }
  return location.instanceId;
}

function resolveMiningDeps(ctx: PipelineContext): MiningDepsPort | null {
  return ctx.deps as MiningDepsPort | null;
}

function resolvePlayerLocation(playerId: string, player: unknown, deps: MiningDepsPort | null): { instanceId: string; x: number; y: number } {
  const location = playerId
    ? deps?.getPlayerLocation?.(playerId) ?? deps?.getPlayerLocationOrThrow?.(playerId)
    : null;
  const instanceId = typeof location?.instanceId === 'string' && location.instanceId.trim()
    ? location.instanceId.trim()
    : typeof (player as { instanceId?: unknown } | null | undefined)?.instanceId === 'string'
      ? String((player as { instanceId: string }).instanceId).trim()
      : '';
  const x = Number.isFinite(Number(location?.x))
    ? Math.trunc(Number(location?.x))
    : Math.trunc(Number((player as { x?: unknown } | null | undefined)?.x) || 0);
  const y = Number.isFinite(Number(location?.y))
    ? Math.trunc(Number(location?.y))
    : Math.trunc(Number((player as { y?: unknown } | null | undefined)?.y) || 0);
  return { instanceId, x, y };
}

function resolveInstance(instanceId: string, deps: MiningDepsPort | null, ctx: PipelineContext): any {
  if (!instanceId) {
    return null;
  }
  return deps?.getInstanceRuntime?.(instanceId)
    ?? deps?.getInstanceRuntimeOrThrow?.(instanceId)
    ?? ctx.getInstanceRuntime(instanceId);
}

function isWithinMiningRange(location: { x: number; y: number }, target: { x: number; y: number }): boolean {
  return Math.max(Math.abs(location.x - target.x), Math.abs(location.y - target.y)) <= 1;
}

function resolveMiningTargetRef(job: PlayerMiningJob): string {
  return `tile:${Math.trunc(Number(job.targetX) || 0)}:${Math.trunc(Number(job.targetY) || 0)}`;
}

function isEntityCombatTargetRef(targetRef: unknown): boolean {
  const normalized = typeof targetRef === 'string' ? targetRef.trim() : '';
  return normalized.length > 0 && !normalized.startsWith('tile:');
}

function isMiningCombatBusy(player: unknown): boolean {
  const combat = (player as {
    combat?: {
      combatTargetId?: unknown;
      pendingSkillCast?: unknown;
      retaliatePlayerTargetId?: unknown;
    };
  } | null | undefined)?.combat;
  if (combat?.pendingSkillCast) {
    return true;
  }
  const retaliatePlayerTargetId = typeof combat?.retaliatePlayerTargetId === 'string'
    ? combat.retaliatePlayerTargetId.trim()
    : '';
  if (retaliatePlayerTargetId) {
    return true;
  }
  return isEntityCombatTargetRef(combat?.combatTargetId);
}

function isMiningCombatAlreadyLocked(player: unknown, job: PlayerMiningJob): boolean {
  const combat = (player as {
    combat?: {
      autoBattle?: unknown;
      combatTargetId?: unknown;
      combatTargetLocked?: unknown;
    };
  } | null | undefined)?.combat;
  if (combat?.autoBattle !== true || combat?.combatTargetLocked !== true) {
    return false;
  }
  const combatTargetId = typeof combat.combatTargetId === 'string' ? combat.combatTargetId.trim() : '';
  return combatTargetId === resolveMiningTargetRef(job);
}

function enqueueMiningAttackCommand(player: unknown, job: PlayerMiningJob, deps: MiningDepsPort | null): boolean {
  const playerId = resolvePlayerId(player);
  if (!playerId || typeof deps?.enqueuePendingCommand !== 'function') {
    return false;
  }
  if (typeof deps.hasPendingCommand === 'function' && deps.hasPendingCommand(playerId)) {
    return false;
  }
  if (isMiningCombatBusy(player)) {
    return false;
  }
  if (isMiningCombatAlreadyLocked(player, job)) {
    return false;
  }
  deps.enqueuePendingCommand(playerId, {
    kind: 'engageBattle',
    targetPlayerId: null,
    targetMonsterId: null,
    targetX: Math.trunc(Number(job.targetX) || 0),
    targetY: Math.trunc(Number(job.targetY) || 0),
    locked: true,
    miningJobRunId: typeof job.jobRunId === 'string' ? job.jobRunId : undefined,
    miningTargetRef: resolveMiningTargetRef(job),
  });
  return true;
}

function resolveMiningBaseDamage(player: unknown): number {
  const stats = (player as { attrs?: { numericStats?: Record<string, unknown> } } | null | undefined)?.attrs?.numericStats;
  const physAtk = Math.max(0, Math.round(Number(stats?.physAtk) || 0));
  const spellAtk = Math.max(0, Math.round(Number(stats?.spellAtk) || 0));
  return Math.max(1, physAtk || spellAtk || 1);
}

function resolveTileName(tileType: string): string {
  return uiLabels.TILE_TYPE_LABELS[tileType as keyof typeof uiLabels.TILE_TYPE_LABELS] ?? '矿脉';
}

function advanceMiningPause(job: PlayerMiningJob): void {
  job.pausedTicks = Math.max(0, Math.trunc(Number(job.pausedTicks) || 0) - 1);
  job.interruptWaitRemainingTicks = job.pausedTicks;
  if (job.interruptState) {
    job.interruptState = {
      ...job.interruptState,
      waitRemainingTicks: job.pausedTicks,
    };
  }
  if (job.pausedTicks <= 0) {
    job.phase = 'mining';
    job.interruptWaitRemainingTicks = 0;
    job.interruptState = null;
  }
}

function markMiningDirty(player: unknown, domains: string[], ctx: PipelineContext): void {
  const deps = resolveMiningDeps(ctx);
  const normalizedDomains = domains
    .map((domain) => typeof domain === 'string' ? domain.trim() : '')
    .filter((domain) => domain.length > 0);
  if (normalizedDomains.includes('active_job')) {
    bumpTechniqueActivityJobVersion(player);
  }
  if (typeof deps?.playerRuntimeService?.markPersistenceDirtyDomains === 'function') {
    deps.playerRuntimeService.markPersistenceDirtyDomains(player, normalizedDomains);
  } else if ((player as { dirtyDomains?: Set<string> } | null)?.dirtyDomains instanceof Set) {
    for (const domain of normalizedDomains) {
      (player as { dirtyDomains: Set<string> }).dirtyDomains.add(domain);
    }
  }
  if (typeof deps?.playerRuntimeService?.bumpPersistentRevision === 'function') {
    deps.playerRuntimeService.bumpPersistentRevision(player);
  }
}

function buildMiningSleepPayload(job: PlayerMiningJob, reason?: string): Record<string, unknown> {
  return {
    kind: 'mining',
    payload: {
      instanceId: job.instanceId,
      targetX: job.targetX,
      targetY: job.targetY,
    },
    label: job.miningNodeName || '挖矿任务',
    reason: reason ?? '条件暂时不满足',
  };
}
