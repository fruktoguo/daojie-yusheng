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
/**
 * GM（游戏管理员）Socket服务
 *
 * 负责处理GM的Socket连接和命令，通过兼容层调用legacy的GM服务
 */
let WorldGmSocketService = class WorldGmSocketService {
    /** Legacy GM兼容服务 */
    legacyGmCompatService;
    constructor(legacyGmCompatService) {
        this.legacyGmCompatService = legacyGmCompatService;
    }
    /**
     * 发送GM状态
     * @param client WebSocket客户端
     */
    emitState(client) {
        this.legacyGmCompatService.emitState(client);
    }
    /**
     * 队列化生成机器人
     * @param requesterPlayerId 请求玩家ID
     * @param count 机器人数量
     */
    enqueueSpawnBots(requesterPlayerId, count) {
        this.legacyGmCompatService.enqueueSpawnBots(requesterPlayerId, count);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    /**
     * 队列化移除机器人
     * @param requesterPlayerId 请求玩家ID
     * @param playerIds 要移除的玩家ID列表
     * @param all 是否移除所有机器人
     */
    enqueueRemoveBots(requesterPlayerId, playerIds, all) {
        this.legacyGmCompatService.enqueueRemoveBots(playerIds, all);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    /**
     * 队列化更新玩家信息
     * @param requesterPlayerId 请求玩家ID
     * @param payload 更新载荷
     */
    enqueueUpdatePlayer(requesterPlayerId, payload) {
        this.legacyGmCompatService.enqueueUpdatePlayer(payload);
        this.legacyGmCompatService.queueStatePush(requesterPlayerId);
    }
    /**
     * 队列化重置玩家
     * @param requesterPlayerId 请求玩家ID
     * @param playerId 要重置的玩家ID
     */
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
