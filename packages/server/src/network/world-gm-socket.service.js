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

const next_gm_contract_1 = require("../http/next/next-gm-contract");

const runtime_gm_state_service_1 = require("../runtime/gm/runtime-gm-state.service");

/** GM Socket 下发服务：将 GM 操作转换为 runtime gm state 队列。 */
let WorldGmSocketService = class WorldGmSocketService {
    runtimeGmStateService;
    constructor(runtimeGmStateService) {
        this.runtimeGmStateService = runtimeGmStateService;
    }

    /** 向请求者同步 GM 当前状态。 */
    emitState(client) {
        this.runtimeGmStateService.emitState(client);
    }
    queueStatePush(requesterPlayerId) {
        if (next_gm_contract_1.NEXT_GM_SOCKET_CONTRACT.pushStateAfterMutation) {
            this.runtimeGmStateService.queueStatePush(requesterPlayerId);
        }
    }

    /** 触发 GM 请求：新增机器人并刷新状态推送。 */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.runtimeGmStateService.enqueueSpawnBots(requesterPlayerId, count);
        this.queueStatePush(requesterPlayerId);
    }

    /** 触发 GM 请求：移除机器人并刷新状态推送。 */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.runtimeGmStateService.enqueueRemoveBots(playerIds, all);
        this.queueStatePush(requesterPlayerId);
    }

    /** 触发 GM 请求：更新玩家并推送状态。 */
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.runtimeGmStateService.enqueueUpdatePlayer(payload);
        this.queueStatePush(requesterPlayerId);
    }

    /** 触发 GM 请求：重置玩家并推送状态。 */
    enqueueResetPlayer(requesterPlayerId, playerId) {
        this.runtimeGmStateService.enqueueResetPlayer(playerId);
        this.queueStatePush(requesterPlayerId);
    }
};
exports.WorldGmSocketService = WorldGmSocketService;
exports.WorldGmSocketService = WorldGmSocketService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [runtime_gm_state_service_1.RuntimeGmStateService])
], WorldGmSocketService);
