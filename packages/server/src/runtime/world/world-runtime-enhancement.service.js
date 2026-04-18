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
exports.WorldRuntimeEnhancementService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");
const world_runtime_craft_mutation_service_1 = require("./world-runtime-craft-mutation.service");

/** world-runtime enhancement orchestration：承接强化写路径与面板刷新。 */
let WorldRuntimeEnhancementService = class WorldRuntimeEnhancementService {
    playerRuntimeService;
    craftPanelRuntimeService;
    worldRuntimeCraftMutationService;
    constructor(playerRuntimeService, craftPanelRuntimeService, worldRuntimeCraftMutationService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
    }
    dispatchStartEnhancement(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.startEnhancement(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动强化失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
    }
    dispatchCancelEnhancement(playerId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.cancelEnhancement(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消强化失败');
        }
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, result, 'enhancement', deps);
    }
    tickEnhancement(playerId, player, deps) {
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickEnhancement(player), 'enhancement', deps);
    }
};
exports.WorldRuntimeEnhancementService = WorldRuntimeEnhancementService;
exports.WorldRuntimeEnhancementService = WorldRuntimeEnhancementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_runtime_craft_mutation_service_1.WorldRuntimeCraftMutationService])
], WorldRuntimeEnhancementService);
