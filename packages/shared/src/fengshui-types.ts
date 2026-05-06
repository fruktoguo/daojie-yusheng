import type { FiveElement } from './building-types';

export type RoomRole =
  | 'generic'
  | 'outdoor'
  | 'courtyard'
  | 'meditation'
  | 'alchemy'
  | 'artifact'
  | 'storage'
  | 'bedroom'
  | 'sect_hall'
  | 'formation_core';

export type FengShuiGrade =
  | 'calamity'
  | 'disaster'
  | 'great_bad'
  | 'bad'
  | 'minor_bad'
  | 'plain'
  | 'minor_good'
  | 'good'
  | 'great_good'
  | 'blessed'
  | 'paradise';

export type FengShuiReasonSeverity = 'info' | 'good' | 'warning' | 'bad';

export interface RoomInstance {
  id: string;
  instanceId: string;
  role: RoomRole;
  enclosed: boolean;
  semiOutdoor: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  perimeter: number;
  doorCount: number;
  windowCount: number;
  roofCoverageRatio: number;
  ownerPlayerId?: string | null;
  ownerSectId?: string | null;
  roomHash: string;
  topologyRevision: number;
  contentRevision: number;
  updatedAtTick: number;
}

export interface FengShuiReason {
  code: string;
  delta: number;
  severity: FengShuiReasonSeverity;
  params?: Record<string, string | number>;
}

export interface FengShuiSnapshot {
  instanceId: string;
  roomId: string;
  score: number;
  grade: FengShuiGrade;
  primaryElement: FiveElement;
  functionElement: FiveElement;
  shapeScore: number;
  enclosureScore: number;
  qiScore: number;
  shaScore: number;
  comfortScore: number;
  integrityScore: number;
  elementScore: number;
  formationScore: number;
  reasons: FengShuiReason[];
  revision: number;
  updatedAtTick: number;
}

export interface BuildPlaceIntentView {
  requestId: string;
  defId: string;
  x: number;
  y: number;
  rotation?: 0 | 90 | 180 | 270;
  buildStrength?: number;
  selectedMaterialItemIds?: string[];
}

export interface BuildDeconstructIntentView {
  requestId: string;
  buildingId: string;
}

export interface RoomSetRoleRequestView {
  requestId: string;
  roomId: string;
  role: RoomRole;
}

export interface FengShuiObserveRequestView {
  roomId?: string;
  x?: number;
  y?: number;
  overlay?: boolean;
  revision?: number;
}

export interface BuildingInstanceView {
  id: string;
  defId: string;
  x: number;
  y: number;
  rotation: 0 | 90 | 180 | 270;
  state: string;
  roomId?: string | null;
  hp?: number;
  maxHp?: number;
  buildStrength?: number;
  builderSkillLevel?: number;
  buildCompleteTick?: number;
  buildRemainingTicks?: number;
  activeBuilderPlayerId?: string | null;
  revision: number;
}

export interface BuildResultView {
  requestId: string;
  ok: boolean;
  reason?: string;
  building?: BuildingInstanceView;
  consumedItems?: Array<{ itemId: string; count: number }>;
}

export interface RoomSummaryView {
  id: string;
  role: RoomRole;
  enclosed: boolean;
  semiOutdoor: boolean;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
  doorCount: number;
  windowCount: number;
  roofCoverageRatio: number;
  revision: number;
}

export interface RoomSummaryPatchView {
  instanceId: string;
  revision: number;
  adds?: RoomSummaryView[];
  updates?: RoomSummaryView[];
  removes?: string[];
}

export interface FengShuiOverlayCellView {
  x: number;
  y: number;
  roomId: string;
  score: number;
  grade: FengShuiGrade;
  revision: number;
}

export interface FengShuiOverlayPatchView {
  instanceId: string;
  revision: number;
  cells: FengShuiOverlayCellView[];
}

export interface FengShuiDetailView {
  room: RoomSummaryView;
  fengShui: FengShuiSnapshot;
}
