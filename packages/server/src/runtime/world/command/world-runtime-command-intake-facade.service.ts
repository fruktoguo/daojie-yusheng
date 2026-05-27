/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Injectable } from '@nestjs/common';
import { WorldRuntimeSystemCommandEnqueueService } from './world-runtime-system-command-enqueue.service';

/** world-runtime command-intake facade：承接玩家输入、动作入口与 system enqueue facade。 */
@Injectable()
export class WorldRuntimeCommandIntakeFacadeService {
    /** GM/system enqueue 真源，避免外部继续透传整个 worldRuntimeService。 */
    worldRuntimeSystemCommandEnqueueService;
    constructor(worldRuntimeSystemCommandEnqueueService: WorldRuntimeSystemCommandEnqueueService) {
        this.worldRuntimeSystemCommandEnqueueService = worldRuntimeSystemCommandEnqueueService;
    }
/**
 * enqueueMove：处理Move并更新相关状态。
 * @param playerId 玩家 ID。
 * @param directionInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Move相关状态。
 */

    enqueueMove(playerId, directionInput, deps) {
        return deps.worldRuntimeNavigationService.enqueueMove(playerId, directionInput, deps);
    }
    /**
 * enqueueMoveTo：处理MoveTo并更新相关状态。
 * @param playerId 玩家 ID。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param allowNearestReachableInput 参数说明。
 * @param packedPathInput 参数说明。
 * @param packedPathStepsInput 参数说明。
 * @param pathStartXInput 参数说明。
 * @param pathStartYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新MoveTo相关状态。
 */

    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, targetMapIdInput, deps) {
        if (!deps && targetMapIdInput && typeof targetMapIdInput === 'object') {
            deps = targetMapIdInput;
            targetMapIdInput = null;
        }
        return deps.worldRuntimeNavigationService.enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, targetMapIdInput, deps);
    }
    /**
 * usePortal：执行use传送门相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新usePortal相关状态。
 */

    usePortal(playerId, deps) {
        return deps.worldRuntimeNavigationService.usePortal(playerId, deps);
    }
    /**
 * navigateQuest：执行navigate任务相关逻辑。
 * @param playerId 玩家 ID。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新navigate任务相关状态。
 */

    navigateQuest(playerId, questIdInput, deps) {
        return deps.worldRuntimeNavigationService.navigateQuest(playerId, questIdInput, deps);
    }
    /**
 * enqueueBasicAttack：处理BasicAttack并更新相关状态。
 * @param playerId 玩家 ID。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetXInput 参数说明。
 * @param targetYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }
    /**
 * enqueueBattleTarget：读取Battle目标并返回结果。
 * @param playerId 玩家 ID。
 * @param locked 参数说明。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetXInput 参数说明。
 * @param targetYInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Battle目标相关状态。
 */

    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }
    /**
 * executeAction：执行executeAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param targetInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新executeAction相关状态。
 */

    executeAction(playerId, actionIdInput, targetInput, deps) {
        return deps.worldRuntimeActionExecutionService.executeAction(playerId, actionIdInput, targetInput, deps);
    }
    /**
 * executeLegacyNpcAction：执行executeLegacyNPCAction相关逻辑。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新executeLegacyNPCAction相关状态。
 */

    executeLegacyNpcAction(playerId, npcId, deps) {
        return deps.worldRuntimeActionExecutionService.executeLegacyNpcAction(playerId, npcId, deps);
    }
    /**
 * enqueueUseItem：处理Use道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payloadInput 背包物品操作载荷或旧客户端槽位参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    enqueueUseItem(playerId, payloadInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUseItem(playerId, payloadInput, deps);
    }
    enqueueCreateFormation(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCreateFormation(playerId, payload, deps);
    }
    enqueueSetFormationActive(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueSetFormationActive(playerId, payload, deps);
    }
    enqueueRefillFormation(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueRefillFormation(playerId, payload, deps);
    }
    /**
 * enqueueDropItem：处理Drop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payloadInput 背包物品操作载荷或旧客户端槽位参数。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    enqueueDropItem(playerId, payloadInput, countInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDropItem(playerId, payloadInput, countInput, deps);
    }
    /**
 * enqueueTakeGround：处理Take地面并更新相关状态。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param itemKeyInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps);
    }
    /**
 * enqueueTakeGroundAll：处理Take地面All并更新相关状态。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    enqueueTakeGroundAll(playerId, sourceIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGroundAll(playerId, sourceIdInput, deps);
    }
    /**
 * enqueueEquip：处理Equip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payloadInput 背包物品操作载荷或旧客户端槽位参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip相关状态。
 */

    enqueueEquip(playerId, payloadInput, deps, expectedItemInstanceId?: string) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueEquip(playerId, payloadInput, deps, expectedItemInstanceId);
    }
    /**
 * enqueueUnequip：处理Unequip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip相关状态。
 */

    enqueueUnequip(playerId, slotInput, deps, expectedItemInstanceId?: string) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUnequip(playerId, slotInput, deps, expectedItemInstanceId);
    }
    /**
 * enqueueCultivate：处理Cultivate并更新相关状态。
 * @param playerId 玩家 ID。
 * @param techniqueIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cultivate相关状态。
 */

    enqueueCultivate(playerId, techniqueIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCultivate(playerId, techniqueIdInput, deps);
    }
    enqueueStartTechniqueTransmission(playerId, learnerPlayerIdInput, techniqueIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartTechniqueTransmission(playerId, learnerPlayerIdInput, techniqueIdInput, deps);
    }
    enqueueCancelTechniqueTransmission(playerId, techniqueIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelTechniqueTransmission(playerId, techniqueIdInput, deps);
    }
    /**
 * enqueueStartAlchemy：处理开始炼丹并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

    enqueueStartAlchemy(playerId, payload, deps) {
        return this.enqueueStartTechniqueActivity(playerId, 'alchemy', payload, deps);
    }
    /**
 * enqueueCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

    enqueueCancelAlchemy(playerId, deps) {
        return this.enqueueCancelTechniqueActivity(playerId, 'alchemy', deps);
    }
    /**
 * enqueueSaveAlchemyPreset：处理Save炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

    enqueueSaveAlchemyPreset(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueSaveAlchemyPreset(playerId, payload, deps);
    }
    /**
 * enqueueDeleteAlchemyPreset：处理Delete炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

    enqueueDeleteAlchemyPreset(playerId, presetId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDeleteAlchemyPreset(playerId, presetId, deps);
    }
    /**
 * enqueueStartEnhancement：处理开始强化并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

    enqueueStartEnhancement(playerId, payload, deps) {
        return this.enqueueStartTechniqueActivity(playerId, 'enhancement', payload, deps);
    }
    /**
 * enqueueCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

    enqueueCancelEnhancement(playerId, deps) {
        return this.enqueueCancelTechniqueActivity(playerId, 'enhancement', deps);
    }
    /**
 * enqueueStartTechniqueActivity：统一技艺活动开始入队入口。
 * @param playerId 玩家 ID。
 * @param kind 参数说明。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动开始入队相关状态。
 */

    enqueueStartTechniqueActivity(playerId, kind, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartTechniqueActivity(playerId, kind, payload, deps);
    }
    /**
 * enqueueCancelTechniqueActivity：统一技艺活动取消入队入口。
 * @param playerId 玩家 ID。
 * @param kind 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动取消入队相关状态。
 */

    enqueueCancelTechniqueActivity(playerId, kind, deps, cancelRef = null) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelTechniqueActivity(playerId, kind, deps, cancelRef);
    }
    /**
 * enqueueRedeemCodes：处理RedeemCode并更新相关状态。
 * @param playerId 玩家 ID。
 * @param codesInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */

    enqueueRedeemCodes(playerId, codesInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueRedeemCodes(playerId, codesInput, deps);
    }
    /**
 * enqueueHeavenGateAction：处理HeavenGateAction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionInput 参数说明。
 * @param elementInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

    enqueueHeavenGateAction(playerId, actionInput, elementInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueHeavenGateAction(playerId, actionInput, elementInput, deps);
    }
    /**
 * enqueueCastSkill：处理Cast技能并更新相关状态。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetPlayerIdInput 参数说明。
 * @param targetMonsterIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps);
    }
    /**
 * enqueueCastSkillTargetRef：读取Cast技能目标Ref并返回结果。
 * @param playerId 玩家 ID。
 * @param skillIdInput 参数说明。
 * @param targetRefInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能目标Ref相关状态。
 */

    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps);
    }
    /**
 * enqueueBuyNpcShopItem：处理BuyNPCShop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param itemIdInput 参数说明。
 * @param quantityInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps) {
        return deps.worldRuntimeNpcShopService.enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps);
    }
    /**
 * enqueueNpcInteraction：处理NPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

    enqueueNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueNpcInteraction(playerId, actionIdInput, deps);
    }
    /**
 * enqueueLegacyNpcInteraction：处理LegacyNPCInteraction并更新相关状态。
 * @param playerId 玩家 ID。
 * @param actionIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新LegacyNPCInteraction相关状态。
 */

    enqueueLegacyNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueLegacyNpcInteraction(playerId, actionIdInput, deps);
    }
    /**
 * enqueueAcceptNpcQuest：处理AcceptNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }
    /**
 * enqueueSubmitNpcQuest：处理SubmitNPC任务并更新相关状态。
 * @param playerId 玩家 ID。
 * @param npcIdInput 参数说明。
 * @param questIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }
    /**
 * enqueueSpawnMonsterLoot：处理Spawn怪物掉落并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param monsterIdInput 参数说明。
 * @param xInput 参数说明。
 * @param yInput 参数说明。
 * @param rollsInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps);
    }
    /**
 * enqueueDefeatMonster：处理Defeat怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps);
    }
    /**
 * enqueueDamageMonster：处理Damage怪物并更新相关状态。
 * @param instanceIdInput 参数说明。
 * @param runtimeIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps);
    }
    /**
 * enqueueDamagePlayer：处理Damage玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param amountInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamagePlayer(playerIdInput, amountInput, deps);
    }
    /**
 * enqueueRespawnPlayer：处理重生玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
 */

    enqueueRespawnPlayer(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueRespawnPlayer(playerIdInput, deps);
    }
    /**
 * enqueueResetPlayerSpawn：处理Reset玩家Spawn并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Reset玩家Spawn相关状态。
 */

    enqueueResetPlayerSpawn(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueResetPlayerSpawn(playerIdInput, deps);
    }
    /**
 * enqueueReturnToSpawn：处理遁返到复活点并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新遁返相关状态。
 */

    enqueueReturnToSpawn(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueReturnToSpawn(playerIdInput, deps);
    }
    /**
 * enqueueGmUpdatePlayer：处理GMUpdate玩家并更新相关状态。
 * @param input 输入参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMUpdate玩家相关状态。
 */

    enqueueGmUpdatePlayer(input) {
        return this.worldRuntimeSystemCommandEnqueueService.enqueueGmUpdatePlayer(input);
    }
    /**
 * enqueueGmResetPlayer：处理GMReset玩家并更新相关状态。
 * @param playerIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMReset玩家相关状态。
 */

    enqueueGmResetPlayer(playerIdInput) {
        return this.worldRuntimeSystemCommandEnqueueService.enqueueGmResetPlayer(playerIdInput);
    }
    /**
 * enqueueGmSpawnBots：处理GMSpawnBot并更新相关状态。
 * @param anchorPlayerIdInput 参数说明。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMSpawnBot相关状态。
 */

    enqueueGmSpawnBots(anchorPlayerIdInput, countInput) {
        return this.worldRuntimeSystemCommandEnqueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    /**
 * enqueueGmRemoveBots：处理GMRemoveBot并更新相关状态。
 * @param playerIdsInput 参数说明。
 * @param allInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新GMRemoveBot相关状态。
 */

    enqueueGmRemoveBots(playerIdsInput, allInput) {
        return this.worldRuntimeSystemCommandEnqueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
};
