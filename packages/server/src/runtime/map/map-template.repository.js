"use strict";
/** __createBinding：定义该变量以承载业务值。 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
/** desc：定义该变量以承载业务值。 */
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
/** __setModuleDefault：定义该变量以承载业务值。 */
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __importStar：定义该变量以承载业务值。 */
var __importStar = (this && this.__importStar) || (function () {
/** ownKeys：执行对应的业务逻辑。 */
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
/** ar：定义该变量以承载业务值。 */
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
/** result：定义该变量以承载业务值。 */
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
/** MapTemplateRepository_1：定义该变量以承载业务值。 */
var MapTemplateRepository_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MapTemplateRepository = void 0;
exports.getTileIndex = getTileIndex;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** fs：定义该变量以承载业务值。 */
const fs = __importStar(require("fs"));
/** path：定义该变量以承载业务值。 */
const path = __importStar(require("path"));
/** project_path_1：定义该变量以承载业务值。 */
const project_path_1 = require("../../common/project-path");
/** MapTemplateRepository：定义该变量以承载业务值。 */
let MapTemplateRepository = MapTemplateRepository_1 = class MapTemplateRepository {
    logger = new common_1.Logger(MapTemplateRepository_1.name);
    templates = new Map();
    npcLocationById = new Map();
    questSourceById = new Map();
/** onModuleInit：执行对应的业务逻辑。 */
    onModuleInit() {
        this.loadAll();
    }
/** listSummaries：执行对应的业务逻辑。 */
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
/** list：执行对应的业务逻辑。 */
    list() {
        return Array.from(this.templates.values());
    }
/** getOrThrow：执行对应的业务逻辑。 */
    getOrThrow(templateId) {
/** template：定义该变量以承载业务值。 */
        const template = this.templates.get(templateId);
        if (!template) {
            throw new Error(`未找到地图模板：${templateId}`);
        }
        return template;
    }
/** has：执行对应的业务逻辑。 */
    has(templateId) {
        return this.templates.has(templateId);
    }
/** getNpcLocation：执行对应的业务逻辑。 */
    getNpcLocation(npcId) {
        return this.npcLocationById.get(npcId) ?? null;
    }
/** getQuestSource：执行对应的业务逻辑。 */
    getQuestSource(questId) {
        return this.questSourceById.get(questId) ?? null;
    }
/** loadAll：执行对应的业务逻辑。 */
    loadAll() {
        this.templates.clear();
        this.npcLocationById.clear();
        this.questSourceById.clear();
/** mapsDir：定义该变量以承载业务值。 */
        const mapsDir = (0, project_path_1.resolveProjectPath)('packages', 'server', 'data', 'maps');
/** files：定义该变量以承载业务值。 */
        const files = fs.readdirSync(mapsDir)
            .filter((file) => file.endsWith('.json'))
            .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'));
/** documents：定义该变量以承载业务值。 */
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
/** buildTemplate：执行对应的业务逻辑。 */
    buildTemplate(document) {
/** width：定义该变量以承载业务值。 */
        const width = document.width;
/** height：定义该变量以承载业务值。 */
        const height = document.height;
/** size：定义该变量以承载业务值。 */
        const size = width * height;
/** walkableMask：定义该变量以承载业务值。 */
        const walkableMask = new Uint8Array(size);
/** blocksSightMask：定义该变量以承载业务值。 */
        const blocksSightMask = new Uint8Array(size);
/** portalIndexByTile：定义该变量以承载业务值。 */
        const portalIndexByTile = new Int32Array(size);
/** safeZoneMask：定义该变量以承载业务值。 */
        const safeZoneMask = new Uint8Array(size);
/** baseAuraByTile：定义该变量以承载业务值。 */
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
/** safeZones：定义该变量以承载业务值。 */
        const safeZones = normalizeSafeZones(document.safeZones, width, height);
        for (const safeZone of safeZones) {
            fillSafeZoneMask(safeZoneMask, width, height, safeZone);
        }
/** landmarks：定义该变量以承载业务值。 */
        const landmarks = normalizeLandmarks(document.landmarks, width, height);
/** containers：定义该变量以承载业务值。 */
        const containers = landmarks
            .flatMap((landmark) => landmark.container ? [landmark.container] : [])
            .sort(compareContainers);
/** npcs：定义该变量以承载业务值。 */
        const npcs = [];
        for (const npc of document.npcs ?? []) {
            if (!isInBounds(npc.x, npc.y, width, height)) {
                continue;
            }
/** npcId：定义该变量以承载业务值。 */
            const npcId = typeof npc.id === 'string' ? npc.id.trim() : '';
/** name：定义该变量以承载业务值。 */
            const name = typeof npc.name === 'string' ? npc.name.trim() : '';
            if (!npcId || !name) {
                continue;
            }
/** shopItems：定义该变量以承载业务值。 */
            const shopItems = normalizeNpcShopItems(npc.shopItems);
/** fallbackChar：定义该变量以承载业务值。 */
            const fallbackChar = name[0] ?? '人';
/** rawChar：定义该变量以承载业务值。 */
            const rawChar = typeof npc.char === 'string' ? npc.char.trim() : '';
            npcs.push({
                id: npcId,
                name,
                x: npc.x,
                y: npc.y,
                char: rawChar ? (rawChar[0] ?? fallbackChar) : fallbackChar,
/** color：定义该变量以承载业务值。 */
                color: typeof npc.color === 'string' && npc.color.trim() ? npc.color.trim() : '#d3c3a2',
/** dialogue：定义该变量以承载业务值。 */
                dialogue: typeof npc.dialogue === 'string' ? npc.dialogue : '',
/** role：定义该变量以承载业务值。 */
                role: typeof npc.role === 'string' && npc.role.trim() ? npc.role.trim() : null,
                hasShop: shopItems.length > 0,
                shopItems,
                quests: normalizeNpcQuests(npc.quests),
            });
        }
        npcs.sort(compareNpcs);
/** portals：定义该变量以承载业务值。 */
        const portals = [];
        for (const portal of document.portals) {
            if (!isInBounds(portal.x, portal.y, width, height)) {
                continue;
            }
/** index：定义该变量以承载业务值。 */
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
/** allowPlayerOverlap：定义该变量以承载业务值。 */
                allowPlayerOverlap: portal.allowPlayerOverlap === true,
/** hidden：定义该变量以承载业务值。 */
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
/** normalizeSafeZones：执行对应的业务逻辑。 */
function normalizeSafeZones(input, width, height) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        const zone = entry;
        if (!Number.isFinite(zone.x) || !Number.isFinite(zone.y) || !Number.isFinite(zone.radius)) {
            continue;
        }
/** x：定义该变量以承载业务值。 */
        const x = Math.trunc(zone.x);
/** y：定义该变量以承载业务值。 */
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
/** fillSafeZoneMask：执行对应的业务逻辑。 */
function fillSafeZoneMask(mask, width, height, zone) {
/** maxDistanceSq：定义该变量以承载业务值。 */
    const maxDistanceSq = zone.radius * zone.radius;
/** minX：定义该变量以承载业务值。 */
    const minX = Math.max(0, zone.x - zone.radius);
/** maxX：定义该变量以承载业务值。 */
    const maxX = Math.min(width - 1, zone.x + zone.radius);
/** minY：定义该变量以承载业务值。 */
    const minY = Math.max(0, zone.y - zone.radius);
/** maxY：定义该变量以承载业务值。 */
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
/** normalizeLandmarks：执行对应的业务逻辑。 */
function normalizeLandmarks(input, width, height) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        const landmark = entry;
        const id = typeof landmark.id === 'string' ? landmark.id.trim() : '';
/** name：定义该变量以承载业务值。 */
        const name = typeof landmark.name === 'string' ? landmark.name.trim() : '';
        if (!id || !name || !Number.isFinite(landmark.x) || !Number.isFinite(landmark.y)) {
            continue;
        }
/** x：定义该变量以承载业务值。 */
        const x = Math.trunc(landmark.x);
/** y：定义该变量以承载业务值。 */
        const y = Math.trunc(landmark.y);
        if (!isInBounds(x, y, width, height)) {
            continue;
        }
        result.push({
            id,
            name,
            x,
            y,
/** desc：定义该变量以承载业务值。 */
            desc: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc : undefined,
            container: normalizeContainerRecord(landmark, x, y),
        });
    }
    return result.sort(compareLandmarks);
}
/** normalizeContainerRecord：执行对应的业务逻辑。 */
function normalizeContainerRecord(landmark, x, y) {
/** container：定义该变量以承载业务值。 */
    const container = landmark.container;
    if (!container) {
        return undefined;
    }
    return {
        id: landmark.id.trim(),
        name: landmark.name.trim(),
        x,
        y,
/** desc：定义该变量以承载业务值。 */
        desc: typeof landmark.desc === 'string' && landmark.desc.trim() ? landmark.desc : undefined,
        grade: normalizeContainerGrade(container.grade),
        refreshTicks: Number.isInteger(container.refreshTicks) && Number(container.refreshTicks) > 0
            ? Number(container.refreshTicks)
            : undefined,
/** char：定义该变量以承载业务值。 */
        char: typeof container.char === 'string' && container.char.trim()
            ? container.char.trim().slice(0, 1)
            : undefined,
/** color：定义该变量以承载业务值。 */
        color: typeof container.color === 'string' && container.color.trim()
            ? container.color.trim()
            : undefined,
        drops: normalizeContainerDrops(container.drops),
        lootPools: normalizeContainerLootPools(container.lootPools),
    };
}
/** normalizeNpcShopItems：执行对应的业务逻辑。 */
function normalizeNpcShopItems(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        const raw = entry;
        const itemId = typeof raw.itemId === 'string' ? raw.itemId.trim() : '';
/** price：定义该变量以承载业务值。 */
        const price = Number.isFinite(raw.price) ? Math.max(1, Math.trunc(raw.price ?? 0)) : 0;
        if (!itemId || price <= 0) {
            continue;
        }
        result.push({ itemId, price });
    }
    return result;
}
/** normalizeNpcQuests：执行对应的业务逻辑。 */
function normalizeNpcQuests(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** quest：定义该变量以承载业务值。 */
        const quest = entry;
/** id：定义该变量以承载业务值。 */
        const id = typeof quest.id === 'string' ? quest.id.trim() : '';
/** title：定义该变量以承载业务值。 */
        const title = typeof quest.title === 'string' ? quest.title.trim() : '';
/** desc：定义该变量以承载业务值。 */
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
/** normalizeContainerDrops：执行对应的业务逻辑。 */
function normalizeContainerDrops(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** drop：定义该变量以承载业务值。 */
        const drop = entry;
/** itemId：定义该变量以承载业务值。 */
        const itemId = typeof drop.itemId === 'string' ? drop.itemId.trim() : '';
/** name：定义该变量以承载业务值。 */
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
/** normalizeContainerLootPools：执行对应的业务逻辑。 */
function normalizeContainerLootPools(input) {
    if (!Array.isArray(input)) {
        return [];
    }
/** result：定义该变量以承载业务值。 */
    const result = [];
    for (const entry of input) {
        if (!entry || typeof entry !== 'object') {
            continue;
        }
/** pool：定义该变量以承载业务值。 */
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
/** allowDuplicates：定义该变量以承载业务值。 */
            allowDuplicates: pool.allowDuplicates === true || undefined,
        });
    }
    return result;
}
/** compareLandmarks：执行对应的业务逻辑。 */
function compareLandmarks(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** compareContainers：执行对应的业务逻辑。 */
function compareContainers(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** indexDocumentNpcs：执行对应的业务逻辑。 */
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
/** compareNpcs：执行对应的业务逻辑。 */
function compareNpcs(left, right) {
    return left.y - right.y || left.x - right.x || left.id.localeCompare(right.id, 'zh-Hans-CN');
}
/** normalizeContainerGrade：执行对应的业务逻辑。 */
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
/** normalizeOptionalContainerGrade：执行对应的业务逻辑。 */
function normalizeOptionalContainerGrade(input) {
    if (input === undefined || input === null || input === '') {
        return undefined;
    }
    return normalizeContainerGrade(input);
}
/** clampPoint：执行对应的业务逻辑。 */
function clampPoint(value, size) {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(size - 1, Math.trunc(value)));
}
/** normalizeRouteDomain：执行对应的业务逻辑。 */
function normalizeRouteDomain(routeDomain) {
    return routeDomain ?? 'system';
}
/** normalizePortalRouteDomain：执行对应的业务逻辑。 */
function normalizePortalRouteDomain(routeDomain, fallback) {
    if (routeDomain === 'system' || routeDomain === 'sect' || routeDomain === 'personal' || routeDomain === 'dynamic') {
        return routeDomain;
    }
    return normalizeRouteDomain(fallback);
}
/** isInBounds：执行对应的业务逻辑。 */
function isInBounds(x, y, width, height) {
    return x >= 0 && y >= 0 && x < width && y < height;
}
/** getTileIndex：执行对应的业务逻辑。 */
function getTileIndex(x, y, width) {
    return (y * width) + x;
}
//# sourceMappingURL=map-template.repository.js.map