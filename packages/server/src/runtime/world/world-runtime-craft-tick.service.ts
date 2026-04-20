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
 * playerRuntimeService：对象字段。
 */

    playerRuntimeService;    
    /**
 * craftPanelRuntimeService：对象字段。
 */

    craftPanelRuntimeService;    
    /**
 * worldRuntimeEnhancementService：对象字段。
 */

    worldRuntimeEnhancementService;    
    /**
 * worldRuntimeAlchemyService：对象字段。
 */

    worldRuntimeAlchemyService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param craftPanelRuntimeService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @returns 无返回值（构造函数）。
 */

    constructor(playerRuntimeService, craftPanelRuntimeService, worldRuntimeEnhancementService, worldRuntimeAlchemyService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
    }    
    /**
 * advanceCraftJobs：执行核心业务逻辑。
 * @param playerIds player ID 集合。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
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
