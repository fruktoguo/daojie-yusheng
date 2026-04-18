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
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    dispatchCultivateTechnique(playerId, techniqueId, deps) {
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
