/**
 * 运行时稀疏地块平面。
 * 使用哈希槽 + TypedArray 实现 O(1) 坐标查找和层叠合成，
 * 支持地形/表面/结构三层独立修改和标志位预计算。
 */
import { InteractableKind, TerrainType, TileType, composeTileTypeFromLayers, doesStructureTypeBlockMove, doesStructureTypeBlockSight, doesTerrainTypeBlockSight, getTileTypeFromMapChar, isStructureTypeDamageable, isTerrainTypeWalkable, normalizeStructureType, normalizeSurfaceType, normalizeTerrainType, resolveTileLayerSeedFromTemplateContext, resolveTileLayerSeedFromTileType } from '@mud/shared';

// 哈希槽空标记：0 表示空槽，value 存储 cellIndex + 1
const EMPTY_SLOT = 0;
const DEFAULT_COORD_INDEX_CAPACITY = 1024;
const DEFAULT_CELL_CAPACITY = 256;

export const TILE_FLAG_WALKABLE = 1 << 0;
export const TILE_FLAG_BLOCKS_SIGHT = 1 << 1;
export const TILE_FLAG_SAFE_ZONE = 1 << 2;
export const TILE_FLAG_DAMAGEABLE = 1 << 3;
export const TILE_FLAG_HAS_SURFACE = 1 << 4;
export const TILE_FLAG_HAS_STRUCTURE = 1 << 5;
export const TILE_FLAG_HAS_INTERACTABLE = 1 << 6;

const INTERACTABLE_FLAG_PORTAL = 1 << 0;
const INTERACTABLE_FLAG_STAIRS = 1 << 1;

/** 运行时稀疏地块平面，热路径以 cellIndex 读写。
 * ⚠️ 禁止在 tick 内进行哈希重分布（growCoordIndex），必须在地图加载期完成。
 * 稀疏存储 + 哈希槽 O(1) 查找 + 层叠合成 + 标志位预计算。*/
class RuntimeTilePlane {
    /** 哈希槽 X 坐标数组 */
    slotX;
    /** 哈希槽 Y 坐标数组 */
    slotY;
    /** 哈希槽存储的值（cellIndex + 1，0 表示空槽） */
    slotValue;
    /** 哈希槽容量掩码（capacity - 1） */
    slotMask;
    /** 当前激活的槽数量 */
    slotCount = 0;
    /** 地块 X 坐标数组（按 cellIndex 索引） */
    cellX;
    /** 地块 Y 坐标数组（按 cellIndex 索引） */
    cellY;
    /** 地块类型（合成后的 TileType） */
    tileTypeByCell;
    /** 地形类型（terrain layer） */
    terrainTypeByCell;
    /** 表面类型（surface layer） */
    surfaceTypeByCell;
    /** 结构类型（structure layer） */
    structureTypeByCell;
    /** 可交互物标志位（portal/stairs） */
    interactableFlagsByCell;
    /** 图层版本号，每次修改递增，用于增量同步 */
    layerRevisionByCell;
    /** 预计算标志位（可行走/视野阻挡/安全区等） */
    flagsByCell;
    /** 当前激活的 cell 数量 */
    cellCount = 0;
    /** 地块 X 坐标范围最小值 */
    minX = 0;
    /** 地块 X 坐标范围最大值 */
    maxX = -1;
    /** 地块 Y 坐标范围最小值 */
    minY = 0;
    /** 地块 Y 坐标范围最大值 */
    maxY = -1;

    constructor(initialCellCapacity = DEFAULT_CELL_CAPACITY, initialIndexCapacity = DEFAULT_COORD_INDEX_CAPACITY) {
        const cellCapacity = nextPowerOfTwo(Math.max(DEFAULT_CELL_CAPACITY, initialCellCapacity));
        this.cellX = new Int32Array(cellCapacity);
        this.cellY = new Int32Array(cellCapacity);
        this.tileTypeByCell = new Array(cellCapacity);
        this.terrainTypeByCell = new Array(cellCapacity);
        this.surfaceTypeByCell = new Array(cellCapacity);
        this.structureTypeByCell = new Array(cellCapacity);
        this.interactableFlagsByCell = new Uint8Array(cellCapacity);
        this.layerRevisionByCell = new Uint32Array(cellCapacity);
        this.flagsByCell = new Uint16Array(cellCapacity);
        const indexCapacity = nextPowerOfTwo(Math.max(DEFAULT_COORD_INDEX_CAPACITY, initialIndexCapacity));
        this.slotX = new Int32Array(indexCapacity);
        this.slotY = new Int32Array(indexCapacity);
        this.slotValue = new Int32Array(indexCapacity);
        this.slotMask = indexCapacity - 1;
    }

