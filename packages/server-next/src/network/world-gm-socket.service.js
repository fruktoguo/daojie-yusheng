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
exports.WorldGmSocketService = void 0;
const common_1 = require("@nestjs/common");
const legacy_gm_compat_service_1 = require("../compat/legacy/legacy-gm-compat.service");
let WorldGmSocketService = class WorldGmSocketService {
    legacyGmCompatService;
    constructor(legacyGmCompatService) {
        this.legacyGmCompatService = legacyGmCompatService;
    }
    emitState(client) {
        this.legacyGmCompatService.emitState(client);
    }
    enqueueSpawnBots(requesterPlayerId, count) {
        this.legacyGmCompatService.enqueueSpawnBots(requesterPlayerId, count);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.legacyGmCompatService.enqueueRemoveBots(playerIds, all);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.legacyGmCompatService.enqueueUpdatePlayer(payload);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.legacyGmCompatService.enqueueResetPlayer(playerId);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
};
exports.WorldGmSocketService = WorldGmSocketService;
exports.WorldGmSocketService = WorldGmSocketService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [legacy_gm_compat_service_1.LegacyGmCompatService])
], WorldGmSocketService);
