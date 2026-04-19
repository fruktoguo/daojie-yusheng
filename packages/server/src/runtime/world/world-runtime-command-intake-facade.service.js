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
    enqueueMove(playerId, directionInput, deps) {
        return deps.worldRuntimeNavigationService.enqueueMove(playerId, directionInput, deps);
    }
    enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, deps) {
        return deps.worldRuntimeNavigationService.enqueueMoveTo(playerId, xInput, yInput, allowNearestReachableInput, packedPathInput, packedPathStepsInput, pathStartXInput, pathStartYInput, deps);
    }
    usePortal(playerId, deps) {
        return deps.worldRuntimeNavigationService.usePortal(playerId, deps);
    }
    navigateQuest(playerId, questIdInput, deps) {
        return deps.worldRuntimeNavigationService.navigateQuest(playerId, questIdInput, deps);
    }
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps);
    }
    executeAction(playerId, actionIdInput, targetInput, deps) {
        return deps.worldRuntimeActionExecutionService.executeAction(playerId, actionIdInput, targetInput, deps);
    }
    executeLegacyNpcAction(playerId, npcId, deps) {
        return deps.worldRuntimeActionExecutionService.executeLegacyNpcAction(playerId, npcId, deps);
    }
    enqueueUseItem(playerId, slotIndexInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUseItem(playerId, slotIndexInput, deps);
    }
    enqueueDropItem(playerId, slotIndexInput, countInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDropItem(playerId, slotIndexInput, countInput, deps);
    }
    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps);
    }
    enqueueTakeGroundAll(playerId, sourceIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueTakeGroundAll(playerId, sourceIdInput, deps);
    }
    enqueueEquip(playerId, slotIndexInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueEquip(playerId, slotIndexInput, deps);
    }
    enqueueUnequip(playerId, slotInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueUnequip(playerId, slotInput, deps);
    }
    enqueueCultivate(playerId, techniqueIdInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCultivate(playerId, techniqueIdInput, deps);
    }
    enqueueStartAlchemy(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartAlchemy(playerId, payload, deps);
    }
    enqueueCancelAlchemy(playerId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelAlchemy(playerId, deps);
    }
    enqueueSaveAlchemyPreset(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueSaveAlchemyPreset(playerId, payload, deps);
    }
    enqueueDeleteAlchemyPreset(playerId, presetId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueDeleteAlchemyPreset(playerId, presetId, deps);
    }
    enqueueStartEnhancement(playerId, payload, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueStartEnhancement(playerId, payload, deps);
    }
    enqueueCancelEnhancement(playerId, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCancelEnhancement(playerId, deps);
    }
    enqueueRedeemCodes(playerId, codesInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueRedeemCodes(playerId, codesInput, deps);
    }
    enqueueHeavenGateAction(playerId, actionInput, elementInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueHeavenGateAction(playerId, actionInput, elementInput, deps);
    }
    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps);
    }
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps) {
        return deps.worldRuntimePlayerCommandEnqueueService.enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps);
    }
    enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps) {
        return deps.worldRuntimeNpcShopService.enqueueBuyNpcShopItem(playerId, npcIdInput, itemIdInput, quantityInput, deps);
    }
    enqueueNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueNpcInteraction(playerId, actionIdInput, deps);
    }
    enqueueLegacyNpcInteraction(playerId, actionIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueLegacyNpcInteraction(playerId, actionIdInput, deps);
    }
    enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueAcceptNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }
    enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps) {
        return deps.worldRuntimeNpcQuestWriteService.enqueueSubmitNpcQuest(playerId, npcIdInput, questIdInput, deps);
    }
    enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueSpawnMonsterLoot(instanceIdInput, monsterIdInput, xInput, yInput, rollsInput, deps);
    }
    enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDefeatMonster(instanceIdInput, runtimeIdInput, deps);
    }
    enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamageMonster(instanceIdInput, runtimeIdInput, amountInput, deps);
    }
    enqueueDamagePlayer(playerIdInput, amountInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueDamagePlayer(playerIdInput, amountInput, deps);
    }
    enqueueRespawnPlayer(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueRespawnPlayer(playerIdInput, deps);
    }
    enqueueResetPlayerSpawn(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueResetPlayerSpawn(playerIdInput, deps);
    }
    enqueueGmUpdatePlayer(input, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmUpdatePlayer(input);
    }
    enqueueGmResetPlayer(playerIdInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmResetPlayer(playerIdInput);
    }
    enqueueGmSpawnBots(anchorPlayerIdInput, countInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmSpawnBots(anchorPlayerIdInput, countInput);
    }
    enqueueGmRemoveBots(playerIdsInput, allInput, deps) {
        return deps.worldRuntimeSystemCommandEnqueueService.enqueueGmRemoveBots(playerIdsInput, allInput);
    }
};
exports.WorldRuntimeCommandIntakeFacadeService = WorldRuntimeCommandIntakeFacadeService;
exports.WorldRuntimeCommandIntakeFacadeService = WorldRuntimeCommandIntakeFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeCommandIntakeFacadeService);
