/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
/**
 * 格距与范围判定常量。
 */

/** 全局格子距离规则，可在此切换范围判定与距离展示口径。 */
export type GridDistanceMetric = 'manhattan' | 'euclidean' | 'chebyshev';

/** 默认格子距离规则。 */
export const GAME_RANGE_DISTANCE_METRIC: GridDistanceMetric = 'euclidean';
