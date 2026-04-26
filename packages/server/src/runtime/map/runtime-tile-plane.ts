// @ts-nocheck
"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
exports.RuntimeTilePlane = exports.TILE_FLAG_DAMAGEABLE = exports.TILE_FLAG_SAFE_ZONE = exports.TILE_FLAG_BLOCKS_SIGHT = exports.TILE_FLAG_WALKABLE = void 0;

const shared_1 = require("@mud/shared");

const EMPTY_SLOT = 0;
const DEFAULT_COORD_INDEX_CAPACITY = 1024;
const DEFAULT_CELL_CAPACITY = 256;

exports.TILE_FLAG_WALKABLE = 1 << 0;
exports.TILE_FLAG_BLOCKS_SIGHT = 1 << 1;
exports.TILE_FLAG_SAFE_ZONE = 1 << 2;
exports.TILE_FLAG_DAMAGEABLE = 1 << 3;

/** RuntimeTilePlane：运行时稀疏坐标地块平面，热路径以 cell index 读写。 */
class RuntimeTilePlane {
    slotX;
    slotY;
    slotValue;
    slotMask;
    slotCount = 0;
    cellX;
    cellY;
    tileTypeByCell;
    flagsByCell;
    cellCount = 0;
    minX = 0;
    maxX = -1;
    minY = 0;
    maxY = -1;

    constructor(initialCellCapacity = DEFAULT_CELL_CAPACITY, initialIndexCapacity = DEFAULT_COORD_INDEX_CAPACITY) {
        const cellCapacity = nextPowerOfTwo(Math.max(DEFAULT_CELL_CAPACITY, initialCellCapacity));
        this.cellX = new Int32Array(cellCapacity);
        this.cellY = new Int32Array(cellCapacity);
        this.tileTypeByCell = new Array(cellCapacity);
        this.flagsByCell = new Uint16Array(cellCapacity);
        const indexCapacity = nextPowerOfTwo(Math.max(DEFAULT_COORD_INDEX_CAPACITY, initialIndexCapacity));
        this.slotX = new Int32Array(indexCapacity);
        this.slotY = new Int32Array(indexCapacity);
        this.slotValue = new Int32Array(indexCapacity);
        this.slotMask = indexCapacity - 1;
    }

    static fromTemplate(template) {
        const width = Math.max(0, Math.trunc(Number(template?.width) || 0));
        const height = Math.max(0, Math.trunc(Number(template?.height) || 0));
        const plane = new RuntimeTilePlane(Math.max(1, width * height), Math.max(DEFAULT_COORD_INDEX_CAPACITY, width * height * 2));
        for (let y = 0; y < height; y += 1) {
            const row = template?.terrainRows?.[y] ?? template?.source?.tiles?.[y] ?? '';
            for (let x = 0; x < width; x += 1) {
                const tileType = (0, shared_1.getTileTypeFromMapChar)(row[x] ?? '#');
                plane.activateCell(x, y, tileType, buildDefaultTileFlags(tileType));
            }
        }
        return plane;
    }

    has(x, y) {
        return this.getCellIndex(x, y) >= 0;
    }

    getHandle(x, y) {
        const index = this.getCellIndex(x, y);
        return index >= 0 ? index + 1 : 0;
    }

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
        this.tileTypeByCell[cellIndex] = normalizeTileType(tileType);
        this.flagsByCell[cellIndex] = Math.max(0, Math.trunc(Number(flags) || 0));
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
        return this.tileTypeByCell[cellIndex] ?? shared_1.TileType.Wall;
    }

    setTileType(cellIndex, tileType) {
        if (cellIndex < 0 || cellIndex >= this.cellCount) {
            return false;
        }
        const normalized = normalizeTileType(tileType);
        this.tileTypeByCell[cellIndex] = normalized;
        this.flagsByCell[cellIndex] = buildDefaultTileFlags(normalized);
        return true;
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

    isWalkable(cellIndex) {
        return (this.getFlags(cellIndex) & exports.TILE_FLAG_WALKABLE) !== 0;
    }

    blocksSight(cellIndex) {
        return (this.getFlags(cellIndex) & exports.TILE_FLAG_BLOCKS_SIGHT) !== 0;
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
        const nextFlags = new Uint16Array(nextCapacity);
        nextX.set(this.cellX);
        nextY.set(this.cellY);
        for (let index = 0; index < this.tileTypeByCell.length; index += 1) {
            nextTileType[index] = this.tileTypeByCell[index];
        }
        nextFlags.set(this.flagsByCell);
        this.cellX = nextX;
        this.cellY = nextY;
        this.tileTypeByCell = nextTileType;
        this.flagsByCell = nextFlags;
    }
}
exports.RuntimeTilePlane = RuntimeTilePlane;
export { RuntimeTilePlane };

function buildDefaultTileFlags(tileType) {
    const normalized = normalizeTileType(tileType);
    let flags = 0;
    if ((0, shared_1.isTileTypeWalkable)(normalized)) {
        flags |= exports.TILE_FLAG_WALKABLE;
    }
    if ((0, shared_1.doesTileTypeBlockSight)(normalized)) {
        flags |= exports.TILE_FLAG_BLOCKS_SIGHT;
    }
    if (isDamageableTile(normalized)) {
        flags |= exports.TILE_FLAG_DAMAGEABLE;
    }
    return flags;
}

function isDamageableTile(tileType) {
    return tileType === shared_1.TileType.Wall
        || tileType === shared_1.TileType.Cloud
        || tileType === shared_1.TileType.Tree
        || tileType === shared_1.TileType.Bamboo
        || tileType === shared_1.TileType.Cliff
        || tileType === shared_1.TileType.Stone
        || tileType === shared_1.TileType.SpiritOre
        || tileType === shared_1.TileType.BlackIronOre
        || tileType === shared_1.TileType.BrokenSwordHeap
        || tileType === shared_1.TileType.Door
        || tileType === shared_1.TileType.Window;
}

function normalizeTileType(tileType) {
    return typeof tileType === 'string' && tileType.length > 0 ? tileType : shared_1.TileType.Wall;
}

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
