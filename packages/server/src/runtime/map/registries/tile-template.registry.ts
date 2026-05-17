import { Injectable } from '@nestjs/common';
import {
  composeTileTypeFromLayers,
  getTileTypeFromMapChar,
  resolveTileLayerSeedFromTemplateContext,
} from '@mud/shared';

@Injectable()
export class TileTemplateRegistry {
  loadAll(): void {}

  getRef(templateId: string): Readonly<{ templateId: string }> {
    return Object.freeze({ templateId });
  }

  tryGetRef(templateId: string): Readonly<{ templateId: string }> | undefined {
    const normalized = String(templateId ?? '').trim();
    return normalized ? this.getRef(normalized) : undefined;
  }

  resolveLayerSeed(template: any, x: number, y: number): any {
    if (hasTemplateLayerRows(template)
      || Array.isArray(template?.surfaceRows)
      || Array.isArray(template?.structureRows)
      || Array.isArray(template?.interactableRows)) {
      const legacyTileType = composeTileTypeFromLayers(
        template.terrainRows?.[y]?.[x],
        template.surfaceRows?.[y]?.[x] ?? null,
        template.structureRows?.[y]?.[x] ?? null,
        template.interactableRows?.[y]?.[x] ?? [],
      );
      return {
        terrain: template.terrainRows?.[y]?.[x],
        surface: template.surfaceRows?.[y]?.[x] ?? null,
        structure: template.structureRows?.[y]?.[x] ?? null,
        interactables: Array.isArray(template.interactableRows?.[y]?.[x]) ? template.interactableRows[y][x] : [],
        legacyTileType,
      };
    }
    const type = getTileTypeFromMapChar(template.legacyTileRows?.[y]?.[x] ?? template.terrainRows?.[y]?.[x] ?? template.source?.tiles?.[y]?.[x] ?? '#');
    return resolveTileLayerSeedFromTemplateContext(type, x, y, (lookupX, lookupY) => (
      this.isInTemplateBounds(template, lookupX, lookupY)
        ? getTileTypeFromMapChar(template.legacyTileRows?.[lookupY]?.[lookupX] ?? template.terrainRows?.[lookupY]?.[lookupX] ?? template.source?.tiles?.[lookupY]?.[lookupX] ?? '#')
        : null
    ));
  }

  shareProjection(instance: any, x: number, y: number, tile: any): any {
    if (!instance) {
      return tile;
    }
    let projectionByCoord: Map<string, any> | undefined = instance.tileProjectionByCoord;
    if (!(projectionByCoord instanceof Map)) {
      projectionByCoord = new Map();
      instance.tileProjectionByCoord = projectionByCoord;
    }
    const cacheKey = `${x},${y}`;
    const cached = projectionByCoord.get(cacheKey);
    if (cached && isSameTileProjection(cached, tile)) {
      return cached;
    }
    freezeTileProjection(tile);
    projectionByCoord.set(cacheKey, tile);
    return tile;
  }

  isInTemplateBounds(template: any, x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < template.width && y < template.height;
  }

  listIds(): readonly string[] {
    return [];
  }
}

function hasTemplateLayerRows(template: any): boolean {
  return Array.isArray(template?.terrainRows?.[0]);
}

function freezeTileProjection(tile: any): any {
  if (tile && process.env.NODE_ENV !== 'production') {
    if (Array.isArray(tile.resources)) {
      for (const entry of tile.resources) {
        if (entry && typeof entry === 'object') {
          Object.freeze(entry);
        }
      }
      Object.freeze(tile.resources);
    }
    if (Array.isArray(tile.interactableKinds)) {
      Object.freeze(tile.interactableKinds);
    }
    if (tile.hiddenEntrance && typeof tile.hiddenEntrance === 'object') {
      Object.freeze(tile.hiddenEntrance);
    }
    Object.freeze(tile);
  }
  return tile;
}

function isSameTileProjection(left: any, right: any): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.type === right.type
    && left.walkable === right.walkable
    && left.blocksSight === right.blocksSight
    && left.aura === right.aura
    && left.movementCost === right.movementCost
    && left.qiDrainPerTick === right.qiDrainPerTick
    && left.occupiedBy === right.occupiedBy
    && left.modifiedAt === right.modifiedAt
    && left.hp === right.hp
    && left.maxHp === right.maxHp
    && left.hpVisible === right.hpVisible
    && left.terrainType === right.terrainType
    && left.surfaceType === right.surfaceType
    && left.structureType === right.structureType
    && isSameTileResourceProjectionList(left.resources, right.resources)
    && isSameStringList(left.interactableKinds, right.interactableKinds)
    && left.hiddenEntrance?.portalId === right.hiddenEntrance?.portalId
    && left.hiddenEntrance?.portalKind === right.hiddenEntrance?.portalKind
    && left.hiddenEntrance?.portalTargetMapId === right.hiddenEntrance?.portalTargetMapId;
}

function isSameTileResourceProjectionList(left: any, right: any): boolean {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const leftEntry = left[index];
    const rightEntry = right[index];
    if (leftEntry?.key !== rightEntry?.key
      || leftEntry?.label !== rightEntry?.label
      || leftEntry?.value !== rightEntry?.value
      || leftEntry?.effectiveValue !== rightEntry?.effectiveValue
      || leftEntry?.level !== rightEntry?.level
      || leftEntry?.sourceValue !== rightEntry?.sourceValue) {
      return false;
    }
  }
  return true;
}

function isSameStringList(left: any, right: any): boolean {
  if (left === right) {
    return true;
  }
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}