    /** 从地图模板创建地块平面，解析 terrainRows 初始化所有地块 */
    static fromTemplate(template) {
        const width = Math.max(0, Math.trunc(Number(template?.width) || 0));
        const height = Math.max(0, Math.trunc(Number(template?.height) || 0));
        const plane = new RuntimeTilePlane(Math.max(1, width * height), Math.max(DEFAULT_COORD_INDEX_CAPACITY, width * height * 2));
        for (let y = 0; y < height; y += 1) {
            const row = template?.terrainRows?.[y] ?? template?.source?.tiles?.[y] ?? '';
            for (let x = 0; x < width; x += 1) {
                const tileType = getTileTypeFromMapChar(row[x] ?? '#');
                const seed = resolveTileLayerSeedFromTemplateContext(tileType, x, y, (lookupX, lookupY) => {
                    if (lookupX < 0 || lookupY < 0 || lookupX >= width || lookupY >= height) {
                        return null;
                    }
                    const lookupRow = template?.terrainRows?.[lookupY] ?? template?.source?.tiles?.[lookupY] ?? '';
                    return getTileTypeFromMapChar(lookupRow[lookupX] ?? '#');
                });
                const cellIndex = plane.activateCell(x, y, tileType, buildDefaultTileFlags(tileType));
                plane.applyLayerSeed(cellIndex, seed);
            }
        }
        return plane;
    }

    /** 检查指定坐标是否存在已激活地块 */
    has(x, y) {
        return this.getCellIndex(x, y) >= 0;
    }

    /** 获取坐标对应的句柄（cellIndex + 1，0 表示不存在），用于缓存键 */
    getHandle(x, y) {
        const index = this.getCellIndex(x, y);
        return index >= 0 ? index + 1 : 0;
    }

    /** 通过坐标查找 cellIndex，未找到返回 -1 */
    getCellIndex(x, y) {
        if (!Number.isFinite(Number(x)) || !Number.isFinite(Number(y))) {
            return -1;
        }
        const normalizedX = Math.trunc(Number(x));
        const normalizedY = Math.trunc(Number(y));
        const slot = this.findSlot(normalizedX, normalizedY);
        const value = this.slotValue[slot];
        return value === EMPTY_SLOT ? -1 : value - 1;
    }

    activateCell(x, y, tileType, flags = buildDefaultTileFlags(tileType)) {
        const normalizedX = Math.trunc(Number(x));
        const normalizedY = Math.trunc(Number(y));
        const existing = this.getCellIndex(normalizedX, normalizedY);
        if (existing >= 0) {
            return existing;
        }
        if ((this.slotCount + 1) * 10 >= this.slotValue.length * 7) {
            this.growCoordIndex();
        }
        this.ensureCellCapacity(this.cellCount + 1);
        const cellIndex = this.cellCount;
        this.cellCount += 1;
        this.cellX[cellIndex] = normalizedX;
        this.cellY[cellIndex] = normalizedY;
        this.applyLegacyTileSeed(cellIndex, tileType, flags);
        this.insertCoord(normalizedX, normalizedY, cellIndex);
        if (this.cellCount === 1) {
            this.minX = normalizedX;
            this.maxX = normalizedX;
            this.minY = normalizedY;
            this.maxY = normalizedY;
        }
        else {
            if (normalizedX < this.minX) this.minX = normalizedX;
            if (normalizedX > this.maxX) this.maxX = normalizedX;
            if (normalizedY < this.minY) this.minY = normalizedY;
            if (normalizedY > this.maxY) this.maxY = normalizedY;
        }
        return cellIndex;
    }

