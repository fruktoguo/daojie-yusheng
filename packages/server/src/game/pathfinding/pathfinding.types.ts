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

/** PathfindingActorType：定义该类型的结构与数据语义。 */
export type PathfindingActorType = 'player' | 'monster';

/** PathRequestKind：定义该类型的结构与数据语义。 */
export type PathRequestKind =
  | 'player_move_to'
  | 'player_repath'
  | 'bot_roam';

/** PathfindingTask：定义该接口的能力与字段约束。 */
export interface PathfindingTask {
/** requestId：定义该变量以承载业务值。 */
  requestId: string;
/** actorId：定义该变量以承载业务值。 */
  actorId: string;
/** actorType：定义该变量以承载业务值。 */
  actorType: PathfindingActorType;
/** kind：定义该变量以承载业务值。 */
  kind: PathRequestKind;
/** priority：定义该变量以承载业务值。 */
  priority: number;
/** moveSpeed：定义该变量以承载业务值。 */
  moveSpeed: number;
/** enqueueOrder：定义该变量以承载业务值。 */
  enqueueOrder: number;
/** startX：定义该变量以承载业务值。 */
  startX: number;
/** startY：定义该变量以承载业务值。 */
  startY: number;
/** goals：定义该变量以承载业务值。 */
  goals: PathPoint[];
/** staticGrid：定义该变量以承载业务值。 */
  staticGrid: PathfindingStaticGrid;
/** blocked：定义该变量以承载业务值。 */
  blocked: Uint8Array;
  cancelFlag?: Int32Array;
  enqueuedAtMs?: number;
/** limits：定义该变量以承载业务值。 */
  limits: PathfindingSearchLimits;
}

/** PathfindingTaskResult：定义该类型的结构与数据语义。 */
export type PathfindingTaskResult = PathfindingSearchResult & {
/** requestId：定义该变量以承载业务值。 */
  requestId: string;
/** actorId：定义该变量以承载业务值。 */
  actorId: string;
/** kind：定义该变量以承载业务值。 */
  kind: PathRequestKind;
/** mapId：定义该变量以承载业务值。 */
  mapId: string;
/** mapRevision：定义该变量以承载业务值。 */
  mapRevision: number;
/** elapsedMs：定义该变量以承载业务值。 */
  elapsedMs: number;
};

