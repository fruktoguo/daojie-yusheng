// @ts-nocheck
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
exports.WorldRuntimeProgressionService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");

/** world-runtime progression orchestration：承接突破与天门动作结算。 */
let WorldRuntimeProgressionService = class WorldRuntimeProgressionService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * dispatchBreakthrough：判断Breakthrough是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Breakthrough相关状态。
 */

    dispatchBreakthrough(playerId, deps) {
        return this.playerRuntimeService.attemptBreakthrough(playerId, deps.resolveCurrentTickForPlayerId(playerId));
    }    
    /** dispatchRootFoundationRefine：凝练根基。 */
    dispatchRootFoundationRefine(playerId, deps) {
        return this.playerRuntimeService.refineRootFoundation(playerId, deps.resolveCurrentTickForPlayerId(playerId));
    }
    /**
 * dispatchHeavenGateAction：判断HeavenGateAction是否满足条件。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

    dispatchHeavenGateAction(playerId, action, element, deps) {
        return this.playerRuntimeService.handleHeavenGateAction(playerId, action, element, deps.resolveCurrentTickForPlayerId(playerId));
    }
};
exports.WorldRuntimeProgressionService = WorldRuntimeProgressionService;
exports.WorldRuntimeProgressionService = WorldRuntimeProgressionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeProgressionService);

export { WorldRuntimeProgressionService };
