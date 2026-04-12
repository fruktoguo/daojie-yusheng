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
const runtime_gm_state_service_1 = require("../runtime/gm/runtime-gm-state.service");
let WorldGmSocketService = class WorldGmSocketService {
    runtimeGmStateService;
    constructor(runtimeGmStateService) {
        this.runtimeGmStateService = runtimeGmStateService;
    }
    emitState(client) {
        this.runtimeGmStateService.emitState(client);
    }
    enqueueSpawnBots(requesterPlayerId, count) {
        this.runtimeGmStateService.enqueueSpawnBots(requesterPlayerId, count);
        this.runtimeGmStateService.queueStatePush(requesterPlayerId);
    }
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.runtimeGmStateService.enqueueRemoveBots(playerIds, all);
        this.runtimeGmStateService.queueStatePush(requesterPlayerId);
    }
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.runtimeGmStateService.enqueueUpdatePlayer(payload);
        this.runtimeGmStateService.queueStatePush(requesterPlayerId);
    }
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.runtimeGmStateService.enqueueResetPlayer(playerId);
        this.runtimeGmStateService.queueStatePush(requesterPlayerId);
    }
};
exports.WorldGmSocketService = WorldGmSocketService;
exports.WorldGmSocketService = WorldGmSocketService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_state_service_1.RuntimeGmStateService])
], WorldGmSocketService);
