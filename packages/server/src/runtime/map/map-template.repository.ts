// @ts-nocheck
"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var MapTemplateRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapTemplateRepository = void 0;
exports.getTileIndex = getTileIndex;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const project_path_1 = require("../../common/project-path");
let MapTemplateRepository = MapTemplateRepository_1 = class MapTemplateRepository {
/**
 * logger：对象字段。
 */

    logger = new common_1.Logger(MapTemplateRepository_1.name);    
    /**
 * templates：对象字段。
 */

    templates = new Map();    
    /**
 * npcLocationById：对象字段。
 */

    npcLocationById = new Map();    
    /**
 * questSourceById：对象字段。
 */

    questSourceById = new Map();    
    /**
 * onModuleInit：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    onModuleInit() {
        this.loadAll();
    }    
    /**
 * listSummaries：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    listSummaries() {
        return Array.from(this.templates.values(), (template) => ({
            id: template.id,
            name: template.name,
            width: template.width,
            height: template.height,
            routeDomain: template.routeDomain,
            portalCount: template.portals.length,
            safeZoneCount: template.safeZones.length,
            landmarkCount: template.landmarks.length,
            containerCount: template.containers.length,
        }));
    }    
    /**
 * list：执行核心业务逻辑。
 * @returns 函数返回值。
 */

    list() {
        return Array.from(this.templates.values());
    }    
    /**
 * getOrThrow：按给定条件读取/查询数据。
 * @param templateId template ID。
 * @returns 函数返回值。
 */

    getOrThrow(templateId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`未找到地图模板：${templateId}`);
        }
        return template;
    }    
    /**
 * has：执行状态校验并返回判断结果。
 * @param templateId template ID。
 * @returns 函数返回值。
 */

    has(templateId) {
        return this.templates.has(templateId);
    }    
    /**
 * getNpcLocation：按给定条件读取/查询数据。
 * @param npcId npc ID。
 * @returns 函数返回值。
 */

    getNpcLocation(npcId) {
        return this.npcLocationById.get(npcId) ?? null;
    }    
    /**
 * getQuestSource：按给定条件读取/查询数据。
 * @param questId quest ID。
 * @returns 函数返回值。
 */

    getQuestSource(questId) {
        return this.questSourceById.get(questId) ?? null;
    }    
    /**
 * loadAll：按给定条件读取/查询数据。
 * @returns 函数返回值。
 */

    loadAll() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.templates.clear();
        this.npcLocationById.clear();
        this.questSourceById.clear();
        const mapsDir = (0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'maps');
        const files = fs.readdirSync(mapsDir)
            .filter((file) => file.endsWith('.json'))
            .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
        const documents = [];
        for (const file of files) {
            const fullPath = path.join(mapsDir, file);
            const raw = JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
            documents.push((0, shared_1.normalizeEditableMapDocument)(raw));
        }
        for (const document of documents) {
            indexDocumentNpcs(document, this.npcLocationById);
        }
        for (const document of documents) {
            const template = this.buildTemplate(document);
            this.templates.set(template.id, template);
            for (const npc of template.npcs) {
                for (const quest of npc.quests) {
                    const questId = typeof quest.id === 'string' ? quest.id.trim() : '';
                    if (!questId || this.questSourceById.has(questId)) {
                        continue;
                    }
                    this.questSourceById.set(questId, {
                        quest,
                        giverNpcId: npc.id,
                        giverNpcName: npc.name,
                        giverMapId: template.id,
                        giverMapName: template.name,
                        giverX: npc.x,
                        giverY: npc.y,
                    });
                }
            }
        }
        this.logger.log(`已加载 ${this.templates.size} 个地图模板`);
    }    
    /**
 * buildTemplate：构建并返回目标对象。
 * @param document 参数说明。
 * @returns 函数返回值。
 */

    buildTemplate(document) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const width = document.width;
        const height = document.height;
        const size = width * height;
        const walkableMask = new Uint8Array(size);
        const blocksSightMask = new Uint8Array(size);
        const portalIndexByTile = new Int32Array(size);
        const safeZoneMask = new Uint8Array(size);
        const baseAuraByTile = new Int32Array(size);
        portalIndexByTile.fill(-1);
        for (let y = 0; y < height; y += 1) {
            const row = document.tiles[y] ?? '';
            for (let x = 0; x < width; x += 1) {
                const tileType = (0, shared_1.getTileTypeFromMapChar)(row[x] ?? '#');
                const tileIndex = getTileIndex(x, y, width);
                walkableMask[tileIndex] = (0, shared_1.isTileTypeWalkable)(tileType) ? 1 : 0;
                blocksSightMask[tileIndex] = (0, shared_1.doesTileTypeBlockSight)(tileType) ? 1 : 0;
            }
        }
        const safeZones = normalizeSafeZones(document.safeZones, width, height);
        for (const safeZone of safeZones) {
            fillSafeZoneMask(safeZoneMask, width, height, safeZone);
        }
        const landmarks = normalizeLandmarks(document.landmarks, width, height);
        const containers = landmarks
            .flatMap((landmark) => landmark.container ? [landmark.container] : [])
            .sort(compareContainers);
        const npcs = [];
        for (const npc of document.npcs ?? []) {
            if (!isInBounds(npc.x, npc.y, width, height)) {
                continue;
            }
            const npcId = typeof npc.id === 'string' ? npc.id.trim() : '';
            const name = typeof npc.name === 'string' ? npc.name.trim() : '';
            if (!npcId || !name) {
                continue;
            }
            const shopItems = normalizeNpcShopItems(npc.shopItems);
            const fallbackChar = name[0] ?? '人';
            const rawChar = typeof npc.char === 'string' ? npc.char.trim() : '';
            npcs.push({
                id: npcId,
                name,
                x: npc.x,
                y: npc.y,
                char: rawChar ? (rawChar[0] ?? fallbackChar) : fallbackChar,
                color: typeof npc.color === 'string' && npc.color.trim() ? npc.color.trim() : '#d3c3a2',
                dialogue: typeof npc.dialogue === 'string' ? npc.dialogue : '',
                role: typeof npc.role === 'string' && npc.role.trim() ? npc.role.trim() : null,
                hasShop: shopItems.length > 0,
                shopItems,
                quests: normalizeNpcQuests(npc.quests),
            });
        }
        npcs.sort(compareNpcs);
        const portals = [];
        for (const portal of document.portals) {
            if (!isInBounds(portal.x, portal.y, width, height)) {
                continue;
            }
            const index = portals.length;
            portals.push({
                index,
                x: portal.x,
                y: portal.y,
                targetMapId: portal.targetMapId,
                targetX: portal.targetX,
                targetY: portal.targetY,
                kind: portal.kind ?? 'portal',
                trigger: portal.trigger ?? 'manual',
                routeDomain: normalizePortalRouteDomain(portal.routeDomain, document.routeDomain),
                allowPlayerOverlap: portal.allowPlayerOverlap === true,
                hidden: portal.hidden === true,
            });
            portalIndexByTile[getTileIndex(portal.x, portal.y, width)] = index;
            walkableMask[getTileIndex(portal.x, portal.y, width)] = 1;
        }
        for (const aura of document.auras ?? []) {
            if (!isInBounds(aura.x, aura.y, width, height) || !Number.isFinite(aura.value)) {
                continue;
            }
            baseAuraByTile[getTileIndex(aura.x, aura.y, width)] = Math.max(0, Math.trunc(aura.value));
        }
        return {
            id: document.id,
            name: document.name,
            width,
            height,
            routeDomain: normalizeRouteDomain(document.routeDomain),
            terrainRows: document.tiles.slice(),
            spawnX: clampPoint(document.spawnPoint.x, width),
            spawnY: clampPoint(document.spawnPoint.y, height),
            safeZones,
            landmarks,
            containers,
            npcs,
            portals,
            portalIndexByTile,
            safeZoneMask,
            walkableMask,
            blocksSightMask,
            baseAuraByTile,
            source: document,
        };
    }
};
exports.MapTemplateRepository = MapTemplateRepository;
exports.MapTemplateRepository = MapTemplateRepository = MapTemplateRepository_1 = __decorate([
    (0, common_1.Injectable)()
], MapTemplateRepository);
export { MapTemplateRepository, getTileIndex };
/**
 * normalizeSafeZones：执行核心业务逻辑。
 * @param input 输入参数。
 * @param width 参数说明。
 * @param height 参数说明。
 * @returns 函数返回值。
 */

