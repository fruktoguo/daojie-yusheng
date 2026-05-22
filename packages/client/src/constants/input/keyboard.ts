/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
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
