/**
 * 本文件属于服务端权威运行时，负责地图保护点位校验。
 *
 * 传送点、NPC、安全区是公共可达性与交互锚点，玩家放置类对象不能覆盖这些点位。
 */

export const PROTECTED_PLACEMENT_CONFLICT_REASONS = {
  portal: 'protected_placement_portal',
  npc: 'protected_placement_npc',
  safeZone: 'protected_placement_safe_zone',
} as const;

export type ProtectedPlacementConflictReason =
  typeof PROTECTED_PLACEMENT_CONFLICT_REASONS[keyof typeof PROTECTED_PLACEMENT_CONFLICT_REASONS];

export interface ProtectedPlacementConflict {
  ok: false;
  reason: ProtectedPlacementConflictReason;
  x: number;
  y: number;
}

export interface ProtectedPlacementOk {
  ok: true;
}

export type ProtectedPlacementCheckResult = ProtectedPlacementOk | ProtectedPlacementConflict;

export interface RuntimePoint {
  x: number;
  y: number;
}

export interface ProtectedPlacementCheckOptions {
  ignoredPortalSectId?: string | null;
}

export function findProtectedPlacementConflict(
  instance: unknown,
  points: Iterable<RuntimePoint>,
  options: ProtectedPlacementCheckOptions = {},
): ProtectedPlacementCheckResult {
  const ignoredPortalSectId = normalizeOptionalString(options.ignoredPortalSectId);
  for (const point of points) {
    const x = Math.trunc(Number(point?.x));
    const y = Math.trunc(Number(point?.y));
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      continue;
    }
    if (isRuntimeInstanceInBounds(instance, x, y) === false) {
      continue;
    }
    const portal = typeof (instance as any)?.getPortalAtTile === 'function'
      ? (instance as any).getPortalAtTile(x, y)
      : null;
    if (portal && (!ignoredPortalSectId || normalizeOptionalString(portal?.sectId) !== ignoredPortalSectId)) {
      return { ok: false, reason: PROTECTED_PLACEMENT_CONFLICT_REASONS.portal, x, y };
    }
    if (hasRuntimeNpcAtTile(instance, x, y)) {
      return { ok: false, reason: PROTECTED_PLACEMENT_CONFLICT_REASONS.npc, x, y };
    }
    const safeZone = typeof (instance as any)?.getSafeZoneAtTile === 'function'
      ? (instance as any).getSafeZoneAtTile(x, y)
      : null;
    if (safeZone) {
      return { ok: false, reason: PROTECTED_PLACEMENT_CONFLICT_REASONS.safeZone, x, y };
    }
  }
  return { ok: true };
}

export function* iterateSquareProtectedPlacementPoints(
  centerX: number,
  centerY: number,
  radius: number,
): Iterable<RuntimePoint> {
  const x0 = Math.trunc(Number(centerX));
  const y0 = Math.trunc(Number(centerY));
  const normalizedRadius = Math.max(0, Math.trunc(Number(radius) || 0));
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) {
    return;
  }
  for (let y = y0 - normalizedRadius; y <= y0 + normalizedRadius; y += 1) {
    for (let x = x0 - normalizedRadius; x <= x0 + normalizedRadius; x += 1) {
      yield { x, y };
    }
  }
}

export function formatProtectedPlacementConflictReason(reason: string | undefined): string {
  if (reason === PROTECTED_PLACEMENT_CONFLICT_REASONS.portal) {
    return '不能与传送点重叠';
  }
  if (reason === PROTECTED_PLACEMENT_CONFLICT_REASONS.npc) {
    return '不能与场景人物重叠';
  }
  if (reason === PROTECTED_PLACEMENT_CONFLICT_REASONS.safeZone) {
    return '不能与安全区重叠';
  }
  return '不能放置在受保护点位';
}

export function hasRuntimeNpcAtTile(instance: unknown, x: number, y: number): boolean {
  const runtime = instance as any;
  if (!runtime) {
    return false;
  }
  if (typeof runtime.toTileIndex === 'function' && runtime.npcIdByTile instanceof Map) {
    try {
      return runtime.npcIdByTile.has(runtime.toTileIndex(x, y));
    } catch (_error) {
      return false;
    }
  }
  if (runtime.npcsById instanceof Map) {
    for (const npc of runtime.npcsById.values()) {
      if (Math.trunc(Number(npc?.x)) === x && Math.trunc(Number(npc?.y)) === y) {
        return true;
      }
    }
  }
  return false;
}

function isRuntimeInstanceInBounds(instance: unknown, x: number, y: number): boolean | null {
  if (typeof (instance as any)?.isInBounds === 'function') {
    return (instance as any).isInBounds(x, y) === true;
  }
  return null;
}

function normalizeOptionalString(value: unknown): string {
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}
