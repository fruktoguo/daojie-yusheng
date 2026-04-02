/**
 * 格距与范围判定常量。
 */

/** 全局格子距离规则，可在此切换范围判定与距离展示口径。 */
export type GridDistanceMetric = 'manhattan' | 'euclidean' | 'chebyshev';

/** 默认格子距离规则。 */
export const GAME_RANGE_DISTANCE_METRIC: GridDistanceMetric = 'euclidean';