    getX(cellIndex) {
        return this.cellX[cellIndex] ?? 0;
    }

    getY(cellIndex) {
        return this.cellY[cellIndex] ?? 0;
    }

    getTileType(cellIndex) {
        return this.tileTypeByCell[cellIndex] ?? TileType.Wall;
    }

    setTileType(cellIndex, tileType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.applyLegacyTileSeed(cellIndex, tileType);
        return true;
    }

    setStructureTileType(cellIndex, tileType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        const seed = resolveTileLayerSeedFromTileType(normalizeTileType(tileType));
        if (!seed.structure) {
            return this.setTileType(cellIndex, tileType);
        }
        this.structureTypeByCell[cellIndex] = seed.structure;
        this.recomposeCell(cellIndex);
        return true;
    }

    setSurfaceTileType(cellIndex, tileType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        const seed = resolveTileLayerSeedFromTileType(normalizeTileType(tileType));
        if (!seed.surface) {
            return this.setTileType(cellIndex, tileType);
        }
        this.surfaceTypeByCell[cellIndex] = seed.surface;
        this.recomposeCell(cellIndex);
        return true;
    }

    getTerrainType(cellIndex) {
        return this.terrainTypeByCell[cellIndex] ?? TerrainType.Floor;
    }

    getTerrain(cellIndex) {
        return this.getTerrainType(cellIndex);
    }

    setTerrainType(cellIndex, terrainType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.terrainTypeByCell[cellIndex] = normalizeTerrainType(terrainType);
        this.recomposeCell(cellIndex);
        return true;
    }

    setTerrain(cellIndex, terrainType) {
        return this.setTerrainType(cellIndex, terrainType);
    }

    getSurfaceType(cellIndex) {
        return this.surfaceTypeByCell[cellIndex] ?? null;
    }

    getSurface(cellIndex) {
        return this.getSurfaceType(cellIndex);
    }

    setSurfaceType(cellIndex, surfaceType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.surfaceTypeByCell[cellIndex] = normalizeSurfaceType(surfaceType);
        this.recomposeCell(cellIndex);
        return true;
    }

    setSurface(cellIndex, surfaceType) {
        return this.setSurfaceType(cellIndex, surfaceType);
    }

    getStructureType(cellIndex) {
        return this.structureTypeByCell[cellIndex] ?? null;
    }

    getStructure(cellIndex) {
        return this.getStructureType(cellIndex);
    }

    setStructureType(cellIndex, structureType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.structureTypeByCell[cellIndex] = normalizeStructureType(structureType);
        this.recomposeCell(cellIndex);
        return true;
    }

    setStructure(cellIndex, structureType) {
        return this.setStructureType(cellIndex, structureType);
    }

    getInteractableFlags(cellIndex) {
        return this.interactableFlagsByCell[cellIndex] ?? 0;
    }

