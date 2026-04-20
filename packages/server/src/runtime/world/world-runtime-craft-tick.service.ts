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
exports.WorldRuntimeCraftTickService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");
const world_runtime_enhancement_service_1 = require("./world-runtime-enhancement.service");
const world_runtime_alchemy_service_1 = require("./world-runtime-alchemy.service");

/** world-runtime craft tick orchestration：承接 craft job tick 推进编排。 */
let WorldRuntimeCraftTickService = class WorldRuntimeCraftTickService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：炼制面板运行态服务引用。
 */

    craftPanelRuntimeService;    
    /**
 * worldRuntimeEnhancementService：世界运行态强化服务引用。
 */

    worldRuntimeEnhancementService;    
    /**
 * worldRuntimeAlchemyService：世界运行态炼丹服务引用。
 */

    worldRuntimeAlchemyService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, craftPanelRuntimeService, worldRuntimeEnhancementService, worldRuntimeAlchemyService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
    }    
    /**
 * advanceCraftJobs：执行advance炼制Job相关逻辑。
 * @param playerIds player ID 集合。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新advance炼制Job相关状态。
 */

    advanceCraftJobs(playerIds, deps) {
        for (const playerId of playerIds) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            if (this.craftPanelRuntimeService.hasActiveAlchemyJob(player)) {
                this.worldRuntimeAlchemyService.tickAlchemy(playerId, player, deps);
            }
            if (this.craftPanelRuntimeService.hasActiveEnhancementJob(player)) {
                this.worldRuntimeEnhancementService.tickEnhancement(playerId, player, deps);
            }
        }
    }
};
exports.WorldRuntimeCraftTickService = WorldRuntimeCraftTickService;
exports.WorldRuntimeCraftTickService = WorldRuntimeCraftTickService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_runtime_enhancement_service_1.WorldRuntimeEnhancementService,
        world_runtime_alchemy_service_1.WorldRuntimeAlchemyService])
], WorldRuntimeCraftTickService);

export { WorldRuntimeCraftTickService };
