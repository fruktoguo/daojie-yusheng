import { C2S, S2C } from './protocol';
import {
  type TechniqueActivityKind,
  RUNTIME_TECHNIQUE_ACTIVITY_KINDS,
  type RuntimeTechniqueActivityKind,
} from './technique-activity-types';

export type TechniqueActivityRequestEventName =
  | typeof C2S.RequestAlchemyPanel
  | typeof C2S.RequestEnhancementPanel;

export type TechniqueActivityStartEventName =
  | typeof C2S.StartAlchemy
  | typeof C2S.StartEnhancement;

export type TechniqueActivityCancelEventName =
  | typeof C2S.CancelAlchemy
  | typeof C2S.CancelEnhancement;

export type TechniqueActivityPanelEventName =
  | typeof S2C.AlchemyPanel
  | typeof S2C.EnhancementPanel;

export type TechniqueActivityCommandKind =
  | 'startAlchemy'
  | 'cancelAlchemy'
  | 'startEnhancement'
  | 'cancelEnhancement'
  | 'startGather'
  | 'cancelGather';

export type TechniqueActivityRequestPanelErrorCode =
  | 'REQUEST_ALCHEMY_PANEL_FAILED'
  | 'REQUEST_ENHANCEMENT_PANEL_FAILED';

export type TechniqueActivityStartErrorCode =
  | 'START_ALCHEMY_FAILED'
  | 'START_ENHANCEMENT_FAILED';

export type TechniqueActivityCancelErrorCode =
  | 'CANCEL_ALCHEMY_FAILED'
  | 'CANCEL_ENHANCEMENT_FAILED';

export interface TechniqueActivityMetadata {
  kind: RuntimeTechniqueActivityKind;
  requestEvent: TechniqueActivityRequestEventName;
  startEvent: TechniqueActivityStartEventName;
  cancelEvent: TechniqueActivityCancelEventName;
  panelEvent: TechniqueActivityPanelEventName;
  startCommandKind: TechniqueActivityCommandKind;
  cancelCommandKind: TechniqueActivityCommandKind;
  requestPanelErrorCode: TechniqueActivityRequestPanelErrorCode;
  startErrorCode: TechniqueActivityStartErrorCode;
  cancelErrorCode: TechniqueActivityCancelErrorCode;
}

export const TECHNIQUE_ACTIVITY_METADATA = {
  alchemy: {
    kind: 'alchemy',
    requestEvent: C2S.RequestAlchemyPanel,
    startEvent: C2S.StartAlchemy,
    cancelEvent: C2S.CancelAlchemy,
    panelEvent: S2C.AlchemyPanel,
    startCommandKind: 'startAlchemy',
    cancelCommandKind: 'cancelAlchemy',
    requestPanelErrorCode: 'REQUEST_ALCHEMY_PANEL_FAILED',
    startErrorCode: 'START_ALCHEMY_FAILED',
    cancelErrorCode: 'CANCEL_ALCHEMY_FAILED',
  },
  enhancement: {
    kind: 'enhancement',
    requestEvent: C2S.RequestEnhancementPanel,
    startEvent: C2S.StartEnhancement,
    cancelEvent: C2S.CancelEnhancement,
    panelEvent: S2C.EnhancementPanel,
    startCommandKind: 'startEnhancement',
    cancelCommandKind: 'cancelEnhancement',
    requestPanelErrorCode: 'REQUEST_ENHANCEMENT_PANEL_FAILED',
    startErrorCode: 'START_ENHANCEMENT_FAILED',
    cancelErrorCode: 'CANCEL_ENHANCEMENT_FAILED',
  },
} as const satisfies Record<RuntimeTechniqueActivityKind, TechniqueActivityMetadata>;

export type TechniqueActivityMetadataByKind = typeof TECHNIQUE_ACTIVITY_METADATA;

export function getTechniqueActivityMetadata<K extends RuntimeTechniqueActivityKind>(
  kind: K,
): TechniqueActivityMetadataByKind[K] {
  return TECHNIQUE_ACTIVITY_METADATA[kind];
}

export function listTechniqueActivityMetadataKinds(): readonly RuntimeTechniqueActivityKind[] {
  return RUNTIME_TECHNIQUE_ACTIVITY_KINDS;
}

export function resolveTechniqueActivityStartCommandKind(kind: TechniqueActivityKind): TechniqueActivityCommandKind {
  switch (kind) {
    case 'alchemy':
      return 'startAlchemy';
    case 'enhancement':
      return 'startEnhancement';
    case 'gather':
      return 'startGather';
  }
}

export function resolveTechniqueActivityCancelCommandKind(kind: TechniqueActivityKind): TechniqueActivityCommandKind {
  switch (kind) {
    case 'alchemy':
      return 'cancelAlchemy';
    case 'enhancement':
      return 'cancelEnhancement';
    case 'gather':
      return 'cancelGather';
  }
}
