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
const legacy_gm_compat_service_1 = require("../compat/legacy/legacy-gm-compat.service");
const world_client_event_service_1 = require("./world-client-event.service");
let WorldProtocolProjectionService = class WorldProtocolProjectionService {
    legacyGmCompatService;
    worldClientEventService;
    constructor(legacyGmCompatService, worldClientEventService) {
        this.legacyGmCompatService = legacyGmCompatService;
        this.worldClientEventService = worldClientEventService;
    }
    emitTileDetail(client, payload) {
        const protocol = this.worldClientEventService.getExplicitProtocol(client);
        if (protocol !== 'legacy') {
            client.emit(shared_1.NEXT_S2C.TileDetail, payload);
        }
        if (protocol !== 'next') {
            client.emit(shared_1.S2C.TileRuntimeDetail, this.legacyGmCompatService.buildLegacyTileRuntimeDetail(resolveTileDetailMapId(payload), payload));
        }
    }
    emitTileLootInteraction(client, playerId, payload) {
        this.emitTileDetail(client, payload);
        this.worldClientEventService.emitLootWindowUpdate(client, playerId, payload.x, payload.y);
    }
};
exports.WorldProtocolProjectionService = WorldProtocolProjectionService;
exports.WorldProtocolProjectionService = WorldProtocolProjectionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_gm_compat_service_1.LegacyGmCompatService,
        world_client_event_service_1.WorldClientEventService])
], WorldProtocolProjectionService);
function resolveTileDetailMapId(payload) {
    return typeof payload?.mapId === 'string' ? payload.mapId.trim() : '';
}
