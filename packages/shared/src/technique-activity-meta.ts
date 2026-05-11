import { C2S, S2C } from './protocol';
import {
  type TechniqueActivityKind,
  RUNTIME_TECHNIQUE_ACTIVITY_KINDS,
  type RuntimeTechniqueActivityKind,
} from './technique-activity-types';

export type TechniqueActivityRequestEventName =
  | typeof C2S.RequestAlchemyPanel
  | typeof C2S.RequestEnhancementPanel
  | null;

export type TechniqueActivityStartEventName =
  | typeof C2S.StartAlchemy
  | typeof C2S.StartEnhancement
  | typeof C2S.StartGather
  | null;

export type TechniqueActivityCancelEventName =
  | typeof C2S.CancelAlchemy
  | typeof C2S.CancelEnhancement
  | typeof C2S.CancelGather
  | null;

export type TechniqueActivityPanelEventName =
  | typeof S2C.AlchemyPanel
  | typeof S2C.EnhancementPanel
  | null;

export type TechniqueActivityCommandKind =
  | 'startAlchemy'
  | 'cancelAlchemy'
  | 'startForging'
  | 'cancelForging'
  | 'startEnhancement'
  | 'cancelEnhancement'
  | 'startGather'
  | 'cancelGather'
  | 'startBuilding'
  | 'cancelBuilding';

export type TechniqueActivityRequestPanelErrorCode =
  | 'REQUEST_ALCHEMY_PANEL_FAILED'
  | 'REQUEST_ENHANCEMENT_PANEL_FAILED';

export type TechniqueActivityStartErrorCode =
  | 'START_ALCHEMY_FAILED'
  | 'START_FORGING_FAILED'
  | 'START_ENHANCEMENT_FAILED'
  | 'START_GATHER_FAILED'
  | 'START_BUILDING_FAILED';

export type TechniqueActivityCancelErrorCode =
  | 'CANCEL_ALCHEMY_FAILED'
  | 'CANCEL_FORGING_FAILED'
  | 'CANCEL_ENHANCEMENT_FAILED'
  | 'CANCEL_GATHER_FAILED'
  | 'CANCEL_BUILDING_FAILED';

export interface TechniqueActivityMetadata {
  kind: RuntimeTechniqueActivityKind;
  requestEvent: TechniqueActivityRequestEventName;
  startEvent: TechniqueActivityStartEventName;
  cancelEvent: TechniqueActivityCancelEventName;
  panelEvent: TechniqueActivityPanelEventName;
  startCommandKind: TechniqueActivityCommandKind;
  cancelCommandKind: TechniqueActivityCommandKind;
  requestPanelErrorCode: TechniqueActivityRequestPanelErrorCode | null;
  startErrorCode: TechniqueActivityStartErrorCode;
  cancelErrorCode: TechniqueActivityCancelErrorCode;
  /** 是否为条件型技艺（需要持续满足外部条件）。 */
  conditional?: boolean;
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
  forging: {
    kind: 'forging',
    requestEvent: C2S.RequestAlchemyPanel,
    startEvent: C2S.StartAlchemy,
    cancelEvent: C2S.CancelAlchemy,
    panelEvent: S2C.AlchemyPanel,
    startCommandKind: 'startForging',
    cancelCommandKind: 'cancelForging',
    requestPanelErrorCode: 'REQUEST_ALCHEMY_PANEL_FAILED',
    startErrorCode: 'START_FORGING_FAILED',
    cancelErrorCode: 'CANCEL_FORGING_FAILED',
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
  gather: {
    kind: 'gather',
    requestEvent: null,
    startEvent: C2S.StartGather,
    cancelEvent: C2S.CancelGather,
    panelEvent: null,
    startCommandKind: 'startGather',
    cancelCommandKind: 'cancelGather',
    requestPanelErrorCode: null,
    startErrorCode: 'START_GATHER_FAILED',
    cancelErrorCode: 'CANCEL_GATHER_FAILED',
    conditional: true,
  },
  building: {
    kind: 'building',
    requestEvent: null,
    startEvent: null,
    cancelEvent: null,
    panelEvent: null,
    startCommandKind: 'startBuilding',
    cancelCommandKind: 'cancelBuilding',
    requestPanelErrorCode: null,
    startErrorCode: 'START_BUILDING_FAILED',
    cancelErrorCode: 'CANCEL_BUILDING_FAILED',
    conditional: true,
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
    case 'forging':
      return 'startForging';
    case 'enhancement':
      return 'startEnhancement';
    case 'gather':
      return 'startGather';
    case 'building':
      return 'startBuilding';
  }
}

export function resolveTechniqueActivityCancelCommandKind(kind: TechniqueActivityKind): TechniqueActivityCommandKind {
  switch (kind) {
    case 'alchemy':
      return 'cancelAlchemy';
    case 'forging':
      return 'cancelForging';
    case 'enhancement':
      return 'cancelEnhancement';
    case 'gather':
      return 'cancelGather';
    case 'building':
      return 'cancelBuilding';
  }
}
