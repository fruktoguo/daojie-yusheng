import {
  GmMapDocument,
  getTileTypeFromMapChar,
  isOffsetInRange,
  isPointInRange,
  isTileTypeWalkable,
  MapRouteDomain,
  Portal,
  TileType,
} from '@mud/shared';
import {
  MapData,
  PortalObservationHint,
  PortalQueryOptions,
  ProjectedPoint,
} from './map.service.shared';

/** MapPortalDomain：封装相关状态与行为。 */
export class MapPortalDomain {
  constructor(
    private readonly maps: Map<string, MapData>,
  ) {}

  getOverlayParentMapId(mapId: string): string | undefined {
    const meta = this.getMapMeta(mapId);
    if (meta?.spaceVisionMode !== 'parent_overlay' || !meta.parentMapId) {
      return undefined;
    }
    return this.maps.has(meta.parentMapId) ? meta.parentMapId : undefined;
  }

  projectPointToMap(targetMapId: string, sourceMapId: string, x: number, y: number): ProjectedPoint | null {
    if (targetMapId === sourceMapId) {
      return { x, y };
    }

    const targetMeta = this.getMapMeta(targetMapId);
    const sourceMeta = this.getMapMeta(sourceMapId);
    if (!targetMeta || !sourceMeta) {
      return null;
    }

    if (
      targetMeta.parentMapId === sourceMapId &&
      targetMeta.spaceVisionMode === 'parent_overlay'
      && Number.isInteger(targetMeta.parentOriginX)
      && Number.isInteger(targetMeta.parentOriginY)
    ) {
      return {
        x: x - targetMeta.parentOriginX!,
        y: y - targetMeta.parentOriginY!,
      };
    }

    if (
      sourceMeta.parentMapId === targetMapId &&
      sourceMeta.spaceVisionMode === 'parent_overlay'
      && Number.isInteger(sourceMeta.parentOriginX)
      && Number.isInteger(sourceMeta.parentOriginY)
    ) {
      return {
        x: x + sourceMeta.parentOriginX!,
        y: y + sourceMeta.parentOriginY!,
      };
    }

    return null;
  }

  getPortalAt(mapId: string, x: number, y: number, options?: PortalQueryOptions): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find((portal) => portal.x === x && portal.y === y && this.matchesPortalQuery(portal, options));
  }

  getHiddenPortalObservationAt(mapId: string, x: number, y: number): PortalObservationHint | undefined {
    const localPortal = this.getPortalAt(mapId, x, y);
    if (localPortal?.hidden) {
      return this.toPortalObservationHint(localPortal);
    }

    const parentMapId = this.getOverlayParentMapId(mapId);
    if (!parentMapId || this.isPointInMapBounds(mapId, x, y)) {
      return undefined;
    }

    const projected = this.projectPointToMap(parentMapId, mapId, x, y);
    if (!projected) {
      return undefined;
    }
    const parentPortal = this.getPortalAt(parentMapId, projected.x, projected.y);
    if (!parentPortal?.hidden) {
      return undefined;
    }
    return this.toPortalObservationHint(parentPortal);
  }

  getPortalNear(mapId: string, x: number, y: number, maxDistance = 1, options?: PortalQueryOptions): Portal | undefined {
    const map = this.maps.get(mapId);
    if (!map) return undefined;
    return map.portals.find((portal) => (
      isPointInRange(portal, { x, y }, maxDistance) && this.matchesPortalQuery(portal, options)
    ));
  }

  getPortals(mapId: string, options?: PortalQueryOptions): Portal[] {
    const map = this.maps.get(mapId);
    if (!map) {
      return [];
    }
    return map.portals.filter((portal) => this.matchesPortalQuery(portal, options));
  }

  getMapRouteDomain(mapId: string): MapRouteDomain {
    return this.getMapMeta(mapId)?.routeDomain ?? 'system';
  }

  isMapRouteDomainAllowed(mapId: string, allowedRouteDomains?: readonly MapRouteDomain[]): boolean {
    if (!allowedRouteDomains || allowedRouteDomains.length === 0) {
      return true;
    }
    return allowedRouteDomains.includes(this.getMapRouteDomain(mapId));
  }

  resolveNearestWalkablePointInDocument(
    document: GmMapDocument,
    origin: { x: number; y: number },
  ): { x: number; y: number } | null {
    if (document.width <= 0 || document.height <= 0) {
      return null;
    }

    const clamped = {
      x: Math.min(document.width - 1, Math.max(0, Math.floor(origin.x))),
      y: Math.min(document.height - 1, Math.max(0, Math.floor(origin.y))),
    };

    let portalFallback: { x: number; y: number } | null = null;
    for (let radius = 0; radius <= Math.max(document.width, document.height); radius += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (!isOffsetInRange(dx, dy, radius)) continue;
          const x = clamped.x + dx;
          const y = clamped.y + dy;
          if (x < 0 || x >= document.width || y < 0 || y >= document.height) continue;
          const type = getTileTypeFromMapChar(document.tiles[y]?.[x] ?? '#');
          if (type === TileType.Portal || type === TileType.Stairs) {
            portalFallback ??= { x, y };
            continue;
          }
          if (isTileTypeWalkable(type)) {
            return { x, y };
          }
        }
      }
    }

    return portalFallback;
  }

  private matchesPortalQuery(portal: Portal, options?: PortalQueryOptions): boolean {
    if (!options) return true;
    if (options.trigger && portal.trigger !== options.trigger) return false;
    if (options.kind && portal.kind !== options.kind) return false;
    if (!this.isMapRouteDomainAllowed(portal.targetMapId, options.allowedRouteDomains)) return false;
    return true;
  }

  private toPortalObservationHint(portal: Portal): PortalObservationHint {
    return {
      title: portal.observeTitle
        ?? (portal.kind === 'stairs' ? '隐秘阶道' : '隐秘传送点'),
      desc: portal.observeDesc
        ?? (portal.kind === 'stairs'
          ? '此处空间褶皱微动，似有一条被刻意掩去的阶道。'
          : '此处灵机轻微错位，像是藏着未完全显形的传送痕迹。'),
    };
  }

/** getMapMeta：处理当前场景中的对应操作。 */
  private getMapMeta(mapId: string) {
    return this.maps.get(mapId)?.meta;
  }

  private isPointInMapBounds(mapId: string, x: number, y: number): boolean {
    const map = this.maps.get(mapId);
    if (!map) return false;
    return x >= 0 && y >= 0 && x < map.meta.width && y < map.meta.height;
  }
}

