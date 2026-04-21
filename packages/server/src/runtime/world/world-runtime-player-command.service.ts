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
exports.WorldRuntimePlayerCommandService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_use_item_service_1 = require("./world-runtime-use-item.service");
const world_runtime_equipment_service_1 = require("./world-runtime-equipment.service");
const world_runtime_item_ground_service_1 = require("./world-runtime-item-ground.service");
const world_runtime_navigation_service_1 = require("./world-runtime-navigation.service");
const world_runtime_combat_command_service_1 = require("./world-runtime-combat-command.service");
const world_runtime_cultivation_service_1 = require("./world-runtime-cultivation.service");
const world_runtime_alchemy_service_1 = require("./world-runtime-alchemy.service");
const world_runtime_enhancement_service_1 = require("./world-runtime-enhancement.service");
const world_runtime_redeem_code_service_1 = require("./world-runtime-redeem-code.service");
const world_runtime_progression_service_1 = require("./world-runtime-progression.service");
const world_runtime_npc_shop_service_1 = require("./world-runtime-npc-shop.service");
const world_runtime_npc_quest_write_service_1 = require("./world-runtime-npc-quest-write.service");

/** world-runtime player-command orchestration：承接玩家命令路由与门禁。 */
let WorldRuntimePlayerCommandService = class WorldRuntimePlayerCommandService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * worldRuntimeUseItemService：世界运行态Use道具服务引用。
 */

    worldRuntimeUseItemService;    
    /**
 * worldRuntimeEquipmentService：世界运行态装备服务引用。
 */

    worldRuntimeEquipmentService;    
    /**
 * worldRuntimeItemGroundService：世界运行态道具Ground服务引用。
 */

    worldRuntimeItemGroundService;    
    /**
 * worldRuntimeNavigationService：世界运行态导航服务引用。
 */

    worldRuntimeNavigationService;    
    /**
 * worldRuntimeCombatCommandService：世界运行态战斗Command服务引用。
 */

    worldRuntimeCombatCommandService;    
    /**
 * worldRuntimeCultivationService：世界运行态Cultivation服务引用。
 */

    worldRuntimeCultivationService;    
    /**
 * worldRuntimeAlchemyService：世界运行态炼丹服务引用。
 */

    worldRuntimeAlchemyService;    
    /**
 * worldRuntimeEnhancementService：世界运行态强化服务引用。
 */

    worldRuntimeEnhancementService;    
    /**
 * worldRuntimeRedeemCodeService：世界运行态RedeemCode服务引用。
 */

    worldRuntimeRedeemCodeService;    
    /**
 * worldRuntimeProgressionService：世界运行态修炼进度服务引用。
 */

    worldRuntimeProgressionService;    
    /**
 * worldRuntimeNpcShopService：世界运行态NPCShop服务引用。
 */

    worldRuntimeNpcShopService;    
    /**
 * worldRuntimeNpcQuestWriteService：世界运行态NPC任务Write服务引用。
 */

    worldRuntimeNpcQuestWriteService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @param worldRuntimeUseItemService 参数说明。
 * @param worldRuntimeEquipmentService 参数说明。
 * @param worldRuntimeItemGroundService 参数说明。
 * @param worldRuntimeNavigationService 参数说明。
 * @param worldRuntimeCombatCommandService 参数说明。
 * @param worldRuntimeCultivationService 参数说明。
 * @param worldRuntimeAlchemyService 参数说明。
 * @param worldRuntimeEnhancementService 参数说明。
 * @param worldRuntimeRedeemCodeService 参数说明。
 * @param worldRuntimeProgressionService 参数说明。
 * @param worldRuntimeNpcShopService 参数说明。
 * @param worldRuntimeNpcQuestWriteService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService, worldRuntimeUseItemService, worldRuntimeEquipmentService, worldRuntimeItemGroundService, worldRuntimeNavigationService, worldRuntimeCombatCommandService, worldRuntimeCultivationService, worldRuntimeAlchemyService, worldRuntimeEnhancementService, worldRuntimeRedeemCodeService, worldRuntimeProgressionService, worldRuntimeNpcShopService, worldRuntimeNpcQuestWriteService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeUseItemService = worldRuntimeUseItemService;
        this.worldRuntimeEquipmentService = worldRuntimeEquipmentService;
        this.worldRuntimeItemGroundService = worldRuntimeItemGroundService;
        this.worldRuntimeNavigationService = worldRuntimeNavigationService;
        this.worldRuntimeCombatCommandService = worldRuntimeCombatCommandService;
        this.worldRuntimeCultivationService = worldRuntimeCultivationService;
        this.worldRuntimeAlchemyService = worldRuntimeAlchemyService;
        this.worldRuntimeEnhancementService = worldRuntimeEnhancementService;
        this.worldRuntimeRedeemCodeService = worldRuntimeRedeemCodeService;
        this.worldRuntimeProgressionService = worldRuntimeProgressionService;
        this.worldRuntimeNpcShopService = worldRuntimeNpcShopService;
        this.worldRuntimeNpcQuestWriteService = worldRuntimeNpcQuestWriteService;
    }    
    /**
 * dispatchStartTechniqueActivity：统一开始技艺活动命令分发。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    dispatchStartTechniqueActivity(playerId, kind, payload, deps) {
        switch (kind) {
            case 'alchemy':
                this.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, payload, deps);
                return;
            case 'enhancement':
                this.worldRuntimeEnhancementService.dispatchStartEnhancement(playerId, payload, deps);
                return;
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.worldRuntimeLootContainerService.dispatchStartGather(playerId, payload, deps),
                    'gather',
                    deps,
                );
                return;
        }
    }    
    /**
 * dispatchCancelTechniqueActivity：统一取消技艺活动命令分发。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    dispatchCancelTechniqueActivity(playerId, kind, deps) {
        switch (kind) {
            case 'alchemy':
                this.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps);
                return;
            case 'enhancement':
                this.worldRuntimeEnhancementService.dispatchCancelEnhancement(playerId, deps);
                return;
            case 'gather':
                deps.worldRuntimeCraftMutationService.flushCraftMutation(
                    playerId,
                    deps.worldRuntimeLootContainerService.dispatchCancelGather(playerId, deps),
                    'gather',
                    deps,
                );
                return;
        }
    }    
    /**
 * dispatchPlayerCommand：判断玩家Command是否满足条件。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Command相关状态。
 */

    dispatchPlayerCommand(playerId, command, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0 && command.kind !== 'redeemCodes') {
            return;
        }
        switch (command.kind) {
            case 'useItem':
                this.worldRuntimeUseItemService.dispatchUseItem(playerId, command.slotIndex, deps);
                return;
            case 'equip':
                this.worldRuntimeEquipmentService.dispatchEquipItem(playerId, command.slotIndex, deps);
                return;
            case 'dropItem':
                this.worldRuntimeItemGroundService.dispatchDropItem(playerId, command.slotIndex, command.count, deps);
                return;
            case 'moveTo':
                this.worldRuntimeNavigationService.dispatchMoveTo(playerId, command.x, command.y, command.allowNearestReachable, command.clientPathHint, deps);
                return;
            case 'basicAttack':
                this.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, deps);
                return;
            case 'engageBattle':
                this.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, command.targetPlayerId, command.targetMonsterId, command.targetX, command.targetY, command.locked, deps);
                return;
            case 'takeGround':
                this.worldRuntimeItemGroundService.dispatchTakeGround(playerId, command.sourceId, command.itemKey, deps);
                return;
            case 'takeGroundAll':
                this.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, command.sourceId, deps);
                return;
            case 'unequip':
                this.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, command.slot, deps);
                return;
            case 'cultivate':
                this.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, command.techniqueId, deps);
                return;
            case 'startAlchemy':
                this.dispatchStartTechniqueActivity(playerId, 'alchemy', command.payload, deps);
                return;
            case 'cancelAlchemy':
                this.dispatchCancelTechniqueActivity(playerId, 'alchemy', deps);
                return;
            case 'saveAlchemyPreset':
                this.worldRuntimeAlchemyService.dispatchSaveAlchemyPreset(playerId, command.payload, deps);
                return;
            case 'deleteAlchemyPreset':
                this.worldRuntimeAlchemyService.dispatchDeleteAlchemyPreset(playerId, command.presetId, deps);
                return;
            case 'startEnhancement':
                this.dispatchStartTechniqueActivity(playerId, 'enhancement', command.payload, deps);
                return;
            case 'cancelEnhancement':
                this.dispatchCancelTechniqueActivity(playerId, 'enhancement', deps);
                return;
            case 'startGather':
                this.dispatchStartTechniqueActivity(playerId, 'gather', command.payload, deps);
                return;
            case 'cancelGather':
                this.dispatchCancelTechniqueActivity(playerId, 'gather', deps);
                return;
            case 'redeemCodes':
                this.worldRuntimeRedeemCodeService.dispatchRedeemCodes(playerId, command.codes, deps);
                return;
            case 'breakthrough':
                this.worldRuntimeProgressionService.dispatchBreakthrough(playerId, deps);
                return;
            case 'heavenGateAction':
                this.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, command.action, command.element, deps);
                return;
            case 'castSkill':
                this.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, command.skillId, command.targetPlayerId, command.targetMonsterId, command.targetRef, deps);
                return;
            case 'buyNpcShopItem':
                this.worldRuntimeNpcShopService.dispatchBuyNpcShopItem(playerId, command.npcId, command.itemId, command.quantity, deps);
                return;
            case 'npcInteraction':
                this.worldRuntimeNpcQuestWriteService.dispatchNpcInteraction(playerId, command.npcId, deps);
                return;
            case 'interactNpcQuest':
                this.worldRuntimeNpcQuestWriteService.dispatchInteractNpcQuest(playerId, command.npcId, deps);
                return;
            case 'acceptNpcQuest':
                this.worldRuntimeNpcQuestWriteService.dispatchAcceptNpcQuest(playerId, command.npcId, command.questId, deps);
                return;
            case 'submitNpcQuest':
                this.worldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuest(playerId, command.npcId, command.questId, deps);
                return;
        }
    }
};
exports.WorldRuntimePlayerCommandService = WorldRuntimePlayerCommandService;
exports.WorldRuntimePlayerCommandService = WorldRuntimePlayerCommandService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_use_item_service_1.WorldRuntimeUseItemService,
        world_runtime_equipment_service_1.WorldRuntimeEquipmentService,
        world_runtime_item_ground_service_1.WorldRuntimeItemGroundService,
        world_runtime_navigation_service_1.WorldRuntimeNavigationService,
        world_runtime_combat_command_service_1.WorldRuntimeCombatCommandService,
        world_runtime_cultivation_service_1.WorldRuntimeCultivationService,
        world_runtime_alchemy_service_1.WorldRuntimeAlchemyService,
        world_runtime_enhancement_service_1.WorldRuntimeEnhancementService,
        world_runtime_redeem_code_service_1.WorldRuntimeRedeemCodeService,
        world_runtime_progression_service_1.WorldRuntimeProgressionService,
        world_runtime_npc_shop_service_1.WorldRuntimeNpcShopService,
        world_runtime_npc_quest_write_service_1.WorldRuntimeNpcQuestWriteService])
], WorldRuntimePlayerCommandService);

export { WorldRuntimePlayerCommandService };