function normalizeSafeZones(input, width, height) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        const zone = entry;
        if (!Number.isFinite(zone.x) || !Number.isFinite(zone.y) || !Number.isFinite(zone.radius)) {
            continue;
        }
        const x = Math.trunc(zone.x);
        const y = Math.trunc(zone.y);
        if (!isInBounds(x, y, width, height)) {
            continue;
        }
        result.push({
            x,
            y,
            radius: Math.max(0, Math.trunc(zone.radius)),
        });
    }
    return result.sort((left, right) => left.y - right.y || left.x - right.x || left.radius - right.radius);
}
/**
 * fillSafeZoneMask：执行核心业务逻辑。
 * @param mask 参数说明。
 * @param width 参数说明。
 * @param height 参数说明。
 * @param zone 参数说明。
 * @returns 函数返回值。
 */

function fillSafeZoneMask(mask, width, height, zone) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const maxDistanceSq = zone.radius * zone.radius;
    const minX = Math.max(0, zone.x - zone.radius);
    const maxX = Math.min(width - 1, zone.x + zone.radius);
    const minY = Math.max(0, zone.y - zone.radius);
    const maxY = Math.min(height - 1, zone.y + zone.radius);
    for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x - zone.x;
            const dy = y - zone.y;
            if ((dx * dx) + (dy * dy) > maxDistanceSq) {
                continue;
            }
            mask[getTileIndex(x, y, width)] = 1;
        }
    }
}
/**
 * normalizeLandmarks：执行核心业务逻辑。
 * @param input 输入参数。
 * @param width 参数说明。
 * @param height 参数说明。
 * @returns 函数返回值。
 */