    setInteractableKinds(cellIndex, interactables) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.interactableFlagsByCell[cellIndex] = buildInteractableFlags(interactables);
        this.recomposeCell(cellIndex);
        return true;
    }

    getLayerRevision(cellIndex) {
        return this.layerRevisionByCell[cellIndex] ?? 0;
    }

    getTileLayerState(cellIndex) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return null;
        }
        return {
            terrain: this.getTerrainType(cellIndex),
            surface: this.getSurfaceType(cellIndex),
            structure: this.getStructureType(cellIndex),
            interactableKinds: readInteractables(this.getInteractableFlags(cellIndex)),
            interactableFlags: this.getInteractableFlags(cellIndex),
            legacyTileType: this.getTileType(cellIndex),
        };
    }

    getFlags(cellIndex) {
        return this.flagsByCell[cellIndex] ?? 0;
    }

    setFlags(cellIndex, flags) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        this.flagsByCell[cellIndex] = Math.max(0, Math.trunc(Number(flags) || 0));
        return true;
    }

    getCompositeFlags(cellIndex) {
        return this.getFlags(cellIndex);
    }

    isWalkable(cellIndex) {
        return (this.getFlags(cellIndex) & TILE_FLAG_WALKABLE) !== 0;
    }

    blocksSight(cellIndex) {
        return (this.getFlags(cellIndex) & TILE_FLAG_BLOCKS_SIGHT) !== 0;
    }

    getCellCapacity() {
        return this.cellX.length;
    }

    getCellCount() {
        return this.cellCount;
    }

    findSlot(x, y) {
        let slot = hashCoord(x, y) & this.slotMask;
        while (true) {
            const value = this.slotValue[slot];
            if (value === EMPTY_SLOT || (this.slotX[slot] === x && this.slotY[slot] === y)) {
                return slot;
            }
            slot = (slot + 1) & this.slotMask;
        }
    }

    insertCoord(x, y, cellIndex) {
        const slot = this.findSlot(x, y);
        if (this.slotValue[slot] === EMPTY_SLOT) {
            this.slotX[slot] = x;
            this.slotY[slot] = y;
            this.slotValue[slot] = cellIndex + 1;
            this.slotCount += 1;
        }
        else {
            this.slotValue[slot] = cellIndex + 1;
        }
    }

    growCoordIndex() {
        const oldX = this.slotX;
        const oldY = this.slotY;
        const oldValue = this.slotValue;
        const nextCapacity = oldValue.length * 2;
        this.slotX = new Int32Array(nextCapacity);
        this.slotY = new Int32Array(nextCapacity);
        this.slotValue = new Int32Array(nextCapacity);
        this.slotMask = nextCapacity - 1;
        this.slotCount = 0;
        for (let index = 0; index < oldValue.length; index += 1) {
            const value = oldValue[index];
            if (value !== EMPTY_SLOT) {
                this.insertCoord(oldX[index], oldY[index], value - 1);
            }
        }
    }

    ensureCellCapacity(required) {
        if (required <= this.cellX.length) {
            return;
        }
        const nextCapacity = nextPowerOfTwo(required);
        const nextX = new Int32Array(nextCapacity);
        const nextY = new Int32Array(nextCapacity);
        const nextTileType = new Array(nextCapacity);
        const nextTerrainType = new Array(nextCapacity);
        const nextSurfaceType = new Array(nextCapacity);
        const nextStructureType = new Array(nextCapacity);
        const nextInteractableFlags = new Uint8Array(nextCapacity);
        const nextLayerRevision = new Uint32Array(nextCapacity);
        const nextFlags = new Uint16Array(nextCapacity);
        nextX.set(this.cellX);
        nextY.set(this.cellY);
        for (let index = 0; index < this.tileTypeByCell.length; index += 1) {
            nextTileType[index] = this.tileTypeByCell[index];
            nextTerrainType[index] = this.terrainTypeByCell[index];
            nextSurfaceType[index] = this.surfaceTypeByCell[index];
            nextStructureType[index] = this.structureTypeByCell[index];
        }
        nextInteractableFlags.set(this.interactableFlagsByCell);
        nextLayerRevision.set(this.layerRevisionByCell);
        nextFlags.set(this.flagsByCell);
        this.cellX = nextX;
        this.cellY = nextY;
        this.tileTypeByCell = nextTileType;
        this.terrainTypeByCell = nextTerrainType;
        this.surfaceTypeByCell = nextSurfaceType;
        this.structureTypeByCell = nextStructureType;
        this.interactableFlagsByCell = nextInteractableFlags;
        this.layerRevisionByCell = nextLayerRevision;
        this.flagsByCell = nextFlags;
    }

    applyLegacyTileSeed(cellIndex, tileType, explicitFlags = undefined) {
        const seed = resolveTileLayerSeedFromTileType(normalizeTileType(tileType));
        this.applyLayerSeed(cellIndex, seed, explicitFlags);
    }

    applyLayerSeed(cellIndex, seed, explicitFlags = undefined) {
        this.terrainTypeByCell[cellIndex] = seed.terrain;
        this.surfaceTypeByCell[cellIndex] = seed.surface;
        this.structureTypeByCell[cellIndex] = seed.structure;
        this.interactableFlagsByCell[cellIndex] = buildInteractableFlags(seed.interactables);
        this.recomposeCell(cellIndex, explicitFlags);
    }

    recomposeCell(cellIndex, explicitFlags = undefined) {
        const interactables = readInteractables(this.interactableFlagsByCell[cellIndex] ?? 0);
        const tileType = composeTileTypeFromLayers(
            this.terrainTypeByCell[cellIndex],
            this.surfaceTypeByCell[cellIndex],
            this.structureTypeByCell[cellIndex],
            interactables,
        );
        this.tileTypeByCell[cellIndex] = tileType;
        const preservedFlags = Number.isFinite(Number(explicitFlags))
            ? Math.max(0, Math.trunc(Number(explicitFlags) || 0))
            : this.flagsByCell[cellIndex] ?? 0;
        this.flagsByCell[cellIndex] = buildLayerTileFlags(
            this.terrainTypeByCell[cellIndex],
            this.surfaceTypeByCell[cellIndex],
            this.structureTypeByCell[cellIndex],
            this.interactableFlagsByCell[cellIndex] ?? 0,
            preservedFlags,
        );
        this.layerRevisionByCell[cellIndex] = ((this.layerRevisionByCell[cellIndex] ?? 0) + 1) >>> 0;
    }
}
export { RuntimeTilePlane };

