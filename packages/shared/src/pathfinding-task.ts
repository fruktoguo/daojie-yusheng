/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 寻路任务类型定义。
 * 与 worker 任务 envelope 对齐，用于跨线程寻路请求。
 */

import type { PathPoint } from './pathfinding';

/** 寻路任务输入 */
export interface PathfindingTaskInput {
  /** 地图 ID（用于 worker 内缓存 staticGrid） */
  mapId: string;
  /** 地图版本（变更时重新传输 staticGrid） */
  mapRevision: number;
  /** 地图宽度 */
  width: number;
  /** 地图高度 */
  height: number;
  /** 静态网格：可行走标记（首次或版本变更时传输，Transferable） */
  walkable?: Uint8Array;
  /** 静态网格：移动代价（首次或版本变更时传输，Transferable） */
  traversalCost?: Uint16Array;
  /** 动态阻塞网格 */
  blocked: Uint8Array;
  /** 起点 X */
  startX: number;
  /** 起点 Y */
  startY: number;
  /** 目标点列表 */
  goals: PathPoint[];
  /** 搜索限制 */
  maxExpandedNodes: number;
  maxPathLength: number;
  maxGoalDistance?: number;
  allowPartialPath?: boolean;
}

/** 寻路任务结果 */
export interface PathfindingTaskResult {
  /** 是否成功找到路径 */
  status: 'success' | 'failed';
  /** 路径点列表（成功时） */
  path: PathPoint[];
  /** 搜索展开的节点数 */
  expandedNodes: number;
  /** 到达的目标点（成功时） */
  reachedGoal?: PathPoint;
  /** 是否完整路径 */
  complete?: boolean;
  /** 失败原因 */
  reason?: string;
}
