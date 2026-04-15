/**
 * 键盘方向输入映射常量。
 */

import { Direction } from '@mud/shared';

/** 键盘方向键到移动方向的映射。 */
export const KEY_TO_DIRECTION_MAP: Record<string, Direction> = {
  ArrowUp: Direction.North,
  ArrowDown: Direction.South,
  ArrowRight: Direction.East,
  ArrowLeft: Direction.West,
};
