import type {
  ActiveJobProgress,
  PanelKind,
  PanelPatch,
  PlayerFeedback,
  PlayerStateDelta,
  TickEventBusPayload,
} from '@mud/shared';

export interface TickEventBusConsumerHandlers {
  appendNotices?: (items: NonNullable<TickEventBusPayload['notices']>) => void;
  applyPanelPatches?: (patches: Record<PanelKind, PanelPatch>) => void;
  updateJobProgress?: (jobs: ActiveJobProgress[]) => void;
  markTechniqueDirty?: (kinds: NonNullable<TickEventBusPayload['techniqueDirty']>) => void;
  applyStateDelta?: (delta: PlayerStateDelta) => void;
  showFeedback?: (items: PlayerFeedback[]) => void;
  enqueueCombatEffects?: (effects: NonNullable<TickEventBusPayload['combatEffects']>) => void;
  enqueueAoiEffects?: (effects: NonNullable<TickEventBusPayload['aoiEffects']>) => void;
}

export function handleTickEventBusPayload(
  payload: TickEventBusPayload,
  handlers: TickEventBusConsumerHandlers,
): void {
  if (payload.notices?.length) {
    handlers.appendNotices?.(payload.notices);
  }
  if (payload.panelPatches && Object.keys(payload.panelPatches).length > 0) {
    handlers.applyPanelPatches?.(payload.panelPatches);
  }
  if (payload.jobProgress && Object.keys(payload.jobProgress).length > 0) {
    handlers.updateJobProgress?.(Object.values(payload.jobProgress));
  }
  if (payload.techniqueDirty?.length) {
    handlers.markTechniqueDirty?.(payload.techniqueDirty);
  }
  if (payload.stateDelta) {
    handlers.applyStateDelta?.(payload.stateDelta);
  }
  if (payload.feedbacks?.length) {
    handlers.showFeedback?.(payload.feedbacks);
  }
  if (payload.combatEffects?.length) {
    handlers.enqueueCombatEffects?.(payload.combatEffects);
  }
  if (payload.aoiEffects?.length) {
    handlers.enqueueAoiEffects?.(payload.aoiEffects);
  }
}
