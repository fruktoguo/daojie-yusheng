// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeGameplayWriteFacadeService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime gameplay-write facade：承接高层写侧 gameplay facade。 */
let WorldRuntimeGameplayWriteFacadeService = class WorldRuntimeGameplayWriteFacadeService {
/**
 * dispatchRedeemCodes：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchRedeemCodes(playerId, codes, deps) {
        deps.worldRuntimeRedeemCodeService.dispatchRedeemCodes(playerId, codes, deps);
    }    
    /**
 * dispatchCastSkill：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps);
    }    
    /**
 * resolveLegacySkillTargetRef：执行核心业务逻辑。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
        return deps.worldRuntimeCombatCommandService.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
    }    
    /**
 * dispatchEngageBattle：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        deps.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps);
    }    
    /**
 * dispatchCastSkillToMonster：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
    }    
    /**
 * dispatchCastSkillToTile：处理事件并驱动执行路径。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps);
    }    
    /**
 * dispatchUseItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchUseItem(playerId, slotIndex, deps) {
        deps.worldRuntimeUseItemService.dispatchUseItem(playerId, slotIndex, deps);
    }    
    /**
 * dispatchBreakthrough：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchBreakthrough(playerId, deps) {
        deps.worldRuntimeProgressionService.dispatchBreakthrough(playerId, deps);
    }    
    /**
 * dispatchHeavenGateAction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchHeavenGateAction(playerId, action, element, deps) {
        deps.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, action, element, deps);
    }    
    /**
 * dispatchBasicAttack：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
        deps.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps);
    }    
    /**
 * dispatchDropItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDropItem(playerId, slotIndex, count, deps) {
        deps.worldRuntimeItemGroundService.dispatchDropItem(playerId, slotIndex, count, deps);
    }    
    /**
 * dispatchTakeGround：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        deps.worldRuntimeItemGroundService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }    
    /**
 * dispatchTakeGroundAll：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchTakeGroundAll(playerId, sourceId, deps) {
        deps.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }    
    /**
 * dispatchBuyNpcShopItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps) {
        deps.worldRuntimeNpcShopService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps);
    }    
    /**
 * dispatchNpcInteraction：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchNpcInteraction(playerId, npcId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchNpcInteraction(playerId, npcId, deps);
    }    
    /**
 * dispatchEquipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchEquipItem(playerId, slotIndex, deps) {
        deps.worldRuntimeEquipmentService.dispatchEquipItem(playerId, slotIndex, deps);
    }    
    /**
 * dispatchUnequipItem：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchUnequipItem(playerId, slot, deps) {
        deps.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, slot, deps);
    }    
    /**
 * dispatchCultivateTechnique：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCultivateTechnique(playerId, techniqueId, deps) {
        deps.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, techniqueId, deps);
    }    
    /**
 * dispatchStartAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchStartAlchemy(playerId, payload, deps) {
        deps.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, payload, deps);
    }    
    /**
 * dispatchCancelAlchemy：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCancelAlchemy(playerId, deps) {
        deps.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps);
    }    
    /**
 * dispatchSaveAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchSaveAlchemyPreset(playerId, payload, deps) {
        deps.worldRuntimeAlchemyService.dispatchSaveAlchemyPreset(playerId, payload, deps);
    }    
    /**
 * dispatchDeleteAlchemyPreset：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
        deps.worldRuntimeAlchemyService.dispatchDeleteAlchemyPreset(playerId, presetId, deps);
    }    
    /**
 * dispatchStartEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchStartEnhancement(playerId, payload, deps) {
        deps.worldRuntimeEnhancementService.dispatchStartEnhancement(playerId, payload, deps);
    }    
    /**
 * dispatchCancelEnhancement：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchCancelEnhancement(playerId, deps) {
        deps.worldRuntimeEnhancementService.dispatchCancelEnhancement(playerId, deps);
    }    
    /**
 * dispatchInteractNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchInteractNpcQuest(playerId, npcId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchInteractNpcQuest(playerId, npcId, deps);
    }    
    /**
 * dispatchAcceptNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchAcceptNpcQuest(playerId, npcId, questId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchAcceptNpcQuest(playerId, npcId, questId, deps);
    }    
    /**
 * dispatchSubmitNpcQuest：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchSubmitNpcQuest(playerId, npcId, questId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuest(playerId, npcId, questId, deps);
    }    
    /**
 * dispatchSpawnMonsterLoot：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps);
    }    
    /**
 * dispatchDefeatMonster：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDefeatMonster(instanceId, runtimeId, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchDefeatMonster(instanceId, runtimeId, deps);
    }    
    /**
 * dispatchDamagePlayer：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDamagePlayer(playerId, amount, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.dispatchDamagePlayer(playerId, amount, deps);
    }    
    /**
 * dispatchDamageMonster：处理事件并驱动执行路径。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    dispatchDamageMonster(instanceId, runtimeId, amount, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchDamageMonster(instanceId, runtimeId, amount, deps);
    }    
    /**
 * handlePlayerMonsterKill：处理事件并驱动执行路径。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }    
    /**
 * handlePlayerDefeat：处理事件并驱动执行路径。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    handlePlayerDefeat(playerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.handlePlayerDefeat(playerId, deps);
    }    
    /**
 * processPendingRespawns：处理事件并驱动执行路径。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    processPendingRespawns(deps) {
        deps.worldRuntimePlayerCombatOutcomeService.processPendingRespawns(deps);
    }    
    /**
 * respawnPlayer：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    respawnPlayer(playerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.respawnPlayer(playerId, deps);
    }
};
exports.WorldRuntimeGameplayWriteFacadeService = WorldRuntimeGameplayWriteFacadeService;
exports.WorldRuntimeGameplayWriteFacadeService = WorldRuntimeGameplayWriteFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeGameplayWriteFacadeService);

export { WorldRuntimeGameplayWriteFacadeService };
