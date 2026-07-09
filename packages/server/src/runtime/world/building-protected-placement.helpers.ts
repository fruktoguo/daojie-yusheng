/**
 * 本文件属于服务端权威运行时，负责建筑放置的受保护点位校验。
 *
 * 与阵法/宗门共用的 protected-placement.helpers 不同，建筑会长期占据地块并阻挡移动，
 * 因此除了「不能压在保护点位上」，还必须保证保护点位「周围一圈」保持可通行，
 * 否则玩家可以用墙把传送点、NPC、出生点围死。
 *
 * 保护范围：
 * - 传送点（地图固有）：3x3 邻域
 * - 同图传送着陆格（本图传送点 targetMapId 指回本图时的 targetX/targetY）：3x3 邻域
 * - 出生点 spawnX/spawnY：3x3 邻域
 * - NPC：3x3 邻域
 * - 安全区：整个安全区范围（安全区自带 radius，不再额外外扩）
 *
 * 跨图传送的着陆格不在此处保护：本图只能看到自己的传送点，而跨图落点通常本身
 * 就是一个回程传送点，已由上面的本格 + 邻域规则覆盖。
 *
 * 宗门山门（带 sectId 的 runtime 传送点）只保护本格，不做邻域外扩，
 * 否则宗门无法在自家山门旁边营建。
 */

import {
  PROTECTED_PLACEMENT_CONFLICT_REASONS,
  hasRuntimeNpcAtTile,
  type RuntimePoint,
} from './protected-placement.helpers';

/** 建筑禁建邻域半径：切比雪夫距离 1，即以保护点位为中心的 3x3 共 9 格。 */
export const BUILDING_PROTECTED_PLACEMENT_RADIUS = 1;

export const BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS = {
  ...PROTECTED_PLACEMENT_CONFLICT_REASONS,
  spawn: 'protected_placement_spawn',
} as const;

export type BuildingProtectedPlacementConflictReason =
  typeof BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS[
    keyof typeof BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS
  ];

export type BuildingProtectedPlacementCheckResult =
  | { ok: true }
  | { ok: false; reason: BuildingProtectedPlacementConflictReason; x: number; y: number };

interface BuildingProtectedPlacementContext {
  portals: readonly any[];
  currentMapId: string;
  spawnX: number;
  spawnY: number;
}

/**
 * findBuildingProtectedPlacementConflict：建筑放置/启动自检的权威受保护点位校验。
 *
 * points 为建筑锚点与 footprint 覆盖的全部地块；任一格落入保护范围即拒绝。
 */
export function findBuildingProtectedPlacementConflict(
  instance: unknown,
  points: Iterable<RuntimePoint>,
): BuildingProtectedPlacementCheckResult {
  const context = resolveContext(instance);
  for (const point of points) {
    const x = Math.trunc(Number(point?.x));
    const y = Math.trunc(Number(point?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    if (isInBounds(instance, x, y) === false) {
      continue;
    }
    const conflict = findConflictAtCell(instance, context, x, y);
    if (conflict) {
      return { ok: false, reason: conflict, x, y };
    }
  }
  return { ok: true };
}

export function formatBuildingProtectedPlacementConflictReason(reason: string | undefined): string {
  if (reason === BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.portal) {
    return '不能建造在传送点附近';
  }
  if (reason === BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.npc) {
    return '不能建造在场景人物附近';
  }
  if (reason === BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.spawn) {
    return '不能建造在出生点附近';
  }
  if (reason === BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.safeZone) {
    return '不能建造在安全区内';
  }
  return '不能建造在受保护点位';
}

function findConflictAtCell(
  instance: unknown,
  context: BuildingProtectedPlacementContext,
  x: number,
  y: number,
): BuildingProtectedPlacementConflictReason | null {
  const runtime = instance as any;
  if (typeof runtime?.getSafeZoneAtTile === 'function' && runtime.getSafeZoneAtTile(x, y)) {
    return BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.safeZone;
  }
  if (isWithinRadius(x, y, context.spawnX, context.spawnY)) {
    return BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.spawn;
  }
  const radius = BUILDING_PROTECTED_PLACEMENT_RADIUS;
  for (let dy = -radius; dy <= radius; dy += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      const portal = typeof runtime?.getPortalAtTile === 'function'
        ? runtime.getPortalAtTile(x + dx, y + dy)
        : null;
      // 宗门山门只保护本格，避免宗门无法在自家山门旁营建。
      if (portal && (isMapPortal(portal) || (dx === 0 && dy === 0))) {
        return BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.portal;
      }
      if (hasRuntimeNpcAtTile(instance, x + dx, y + dy)) {
        return BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.npc;
      }
    }
  }
  // 同图传送的着陆格：跨图落点看不到，靠对端地图自己的传送点邻域保护。
  for (const portal of context.portals) {
    if (!isMapPortal(portal)) {
      continue;
    }
    if (context.currentMapId && normalizeString(portal?.targetMapId) !== context.currentMapId) {
      continue;
    }
    if (isWithinRadius(x, y, portal?.targetX, portal?.targetY)) {
      return BUILDING_PROTECTED_PLACEMENT_CONFLICT_REASONS.portal;
    }
  }
  return null;
}

function resolveContext(instance: unknown): BuildingProtectedPlacementContext {
  const runtime = instance as any;
  const template = runtime?.template ?? {};
  const portals = typeof runtime?.listAllPortals === 'function'
    ? runtime.listAllPortals()
    : Array.isArray(template.portals) ? template.portals : [];
  return {
    portals,
    currentMapId: normalizeString(template?.id) || normalizeString(runtime?.meta?.templateId),
    spawnX: Math.trunc(Number(template?.spawnX)),
    spawnY: Math.trunc(Number(template?.spawnY)),
  };
}

/** isMapPortal：地图固有传送点（宗门山门带 sectId，按运行时动态点位处理）。 */
function isMapPortal(portal: unknown): boolean {
  return !normalizeString((portal as any)?.sectId);
}

function isWithinRadius(x: number, y: number, centerX: unknown, centerY: unknown): boolean {
  const cx = Math.trunc(Number(centerX));
  const cy = Math.trunc(Number(centerY));
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
    return false;
  }
  return Math.abs(cx - x) <= BUILDING_PROTECTED_PLACEMENT_RADIUS
    && Math.abs(cy - y) <= BUILDING_PROTECTED_PLACEMENT_RADIUS;
}

function isInBounds(instance: unknown, x: number, y: number): boolean | null {
  if (typeof (instance as any)?.isInBounds === 'function') {
    return (instance as any).isInBounds(x, y) === true;
  }
  return null;
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
