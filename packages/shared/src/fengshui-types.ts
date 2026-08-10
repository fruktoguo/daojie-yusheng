/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
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
  /** 建筑实体已投影时提交稳定 ID；服务端不会在 ID 失效时改拆同格其它建筑。 */
  buildingId?: string;
  /** 仅以地块视觉呈现的完工建筑通过可见格坐标交由服务端权威解析。 */
  x?: number;
  y?: number;
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
  deconstructRemainingTicks?: number;
  activeDeconstructorPlayerId?: string | null;
  revision: number;
}

export interface BuildResultView {
  requestId: string;
  ok: boolean;
  reason?: string;
  building?: BuildingInstanceView;
  consumedItems?: Array<{ itemId: string; count: number }>;
  /** 非所有人拆除已进入逐息营造任务，而不是立即删除建筑。 */
  deconstructStarted?: boolean;
  deconstructTicks?: number;
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