function normalizeLandmarks(input, width, height) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        const landmark = entry;
        const id = typeof landmark.id === 'string' ? landmark.id.trim() : '';
        const name = typeof landmark.name === 'string' ? landmark.name.trim() : '';
        if (!id || !name || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
            continue;
        }
        const x = Math.trunc(landmark.x);
        const y = Math.trunc(landmark.y);
        if (!isInBounds(x, y, width, height)) {
            continue;
        }
        result.push({
            id,
            name,
            x,
            y,
            desc: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc : undefined,
            container: normalizeContainerRecord(landmark, x, y),
        });
    }
    return result.sort(compareLandmarks);
}
/**
 * normalizeContainerRecord：执行核心业务逻辑。
 * @param landmark 参数说明。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @returns 函数返回值。
 */

function normalizeContainerRecord(landmark, x, y) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const container = landmark.container;
    if (!container) {
        return undefined;
    }
    return {
        id: landmark.id.trim(),
        name: landmark.name.trim(),
        x,
        y,
        desc: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc : undefined,
        grade: normalizeContainerGrade(container.grade),
        refreshTicks: Number.isInteger(container.refreshTicks) && Number(container.refreshTicks) > 0
            ? Number(container.refreshTicks)
            : undefined,
        char: typeof container.char === 'string' && container.char.trim()
            ? container.char.trim().slice(0, 1)
            : undefined,
        color: typeof container.color === 'string' && container.color.trim()
            ? container.color.trim()
            : undefined,
        drops: normalizeContainerDrops(container.drops),
        lootPools: normalizeContainerLootPools(container.lootPools),
    };
}
/**
 * normalizeNpcShopItems：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeNpcShopItems(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        const raw = entry;
        const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
        const price = Number.isFinite(raw.price) ? Math.max(1, Math.trunc(raw.price ?? 0)) : 0;
        if (!itemId || price <= 0) {
            continue;
        }
        result.push({ itemId, price });
    }
    return result;
}
/**
 * normalizeNpcQuests：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeNpcQuests(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const quest = entry;
        const id = typeof quest.id === 'string' ? quest.id.trim() : '';
        const title = typeof quest.title === 'string' ? quest.title.trim() : '';
        const desc = typeof quest.desc === 'string' ? quest.desc.trim() : '';
        if (!id || !title || !desc) {
            continue;
        }
        result.push({
            ...quest,
            id,
            title,
            desc,
        });
    }
    return result;
}
/**
 * normalizeContainerDrops：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeContainerDrops(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const drop = entry;
        const itemId = typeof drop.itemId === 'string' ? drop.itemId.trim() : '';
        const name = typeof drop.name === 'string' ? drop.name.trim() : '';
        if (!itemId || !name || !Number.isFinite(drop.count)) {
            continue;
        }
        result.push({
            itemId,
            name,
            type: drop.type,
            count: Math.max(1, Math.trunc(drop.count)),
            chance: Number.isFinite(drop.chance) ? Number(drop.chance) : undefined,
        });
    }
    return result;
}
/**
 * normalizeContainerLootPools：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeContainerLootPools(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Array.isArray(input)) {
        return [];
    }
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
        const pool = entry;
        result.push({
            rolls: Number.isInteger(pool.rolls) && Number(pool.rolls) > 0 ? Number(pool.rolls) : undefined,
            chance: Number.isFinite(pool.chance) ? Number(pool.chance) : undefined,
            minLevel: Number.isInteger(pool.minLevel) && Number(pool.minLevel) > 0 ? Number(pool.minLevel) : undefined,
            maxLevel: Number.isInteger(pool.maxLevel) && Number(pool.maxLevel) > 0 ? Number(pool.maxLevel) : undefined,
            minGrade: normalizeOptionalContainerGrade(pool.minGrade),
            maxGrade: normalizeOptionalContainerGrade(pool.maxGrade),
            tagGroups: Array.isArray(pool.tagGroups)
                ? pool.tagGroups
                    .filter((group) => Array.isArray(group))
                    .map((group) => group.filter((tag) => typeof tag === 'string' && tag.trim().length > 0))
                    .filter((group) => group.length > 0)
                : undefined,
            countMin: Number.isInteger(pool.countMin) && Number(pool.countMin) > 0 ? Number(pool.countMin) : undefined,
            countMax: Number.isInteger(pool.countMax) && Number(pool.countMax) > 0 ? Number(pool.countMax) : undefined,
            allowDuplicates: pool.allowDuplicates === true || undefined,
        });
    }
    return result;
}
/**
 * compareLandmarks：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function compareLandmarks(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/**
 * compareContainers：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function compareContainers(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/**
 * indexDocumentNpcs：执行核心业务逻辑。
 * @param document 参数说明。
 * @param target 目标对象。
 * @returns 函数返回值。
 */

