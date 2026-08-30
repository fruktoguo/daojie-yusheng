import type {
  DungeonDefinition,
  DungeonPresentationActionStep,
  DungeonPresentationActiveAction,
  DungeonPresentationCondition,
  DungeonPresentationDialogueStep,
  DungeonPresentationRunState,
  DungeonPresentationStep,
  DungeonRunState,
} from '@mud/shared';
import { DUNGEON_PRESSURE_BUFF_ID } from '@mud/shared';

export interface DungeonPresentationControllerContext {
  getInstance(run: DungeonRunState): any;
  getPlayer(playerId: string): any;
  resolveActorPosition(run: DungeonRunState, actor: DungeonPresentationStep['actor']): { x: number; y: number } | null;
  pushDialogueBubble(run: DungeonRunState, position: { x: number; y: number }, text: string, durationMs: number): void;
  applyActions(run: DungeonRunState, actions: readonly DungeonPresentationActiveAction[]): Set<string>;
}

/**
 * 通用剧情演出控制器：只推进对白和行动表现，不参与副本房间、伤害或结算裁定。
 */
export class DungeonPresentationController {
  onRunCreated(run: DungeonRunState, definition: DungeonDefinition, context: DungeonPresentationControllerContext): void {
    const steps = definition.presentation?.onRunCreated ?? [];
    if (steps.length === 0) return;
    const presentation = ensurePresentationState(run);
    if (presentation.completedStepIds.length > 0 || presentation.pendingSteps.length > 0 || presentation.activeActions.length > 0) {
      return;
    }
    const maxPartyRealmLv = resolveMaxPartyRealmLv(run, context);
    for (const step of steps) {
      if (presentation.completedStepIds.includes(step.stepId)) continue;
      if (!matchesCondition(step.condition, maxPartyRealmLv)) {
        presentation.completedStepIds.push(step.stepId);
        continue;
      }
      if (step.type === 'dialogue') {
        if (this.emitDialogue(run, step, context)) presentation.completedStepIds.push(step.stepId);
        continue;
      }
      const delayTicks = Math.max(0, Math.trunc(Number(step.delayTicks) || 0));
      if (delayTicks > 0) {
        presentation.completedStepIds.push(step.stepId);
        presentation.pendingSteps.push({ stepId: step.stepId, remainingTicks: delayTicks });
      } else {
        if (this.activateAction(run, step, presentation, context)) presentation.completedStepIds.push(step.stepId);
      }
    }
  }

  onTick(run: DungeonRunState, definition: DungeonDefinition, context: DungeonPresentationControllerContext): void {
    const steps = definition.presentation?.onRunCreated ?? [];
    const presentation = run.presentation;
    if (!presentation) return;
    const stepById = new Map(steps.map((step) => [step.stepId, step]));
    if (presentation.pendingSteps.length > 0) {
      const pending: typeof presentation.pendingSteps = [];
      for (const entry of presentation.pendingSteps) {
        const remainingTicks = Math.max(0, Math.trunc(Number(entry.remainingTicks) || 0) - 1);
        if (remainingTicks > 0) {
          pending.push({ ...entry, remainingTicks });
          continue;
        }
        const step = stepById.get(entry.stepId);
        if (step?.type === 'action' && !this.activateAction(run, step, presentation, context)) {
          pending.push({ ...entry, remainingTicks: 1 });
        }
      }
      presentation.pendingSteps = pending;
    }

    const activeActions = presentation.activeActions;
    const appliedActionIds = activeActions.length > 0
      ? context.applyActions(run, activeActions)
      : new Set<string>();
    const nextActions: DungeonPresentationActiveAction[] = [];
    for (const action of presentation.activeActions) {
      if (isPressureAction(action) && !appliedActionIds.has(action.stepId)) continue;
      if (action.remainingTicks !== undefined) {
        const remainingTicks = Math.max(0, Math.trunc(Number(action.remainingTicks) || 0) - 1);
        if (remainingTicks <= 0) continue;
        nextActions.push({ ...action, remainingTicks });
      } else {
        nextActions.push(action);
      }
    }
    presentation.activeActions = nextActions;
  }

  onAbort(run: DungeonRunState): void {
    if (!run.presentation) return;
    run.presentation.pendingSteps = [];
    run.presentation.activeActions = [];
  }

  private emitDialogue(
    run: DungeonRunState,
    step: DungeonPresentationDialogueStep,
    context: DungeonPresentationControllerContext,
  ): boolean {
    const position = context.resolveActorPosition(run, step.actor);
    if (!position || !step.text.trim()) return false;
    context.pushDialogueBubble(run, position, step.text.trim(), Math.max(500, Math.trunc(Number(step.durationMs) || 3_000)));
    return true;
  }

  private activateAction(
    run: DungeonRunState,
    step: DungeonPresentationActionStep,
    presentation: DungeonPresentationRunState,
    context: DungeonPresentationControllerContext,
  ): boolean {
    if (presentation.activeActions.some((action) => action.stepId === step.stepId)) return true;
    const actorPosition = context.resolveActorPosition(run, step.actor);
    if (!actorPosition) return false;
    presentation.activeActions.push({
      stepId: step.stepId,
      actionId: step.actionId,
      actor: step.actor,
      ...(step.durationTicks === undefined ? {} : { remainingTicks: Math.max(1, Math.trunc(step.durationTicks)) }),
      startedAtTick: Math.max(0, Math.trunc(Number(context.getInstance(run)?.tick) || 0)),
      ...(step.params ? { params: { ...step.params } } : {}),
    });
    return true;
  }
}

function ensurePresentationState(run: DungeonRunState): DungeonPresentationRunState {
  if (!run.presentation) {
    run.presentation = { completedStepIds: [], pendingSteps: [], activeActions: [] };
  }
  run.presentation.completedStepIds ??= [];
  run.presentation.pendingSteps ??= [];
  run.presentation.activeActions ??= [];
  return run.presentation;
}

function resolveMaxPartyRealmLv(run: DungeonRunState, context: DungeonPresentationControllerContext): number {
  let maxRealmLv = 1;
  for (const member of run.members) {
    const player = context.getPlayer(member.playerId);
    const realmLv = Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv ?? 1) || 1));
    maxRealmLv = Math.max(maxRealmLv, realmLv);
  }
  return maxRealmLv;
}

function matchesCondition(condition: DungeonPresentationCondition | undefined, maxPartyRealmLv: number): boolean {
  if (!condition) return true;
  if (condition.maxPartyRealmLv !== undefined && maxPartyRealmLv > condition.maxPartyRealmLv) return false;
  if (condition.minPartyRealmLv !== undefined && maxPartyRealmLv < condition.minPartyRealmLv) return false;
  return true;
}

function isPressureAction(action: DungeonPresentationActiveAction): boolean {
  const actionId = action.actionId.trim().toLowerCase();
  return actionId === DUNGEON_PRESSURE_BUFF_ID || actionId === 'pressure' || action.actionId === '威压';
}
