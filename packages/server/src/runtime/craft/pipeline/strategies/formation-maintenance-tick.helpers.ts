import type {
  PlayerFormationJob,
  TechniqueActivityNoticeMessage,
  TechniqueActivityResolveResult,
} from '@mud/shared';
import type { PipelineContext } from '../technique-activity-strategy';

export function resolveFormationMaintenanceTick(
  player: unknown,
  job: PlayerFormationJob,
  ctx: PipelineContext,
): TechniqueActivityResolveResult {
  const playerId = resolvePlayerId(player);
  if (!playerId) {
    return buildFormationResolveResult(true, []);
  }
  const formationService = resolveFormationService(ctx);
  const formation = formationService.findOwnedFormation(playerId, job.formationInstanceId);
  const rate = resolveFormationMaintenanceRate(player);
  const transfer = Math.min(rate, Math.max(0, Math.floor(Number((player as { qi?: unknown } | null)?.qi) || 0)));
  if (transfer <= 0) {
    (player as { formationJob?: PlayerFormationJob | null }).formationJob = null;
    return buildFormationResolveResult(true, [
      buildFormationNotice('warn', 'notice.craft.formation.qi-insufficient', formation.name),
    ]);
  }

  const playerRuntimeService = resolvePlayerRuntimeService(ctx);
  playerRuntimeService?.spendQi?.(playerId, transfer);
  formationService.setFormationRemainingQiBudget(
    formation,
    formationService.resolveFormationRemainingQiBudget(formation) + transfer,
  );
  if (formationService.resolveFormationRemainingSpiritStoneBudget(formation) > 0) {
    formation.active = true;
  }
  formation.updatedAt = Date.now();
  touchRuntimeInstanceRevision(ctx, formation.instanceId);
  formationService.persistInstanceFormationsSoon?.(formation.instanceId);
  playerRuntimeService?.recordActivity?.(playerId, Number((ctx.deps as { tick?: unknown } | null)?.tick) || 0, { interruptCultivation: true });

  job.maintenanceRate = rate;
  job.remainingTicks = 1;
  job.totalTicks = 1;
  job.workRemainingTicks = 1;
  job.workTotalTicks = 1;
  job.interruptWaitRemainingTicks = 0;
  job.interruptState = null;

  const skillLevel = Math.max(1, Math.trunc(Number((player as { formationSkill?: { level?: unknown } } | null)?.formationSkill?.level) || 1));
  return {
    successCount: 1,
    failureCount: 0,
    outputs: [],
    expParams: {
      skillLevel,
      targetLevel: skillLevel,
      baseActionTicks: 1,
      successCount: 1,
      failureCount: 0,
      getExpToNextByLevel: ctx.resolveExpToNextByLevel,
    },
    completed: false,
    messages: [],
  };
}

function resolveFormationService(ctx: PipelineContext): {
  findOwnedFormation(playerId: string, formationInstanceId: string): Record<string, any>;
  resolveFormationRemainingQiBudget(formation: Record<string, any>): number;
  resolveFormationRemainingSpiritStoneBudget(formation: Record<string, any>): number;
  setFormationRemainingQiBudget(formation: Record<string, any>, value: number): void;
  persistInstanceFormationsSoon?(instanceId: string): void;
} {
  return (ctx.deps as { worldRuntimeFormationService?: any } | null)?.worldRuntimeFormationService;
}

function resolvePlayerRuntimeService(ctx: PipelineContext): {
  spendQi?(playerId: string, amount: number): void;
  recordActivity?(playerId: string, tick: number, options?: { interruptCultivation?: boolean }): void;
} | null {
  return (ctx.deps as { playerRuntimeService?: any } | null)?.playerRuntimeService ?? null;
}

function touchRuntimeInstanceRevision(ctx: PipelineContext, instanceId: unknown): void {
  const normalizedInstanceId = typeof instanceId === 'string' && instanceId.trim() ? instanceId.trim() : '';
  if (!normalizedInstanceId) {
    return;
  }
  const instance = typeof (ctx.deps as { getInstanceRuntime?: unknown } | null)?.getInstanceRuntime === 'function'
    ? (ctx.deps as { getInstanceRuntime: (id: string) => any }).getInstanceRuntime(normalizedInstanceId)
    : typeof ctx.getInstanceRuntime === 'function'
      ? ctx.getInstanceRuntime(normalizedInstanceId)
      : null;
  if (!instance || !Number.isFinite(Number(instance.worldRevision))) {
    return;
  }
  instance.worldRevision += 1;
}

function resolveFormationMaintenanceRate(player: unknown): number {
  const output = Math.max(
    0,
    Number(
      (player as { attrs?: { numericStats?: { maxQiOutputPerTick?: unknown } }; numericStats?: { maxQiOutputPerTick?: unknown } } | null)?.attrs?.numericStats?.maxQiOutputPerTick
      ?? (player as { numericStats?: { maxQiOutputPerTick?: unknown } } | null)?.numericStats?.maxQiOutputPerTick,
    ) || 0,
  );
  return Math.max(1, Math.floor(Math.sqrt(output)));
}

function resolvePlayerId(player: unknown): string {
  const raw = (player as { playerId?: unknown; id?: unknown } | null)?.playerId
    ?? (player as { id?: unknown } | null)?.id;
  return typeof raw === 'string' ? raw.trim() : '';
}

function buildFormationResolveResult(
  completed: boolean,
  messages: TechniqueActivityNoticeMessage[],
): TechniqueActivityResolveResult {
  return {
    successCount: 0,
    failureCount: 0,
    outputs: [],
    expParams: {
      skillLevel: 1,
      targetLevel: 1,
      baseActionTicks: 0,
      successCount: 0,
      failureCount: 0,
      getExpToNextByLevel: () => 0,
    },
    completed,
    messages,
  };
}

function buildFormationNotice(
  kind: TechniqueActivityNoticeMessage['kind'],
  key: string,
  formationName: unknown,
): TechniqueActivityNoticeMessage {
  return {
    kind,
    key,
    vars: { formationName: normalizeFormationName(formationName) },
    pills: [{ key: 'formationName', style: 'target' }],
  };
}

function normalizeFormationName(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '阵法';
}
