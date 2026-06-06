/**
 * 本文件定义前后端共享类型或纯规则函数，用于统一协议、配置和玩法计算口径。
 *
 * 维护时应保持无副作用、可在浏览器与 Node 环境同时使用，不引入单端专属依赖。
 */
/**
 * 四方向工具：方向与坐标偏移的互转。
 */
import { Direction } from './world-core-types';

/** 方向及其对应的坐标偏移 */
export interface DirectionStep {
/**
 * direction：direction相关字段。
 */

  direction: Direction;  
  /**
 * dx：dx相关字段。
 */

  dx: number;  
  /**
 * dy：dy相关字段。
 */

  dy: number;
}

/** 四个基本方向及其偏移量 */
export const CARDINAL_DIRECTION_STEPS: DirectionStep[] = [
  { direction: Direction.North, dx: 0, dy: -1 },
  { direction: Direction.South, dx: 0, dy: 1 },
  { direction: Direction.East, dx: 1, dy: 0 },
  { direction: Direction.West, dx: -1, dy: 0 },
];

/** 方向枚举转坐标偏移 [dx, dy] */
export function directionToDelta(direction: Direction): [number, number] {
  const step = CARDINAL_DIRECTION_STEPS.find((entry) => entry.direction === direction);
  return step ? [step.dx, step.dy] : [0, 0];
}

/** 坐标偏移转方向枚举，无匹配返回 null */
export function deltaToDirection(dx: number, dy: number): Direction | null {
  const step = CARDINAL_DIRECTION_STEPS.find((entry) => entry.dx === dx && entry.dy === dy);
  return step?.direction ?? null;
}

/** 根据两点坐标推断主方向 */
export function directionFromTo(fromX: number, fromY: number, toX: number, toY: number): Direction {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  if (toX > fromX) return Direction.East;
  if (toX < fromX) return Direction.West;
  if (toY > fromY) return Direction.South;
  return Direction.North;
}

/** 将渲染朝向收敛为左右两向，旧的上下值按默认朝右处理。 */
export function normalizeHorizontalFacing(
  nextFacing: Direction | null | undefined,
  previousFacing?: Direction | null | undefined,
): Direction {
  if (nextFacing === Direction.East || nextFacing === Direction.West) {
    return nextFacing;
  }
  if (previousFacing === Direction.East || previousFacing === Direction.West) {
    return previousFacing;
  }
  return Direction.East;
}

/** 根据水平位移更新渲染朝向；纯垂直移动保持原有左右朝向。 */
export function horizontalFacingFromDelta(
  dx: number,
  previousFacing?: Direction | null | undefined,
): Direction {
  if (dx > 0) {
    return Direction.East;
  }
  if (dx < 0) {
    return Direction.West;
  }
  return normalizeHorizontalFacing(undefined, previousFacing);
}

/** 根据目标位置更新渲染朝向；目标在同一列时保持原有左右朝向。 */
export function horizontalFacingFromTo(
  fromX: number,
  _fromY: number,
  toX: number,
  _toY: number,
  previousFacing?: Direction | null | undefined,
): Direction {
  return horizontalFacingFromDelta(toX - fromX, previousFacing);
}
