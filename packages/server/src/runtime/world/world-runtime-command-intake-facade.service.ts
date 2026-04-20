// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeCommandIntakeFacadeService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime command-intake facade：承接玩家输入、动作入口与 system enqueue facade。 */
let WorldRuntimeCommandIntakeFacadeService = class WorldRuntimeCommandIntakeFacadeService {
/**
 * enqueueMove：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param directionInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueMove(playerId, directionInput, deps) {
        return deps.worldRuntimeNavigationService.enqueueMove(playerId, directionInput, deps);
    }    
    /**
 * enqueueMoveTo：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param allowNearestReachableInput 参数说明。
 * @param packedPathInput 参数说明。
 * @param packedPathStepsInput 参数说明。
 * @param pathStartXInput 参数说明。
 * @param pathStartYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, deps) {
        return deps.worldRuntimeNavigationService.enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, deps);
    }    
    /**
 * usePortal：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    usePortal(playerId, deps) {
        return deps.worldRuntimeNavigationService.usePortal(playerId, deps);
    }    
    /**
 * navigateQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    navigateQuest(playerId, questIdInput, deps) {
        return deps.worldRuntimeNavigationService.navigateQuest(playerId, questIdInput, deps);
    }    
    /**
 * enqueueBasicAttack：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetXInput 参数说明。
 * @param targetYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }    
    /**
 * enqueueBattleTarget：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param locked 参数说明。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetXInput 参数说明。
 * @param targetYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }    
    /**
 * executeAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param targetInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    executeAction(playerId, actionIdInput, targetInput, deps) {
        return deps.worldRuntimeActionExecutionService.executeAction(playerId, actionIdInput, targetInput, deps);
    }    
    /**
 * executeLegacyNpcAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    executeLegacyNpcAction(playerId, npcId, deps) {
        return deps.worldRuntimeActionExecutionService.executeLegacyNpcAction(playerId, npcId, deps);
    }    
    /**
 * enqueueUseItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueUseItem(playerId, slotIndexInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUseItem(playerId, slotIndexInput, deps);
    }    
    /**
 * enqueueDropItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDropItem(playerId, slotIndexInput, countInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDropItem(playerId, slotIndexInput, countInput, deps);
    }    
    /**
 * enqueueTakeGround：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param itemKeyInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps);
    }    
    /**
 * enqueueTakeGroundAll：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueTakeGroundAll(playerId, sourceIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGroundAll(playerId, sourceIdInput, deps);
    }    
    /**
 * enqueueEquip：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueEquip(playerId, slotIndexInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueEquip(playerId, slotIndexInput, deps);
    }    
    /**
 * enqueueUnequip：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueUnequip(playerId, slotInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUnequip(playerId, slotInput, deps);
    }    
    /**
 * enqueueCultivate：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param techniqueIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueCultivate(playerId, techniqueIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCultivate(playerId, techniqueIdInput, deps);
    }    
    /**
 * enqueueStartAlchemy：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueStartAlchemy(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartAlchemy(playerId, payload, deps);
    }    
    /**
 * enqueueCancelAlchemy：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueCancelAlchemy(playerId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelAlchemy(playerId, deps);
    }    
    /**
 * enqueueSaveAlchemyPreset：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueSaveAlchemyPreset(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueSaveAlchemyPreset(playerId, payload, deps);
    }    
    /**
 * enqueueDeleteAlchemyPreset：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDeleteAlchemyPreset(playerId, presetId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDeleteAlchemyPreset(playerId, presetId, deps);
    }    
    /**
 * enqueueStartEnhancement：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueStartEnhancement(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartEnhancement(playerId, payload, deps);
    }    
    /**
 * enqueueCancelEnhancement：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueCancelEnhancement(playerId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelEnhancement(playerId, deps);
    }    
    /**
 * enqueueRedeemCodes：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param codesInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueRedeemCodes(playerId, codesInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueRedeemCodes(playerId, codesInput, deps);
    }    
    /**
 * enqueueHeavenGateAction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionInput 参数说明。
 * @param elementInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueHeavenGateAction(playerId, actionInput, elementInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueHeavenGateAction(playerId, actionInput, elementInput, deps);
    }    
    /**
 * enqueueCastSkill：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps);
    }    
    /**
 * enqueueCastSkillTargetRef：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps);
    }    
    /**
 * enqueueBuyNpcShopItem：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps) {
        return deps.worldRuntimeNpcShopService.enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps);
    }    
    /**
 * enqueueNpcInteraction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueNpcInteraction(playerId, actionIdInput, deps);
    }    
    /**
 * enqueueLegacyNpcInteraction：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueLegacyNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueLegacyNpcInteraction(playerId, actionIdInput, deps);
    }    
    /**
 * enqueueAcceptNpcQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }    
    /**
 * enqueueSubmitNpcQuest：执行核心业务逻辑。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }    
    /**
 * enqueueSpawnMonsterLoot：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps);
    }    
    /**
 * enqueueDefeatMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps);
    }    
    /**
 * enqueueDamageMonster：执行核心业务逻辑。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps);
    }    
    /**
 * enqueueDamagePlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamagePlayer(playerIdInput, amountInput, deps);
    }    
    /**
 * enqueueRespawnPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueRespawnPlayer(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueRespawnPlayer(playerIdInput, deps);
    }    
    /**
 * enqueueResetPlayerSpawn：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueResetPlayerSpawn(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueResetPlayerSpawn(playerIdInput, deps);
    }    
    /**
 * enqueueGmUpdatePlayer：执行核心业务逻辑。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueGmUpdatePlayer(input, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmUpdatePlayer(input);
    }    
    /**
 * enqueueGmResetPlayer：执行核心业务逻辑。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueGmResetPlayer(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmResetPlayer(playerIdInput);
    }    
    /**
 * enqueueGmSpawnBots：执行核心业务逻辑。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueGmSpawnBots(anchorPlayerIdInput, countInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }    
    /**
 * enqueueGmRemoveBots：执行核心业务逻辑。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 函数返回值。
 */

    enqueueGmRemoveBots(playerIdsInput, allInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
};
exports.WorldRuntimeCommandIntakeFacadeService = WorldRuntimeCommandIntakeFacadeService;
exports.WorldRuntimeCommandIntakeFacadeService = WorldRuntimeCommandIntakeFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeCommandIntakeFacadeService);

export { WorldRuntimeCommandIntakeFacadeService };
