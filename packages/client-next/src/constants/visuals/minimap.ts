/**
 * 小地图模块视觉常量。
 * 仅包含在视觉层面复用的空容器与缩放上下限，避免每次渲染都重新创建实例。
 */
import { GroundItemPileView } from '@mud/shared-next';

export const EMPTY_VISIBLE_TILES = new Set<string>();
export const EMPTY_GROUND_PILES = new Map<string, GroundItemPileView>();
export const MIN_MODAL_ZOOM = 1;
export const MAX_MODAL_ZOOM = 8;
