"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldProtocolProjectionService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const world_client_event_service_1 = require("./world-client-event.service");
let WorldProtocolProjectionService = class WorldProtocolProjectionService {
    worldClientEventService;
    constructor(worldClientEventService) {
        this.worldClientEventService = worldClientEventService;
    }
    emitTileDetail(client, payload) {
        const { emitLegacy, emitNext } = this.resolveProjectionEmission(client);
        if (emitNext) {
            client.emit(shared_1.NEXT_S2C.TileDetail, payload);
        }
        if (emitLegacy) {
            client.emit(shared_1.S2C.TileRuntimeDetail, buildLegacyTileRuntimeDetail(resolveTileDetailMapId(payload), payload));
        }
    }
    emitTileLootInteraction(client, playerId, payload) {
        this.emitTileDetail(client, payload);
        this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
    resolveProjectionEmission(client) {
        if (typeof this.worldClientEventService?.resolveProtocolEmission === 'function') {
            return this.worldClientEventService.resolveProtocolEmission(client);
        }
        if (typeof this.worldClientEventService?.getProtocol === 'function') {
            const protocol = this.worldClientEventService.getProtocol(client);
            return {
                protocol,
                emitLegacy: protocol === 'legacy',
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
function resolveTileDetailMapId(payload) {
    return typeof payload?.mapId === 'string' ? payload.mapId.trim() : '';
}
function buildLegacyTileRuntimeDetail(mapId, payload) {
    const aura = Number.isFinite(payload?.aura) ? Math.trunc(payload.aura) : 0;
    return {
        mapId,
        x: payload.x,
        y: payload.y,
        hp: typeof payload?.hp === 'number' ? payload.hp : undefined,
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
function buildLegacyAuraResource(aura) {
    return {
        key: 'aura',
        label: '灵气',
        value: aura,
        effectiveValue: aura,
        level: (0, shared_1.getAuraLevel)(aura, shared_1.DEFAULT_AURA_LEVEL_BASE_VALUE),
    };
}
