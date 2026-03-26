/**
 * 寻路调度与 worker 协议类型。
 */

import type {
  PathPoint,
  PathfindingSearchLimits,
  PathfindingSearchResult,
  PathfindingStaticGrid,
} from '@mud/shared';

export type {
  PathPoint,
  PathfindingSearchFailure,
  PathfindingSearchLimits,
  PathfindingSearchResult,
  PathfindingSearchSuccess,
  PathfindingStaticGrid,
  PathResultFailureReason,
} from '@mud/shared';

export type PathfindingActorType = 'player' | 'monster';

export type PathRequestKind =
  | 'player_move_to'
  | 'player_repath'
  | 'bot_roam';

export interface PathfindingTask {
  requestId: string;
  actorId: string;
  actorType: PathfindingActorType;
  kind: PathRequestKind;
  priority: number;
  moveSpeed: number;
  enqueueOrder: number;
  startX: number;
  startY: number;
  goals: PathPoint[];
  staticGrid: PathfindingStaticGrid;
  blocked: Uint8Array;
  cancelFlag?: Int32Array;
  enqueuedAtMs?: number;
  limits: PathfindingSearchLimits;
}

export type PathfindingTaskResult = PathfindingSearchResult & {
  requestId: string;
  actorId: string;
  kind: PathRequestKind;
  mapId: string;
  mapRevision: number;
  elapsedMs: number;
};
