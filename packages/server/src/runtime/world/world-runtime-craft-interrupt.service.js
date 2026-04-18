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
exports.WorldRuntimeCraftInterruptService = void 0;

const common_1 = require("@nestjs/common");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");
const world_runtime_craft_mutation_service_1 = require("./world-runtime-craft-mutation.service");
const world_runtime_alchemy_service_1 = require("./world-runtime-alchemy.service");

/** world-runtime craft interrupt orchestration：承接跨 craft 面板的中断写路径。 */
let WorldRuntimeCraftInterruptService = class WorldRuntimeCraftInterruptService {
    craftPanelRuntimeService;
    worldRuntimeCraftMutationService;
    worldRuntimeAlchemyService;
    constructor(craftPanelRuntimeService, worldRuntimeCraftMutationService, worldRuntimeAlchemyService) {
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldRuntimeCraftMutationService = worldRuntimeCraftMutationService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
    }
    interruptCraftForReason(playerId, player, reason, deps) {
        this.worldRuntimeAlchemyService.interruptAlchemyForReason(playerId, player, reason, deps);
        this.worldRuntimeCraftMutationService.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(player, reason), 'enhancement', deps);
    }
};
exports.WorldRuntimeCraftInterruptService = WorldRuntimeCraftInterruptService;
exports.WorldRuntimeCraftInterruptService = WorldRuntimeCraftInterruptService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_runtime_craft_mutation_service_1.WorldRuntimeCraftMutationService,
        world_runtime_alchemy_service_1.WorldRuntimeAlchemyService])
], WorldRuntimeCraftInterruptService);