function buildDefaultTileFlags(tileType) {
    const normalized = normalizeTileType(tileType);
    const seed = resolveTileLayerSeedFromTileType(normalized);
    return buildLayerTileFlags(seed.terrain, seed.surface, seed.structure, buildInteractableFlags(seed.interactables), 0);
}

function buildLayerTileFlags(terrainType, surfaceType, structureType, interactableFlags, preservedFlags = 0) {
    let flags = preservedFlags & TILE_FLAG_SAFE_ZONE;
    if (isTerrainTypeWalkable(terrainType) && !doesStructureTypeBlockMove(structureType)) {
        flags |= TILE_FLAG_WALKABLE;
    }
    if (doesTerrainTypeBlockSight(terrainType) || doesStructureTypeBlockSight(structureType)) {
        flags |= TILE_FLAG_BLOCKS_SIGHT;
    }
    if (isStructureTypeDamageable(structureType) || isDamageableTerrainType(terrainType)) {
        flags |= TILE_FLAG_DAMAGEABLE;
    }
    if (normalizeSurfaceType(surfaceType)) {
        flags |= TILE_FLAG_HAS_SURFACE;
    }
    if (normalizeStructureType(structureType)) {
        flags |= TILE_FLAG_HAS_STRUCTURE;
    }
    if (interactableFlags > 0) {
        flags |= TILE_FLAG_HAS_INTERACTABLE;
    }
    return flags;
}

function isDamageableTerrainType(terrainType) {
    const terrain = normalizeTerrainType(terrainType);
    return terrain === TerrainType.Cliff || terrain === TerrainType.Cloud;
}

function buildInteractableFlags(interactables) {
    let flags = 0;
    if (Array.isArray(interactables)) {
        if (interactables.includes(InteractableKind.Portal)) {
            flags |= INTERACTABLE_FLAG_PORTAL;
        }
        if (interactables.includes(InteractableKind.Stairs)) {
            flags |= INTERACTABLE_FLAG_STAIRS;
        }
    }
    return flags;
}

function readInteractables(flags) {
    const result = [];
    if ((flags & INTERACTABLE_FLAG_PORTAL) !== 0) {
        result.push(InteractableKind.Portal);
    }
    if ((flags & INTERACTABLE_FLAG_STAIRS) !== 0) {
        result.push(InteractableKind.Stairs);
    }
    return result;
}

function normalizeTileType(tileType) {
    return typeof tileType === 'string' && tileType.length > 0 ? tileType : TileType.Wall;
}

// MurmurHash3 混合因子，兼顾 x/y 分布
function hashCoord(x, y) {
    let hash = Math.imul(x ^ 0x9e3779b9, 0x85ebca6b);
    hash ^= Math.imul(y ^ 0xc2b2ae35, 0x27d4eb2d);
    hash ^= hash >>> 16;
    return hash >>> 0;
}

function nextPowerOfTwo(value) {
    let result = 1;
    const target = Math.max(1, Math.trunc(Number(value) || 1));
    while (result < target) {
        result <<= 1;
    }
    return result;
}
