/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
import type { BuildingOpeningKind, BuildingPlacementLayer, BuildingVisualLayer } from '../../building-types';

export const BUILDING_PLACEMENT_LAYERS: readonly BuildingPlacementLayer[] = [
  'structure',
  'floor',
  'facility',
  'furniture',
  'decoration',
] as const;

export const BUILDING_VISUAL_LAYERS: readonly BuildingVisualLayer[] = [
  'terrain',
  'structure',
  'furniture',
  'overlay',
] as const;

export const BUILDING_OPENING_KINDS: readonly BuildingOpeningKind[] = [
  'none',
  'door',
  'window',
] as const;

export const BUILDING_LAYER_ID_BY_KEY: Record<BuildingPlacementLayer, number> = {
  structure: 1,
  floor: 2,
  facility: 3,
  furniture: 4,
  decoration: 5,
};

export const BUILDING_VISUAL_LAYER_ID_BY_KEY: Record<BuildingVisualLayer, number> = {
  terrain: 1,
  structure: 2,
  furniture: 3,
  overlay: 4,
};

export const BUILDING_OPENING_KIND_ID_BY_KEY: Record<BuildingOpeningKind, number> = {
  none: 0,
  door: 1,
  window: 2,
};

export const BUILDING_TOPOLOGY_BLOCKS_MOVE = 1 << 0;
export const BUILDING_TOPOLOGY_BLOCKS_SIGHT = 1 << 1;
export const BUILDING_TOPOLOGY_ROOM_BOUNDARY = 1 << 2;
export const BUILDING_TOPOLOGY_SEMI_OUTDOOR_LINK = 1 << 3;

export const BUILDING_DEFAULT_MAX_HP = 100;
export const BUILDING_DEFAULT_BUILD_TICKS = 1;
export const BUILDING_DEFAULT_DECONSTRUCT_TICKS = 1;
export const BUILDING_ROOM_BOUNDARY_MAX = 100;
export const BUILDING_ROOF_COVERAGE_MAX = 100;
export const BUILDING_SHA_SHIELD_MAX = 100;
