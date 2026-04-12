"use strict";
/** 模块实现文件，负责当前职责边界内的业务逻辑。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldProtocolProjectionService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** world_client_event_service_1：定义该变量以承载业务值。 */
const world_client_event_service_1 = require("./world-client-event.service");
/** WorldProtocolProjectionService：定义该变量以承载业务值。 */
let WorldProtocolProjectionService = class WorldProtocolProjectionService {
    worldClientEventService;
/** 构造函数：执行实例初始化流程。 */
    constructor(worldClientEventService) {
        this.worldClientEventService = worldClientEventService;
    }
/** emitTileDetail：执行对应的业务逻辑。 */
    emitTileDetail(client, payload) {
        const { emitLegacy, emitNext } = this.resolveProjectionEmission(client);
        if (emitNext) {
            client.emit(shared_1.NEXT_S2C.TileDetail, payload);
        }
        if (emitLegacy) {
            client.emit(shared_1.S2C.TileRuntimeDetail, buildLegacyTileRuntimeDetail(resolveTileDetailMapId(payload), payload));
        }
    }
/** emitTileLootInteraction：执行对应的业务逻辑。 */
    emitTileLootInteraction(client, playerId, payload) {
        this.emitTileDetail(client, payload);
        this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
/** resolveProjectionEmission：执行对应的业务逻辑。 */
    resolveProjectionEmission(client) {
        if (typeof this.worldClientEventService?.resolveProtocolEmission === 'function') {
            return this.worldClientEventService.resolveProtocolEmission(client);
        }
        if (typeof this.worldClientEventService?.getProtocol === 'function') {
/** protocol：定义该变量以承载业务值。 */
            const protocol = this.worldClientEventService.getProtocol(client);
            return {
                protocol,
/** emitLegacy：定义该变量以承载业务值。 */
                emitLegacy: protocol === 'legacy',
/** emitNext：定义该变量以承载业务值。 */
                emitNext: protocol !== 'legacy',
            };
        }
        return {
            protocol: null,
            emitLegacy: false,
            emitNext: true,
        };
    }
};
exports.WorldProtocolProjectionService = WorldProtocolProjectionService;
exports.WorldProtocolProjectionService = WorldProtocolProjectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_client_event_service_1.WorldClientEventService])
], WorldProtocolProjectionService);
/** resolveTileDetailMapId：执行对应的业务逻辑。 */
function resolveTileDetailMapId(payload) {
    return typeof payload?.mapId === 'string' ? payload.mapId.trim() : '';
}
/** buildLegacyTileRuntimeDetail：执行对应的业务逻辑。 */
function buildLegacyTileRuntimeDetail(mapId, payload) {
/** aura：定义该变量以承载业务值。 */
    const aura = Number.isFinite(payload?.aura) ? Math.trunc(payload.aura) : 0;
    return {
        mapId,
        x: payload.x,
        y: payload.y,
/** hp：定义该变量以承载业务值。 */
        hp: typeof payload?.hp === 'number' ? payload.hp : undefined,
/** maxHp：定义该变量以承载业务值。 */
        maxHp: typeof payload?.maxHp === 'number' ? payload.maxHp : undefined,
        resources: [buildLegacyAuraResource(aura)],
        entities: payload.entities?.map((entity) => entity.kind === 'npc'
            ? {
                ...entity,
                id: entity.id.startsWith('npc:') ? entity.id : `npc:${entity.id}`,
            }
            : entity),
    };
}
/** buildLegacyAuraResource：执行对应的业务逻辑。 */
function buildLegacyAuraResource(aura) {
    return {
        key: 'aura',
        label: '灵气',
        value: aura,
        effectiveValue: aura,
        level: (0, shared_1.getAuraLevel)(aura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE),
    };
}
