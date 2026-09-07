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

interface DungeonPresentationMonsterAction {
 kind?: unknown;
 skillId?: unknown;
 actionId?: unknown;
}

/**
 * 通用剧情演出控制器：只推进对白和行动表现，不参与副本房间、伤害或结算裁定。
 */
export class DungeonPresentationController {
 onRunCreated(run: DungeonRunState, definition: DungeonDefinition, context: DungeonPresentationControllerContext): void {
  const rawSteps = definition.presentation?.onRunCreated ?? [];
  // 怪物开怪对白与阶段必须在开怪时触发，绝不能在副本刚创建时提前弹出
  const steps = rawSteps.filter((step) => step.actor?.kind !== 'monster');
  if (steps.length === 0) return;
  const presentation = ensurePresentationState(run);
  if (presentation.completedStepIds.length > 0 || presentation.pendingSteps.length > 0 || presentation.activeActions.length > 0) {
   return;
  }
  const maxPartyRealmLv = resolveMaxPartyRealmLv(run, context);
  this.processSteps(run, steps, presentation, maxPartyRealmLv, context);
 }

 /** 当副本怪物首次受到玩家攻击并进入战斗时触发开怪剧情表现，并返回说话阶段持续 tick 数。 */
 onMonsterEngaged(
  run: DungeonRunState,
  definition: DungeonDefinition,
  monsterId: string,
  context: DungeonPresentationControllerContext,
 ): number {
  const rawSteps = definition.presentation?.onCombatEngaged
   ?? (definition.presentation?.onRunCreated ?? []).filter((s) => s.actor?.kind === 'monster' && s.actor?.id === monsterId);
  if (!rawSteps || rawSteps.length === 0) return 0;
  const steps = rawSteps.filter((s) => s.actor?.id === monsterId);
  if (steps.length === 0) return 0;
  const presentation = ensurePresentationState(run);
  const maxPartyRealmLv = resolveMaxPartyRealmLv(run, context);
  let speechDurationMs = 0;
  for (const step of steps) {
   if (presentation.completedStepIds.includes(step.stepId)) continue;
   if (!matchesCondition(step.condition, maxPartyRealmLv)) {
    presentation.completedStepIds.push(step.stepId);
    continue;
   }
   if (step.type === 'dialogue') {
    const duration = Math.max(500, Math.trunc(Number(step.durationMs) || 3000));
    if (this.emitDialogue(run, step, context)) {
     presentation.completedStepIds.push(step.stepId);
     speechDurationMs = Math.max(speechDurationMs, duration);
    }
    continue;
   }
   const delayTicks = Math.max(0, Math.trunc(Number(step.delayTicks) || 0));
   if (delayTicks > 0) {
    presentation.completedStepIds.push(step.stepId);
    if (!presentation.pendingSteps.some((entry) => entry.stepId === step.stepId)) {
     presentation.pendingSteps.push({ stepId: step.stepId, remainingTicks: delayTicks });
    }
    continue;
   }
   if (this.activateAction(run, step, presentation, context)) {
    presentation.completedStepIds.push(step.stepId);
   }
  }
  return speechDurationMs > 0 ? Math.max(1, Math.ceil(speechDurationMs / 1000)) : 0;
 }

 /** 在怪物行动已经由 AI 排入当前 tick、但尚未应用战斗效果时触发剧情表现。 */
 onMonsterActions(
  run: DungeonRunState,
  definition: DungeonDefinition,
  actions: readonly DungeonPresentationMonsterAction[],
  context: DungeonPresentationControllerContext,
 ): void {
  const triggers = definition.presentation?.onMonsterAction ?? [];
  if (triggers.length === 0 || actions.length === 0) return;
  const actionIds = new Set<string>();
  for (const action of actions) {
   for (const candidate of [action.skillId, action.actionId]) {
    if (typeof candidate !== 'string' || candidate.trim().length === 0) continue;
    actionIds.add(candidate.trim().toLowerCase());
   }
  }
  if (actionIds.size === 0) return;
  const presentation = ensurePresentationState(run);
  const maxPartyRealmLv = resolveMaxPartyRealmLv(run, context);
  for (const trigger of triggers) {
   if (!actionIds.has(trigger.actionId.trim().toLowerCase())) continue;
   this.processSteps(run, trigger.steps, presentation, maxPartyRealmLv, context);
  }
 }

 onTick(run: DungeonRunState, definition: DungeonDefinition, context: DungeonPresentationControllerContext): void {
  const steps = collectPresentationSteps(definition);
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

 private processSteps(
  run: DungeonRunState,
  steps: readonly DungeonPresentationStep[],
  presentation: DungeonPresentationRunState,
  maxPartyRealmLv: number,
  context: DungeonPresentationControllerContext,
 ): void {
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
    if (!presentation.pendingSteps.some((entry) => entry.stepId === step.stepId)) {
     presentation.pendingSteps.push({ stepId: step.stepId, remainingTicks: delayTicks });
    }
    continue;
   }
   if (this.activateAction(run, step, presentation, context)) presentation.completedStepIds.push(step.stepId);
  }
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

function collectPresentationSteps(definition: DungeonDefinition): DungeonPresentationStep[] {
 const steps = [
  ...(definition.presentation?.onRunCreated ?? []),
  ...(definition.presentation?.onCombatEngaged ?? []),
 ];
 for (const trigger of definition.presentation?.onMonsterAction ?? []) steps.push(...trigger.steps);
 return steps;
}