function indexDocumentNpcs(document, target) {
    for (const npc of document.npcs ?? []) {
        const npcId = typeof npc.id === 'string' ? npc.id.trim() : '';
        const npcName = typeof npc.name === 'string' ? npc.name.trim() : '';
        if (!npcId || !npcName) {
            continue;
        }
        if (target.has(npcId)) {
            continue;
        }
        target.set(npcId, {
            npcId,
            npcName,
            mapId: document.id,
            mapName: document.name,
            x: npc.x,
            y: npc.y,
        });
    }
}
/**
 * compareNpcs：执行核心业务逻辑。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 函数返回值。
 */

function compareNpcs(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/**
 * normalizeContainerGrade：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeContainerGrade(input) {
    return input === 'mortal'
        || input === 'yellow'
        || input === 'mystic'
        || input === 'earth'
        || input === 'heaven'
        || input === 'spirit'
        || input === 'saint'
        || input === 'emperor'
        ? input
        : 'mortal';
}
/**
 * normalizeOptionalContainerGrade：执行核心业务逻辑。
 * @param input 输入参数。
 * @returns 函数返回值。
 */

function normalizeOptionalContainerGrade(input) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (input === undefined || input === null || input === '') {
        return undefined;
    }
    return normalizeContainerGrade(input);
}
/**
 * clampPoint：执行核心业务逻辑。
 * @param value 参数说明。
 * @param size 参数说明。
 * @returns 函数返回值。
 */

function clampPoint(value, size) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}
/**
 * normalizeRouteDomain：执行核心业务逻辑。
 * @param routeDomain 参数说明。
 * @returns 函数返回值。
 */

function normalizeRouteDomain(routeDomain) {
    return routeDomain ?? 'system';
}
/**
 * normalizePortalRouteDomain：执行核心业务逻辑。
 * @param routeDomain 参数说明。
 * @param fallback 参数说明。
 * @returns 函数返回值。
 */

function normalizePortalRouteDomain(routeDomain, fallback) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (routeDomain === 'system' || routeDomain === 'sect' || routeDomain === 'personal' || routeDomain === 'dynamic') {
        return routeDomain;
    }
    return normalizeRouteDomain(fallback);
}
/**
 * isInBounds：执行状态校验并返回判断结果。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param width 参数说明。
 * @param height 参数说明。
 * @returns 函数返回值。
 */

function isInBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x < width && y < height;
}
/**
 * getTileIndex：按给定条件读取/查询数据。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param width 参数说明。
 * @returns 函数返回值。
 */

function getTileIndex(x, y, width) {
    return (y * width) + x;
}
