/**
 * 寻路调度与 worker 协议类型。
 */

export type PathfindingActorType = 'player' | 'monster';

export type PathRequestKind =
  | 'player_move_to'
  | 'player_repath'
  | 'bot_roam';

export type PathResultFailureReason =
  | 'no_path'
  | 'step_limit'
  | 'path_too_long'
  | 'target_too_far'
  | 'invalid_goal';

export interface PathPoint {
  x: number;
  y: number;
}

export interface PathfindingStaticGrid {
  mapId: string;
  mapRevision: number;
  width: number;
  height: number;
  walkable: Uint8Array;
  traversalCost: Uint16Array;
}

export interface PathfindingSearchLimits {
  maxExpandedNodes: number;
  maxPathLength: number;
  maxGoalDistance?: number;
  allowPartialPath?: boolean;
}

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
  limits: PathfindingSearchLimits;
}

export interface PathfindingSearchSuccess {
  status: 'success';
  path: PathPoint[];
  expandedNodes: number;
  reachedGoal: PathPoint;
  complete: boolean;
}

export interface PathfindingSearchFailure {
  status: 'failed';
  reason: PathResultFailureReason;
  expandedNodes: number;
}

export type PathfindingSearchResult = PathfindingSearchSuccess | PathfindingSearchFailure;

export type PathfindingTaskResult = PathfindingSearchResult & {
  requestId: string;
  actorId: string;
  kind: PathRequestKind;
  mapId: string;
  mapRevision: number;
  elapsedMs: number;
};
