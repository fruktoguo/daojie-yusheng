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
exports.WorldRuntimeCultivationService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");

/** world-runtime cultivation orchestration：承接主修功法切换结算。 */
let WorldRuntimeCultivationService = class WorldRuntimeCultivationService {
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
 * dispatchCultivateTechnique：判断Cultivate功法是否满足条件。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cultivate功法相关状态。
 */

    dispatchCultivateTechnique(playerId, techniqueId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const blockReason = deps.craftPanelRuntimeService.getCultivationBlockReason(player);
        if (blockReason) {
            throw new common_1.BadRequestException(blockReason);
        }
        this.playerRuntimeService.cultivateTechnique(playerId, techniqueId);
        if (!techniqueId) {
            deps.queuePlayerNotice(playerId, '已停止当前修炼', 'info');
            return;
        }
        const techniqueName = this.playerRuntimeService.getTechniqueName(playerId, techniqueId) ?? techniqueId;
        deps.queuePlayerNotice(playerId, `开始修炼 ${techniqueName}`, 'success');
    }
};
exports.WorldRuntimeCultivationService = WorldRuntimeCultivationService;
exports.WorldRuntimeCultivationService = WorldRuntimeCultivationService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimeCultivationService);

export { WorldRuntimeCultivationService };
