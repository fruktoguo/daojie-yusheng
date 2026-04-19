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
    dispatchRedeemCodes(playerId, codes, deps) {
        deps.worldRuntimeRedeemCodeService.dispatchRedeemCodes(playerId, codes, deps);
    }
    dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps);
    }
    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
        return deps.worldRuntimeCombatCommandService.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
    }
    dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        deps.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps);
    }
    dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
    }
    dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
        deps.worldRuntimeCombatCommandService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps);
    }
    dispatchUseItem(playerId, slotIndex, deps) {
        deps.worldRuntimeUseItemService.dispatchUseItem(playerId, slotIndex, deps);
    }
    dispatchBreakthrough(playerId, deps) {
        deps.worldRuntimeProgressionService.dispatchBreakthrough(playerId, deps);
    }
    dispatchHeavenGateAction(playerId, action, element, deps) {
        deps.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, action, element, deps);
    }
    dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
        deps.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps);
    }
    dispatchDropItem(playerId, slotIndex, count, deps) {
        deps.worldRuntimeItemGroundService.dispatchDropItem(playerId, slotIndex, count, deps);
    }
    dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        deps.worldRuntimeItemGroundService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }
    dispatchTakeGroundAll(playerId, sourceId, deps) {
        deps.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }
    dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps) {
        deps.worldRuntimeNpcShopService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps);
    }
    dispatchNpcInteraction(playerId, npcId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchNpcInteraction(playerId, npcId, deps);
    }
    dispatchEquipItem(playerId, slotIndex, deps) {
        deps.worldRuntimeEquipmentService.dispatchEquipItem(playerId, slotIndex, deps);
    }
    dispatchUnequipItem(playerId, slot, deps) {
        deps.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, slot, deps);
    }
    dispatchCultivateTechnique(playerId, techniqueId, deps) {
        deps.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, techniqueId, deps);
    }
    dispatchStartAlchemy(playerId, payload, deps) {
        deps.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, payload, deps);
    }
    dispatchCancelAlchemy(playerId, deps) {
        deps.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps);
    }
    dispatchSaveAlchemyPreset(playerId, payload, deps) {
        deps.worldRuntimeAlchemyService.dispatchSaveAlchemyPreset(playerId, payload, deps);
    }
    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
        deps.worldRuntimeAlchemyService.dispatchDeleteAlchemyPreset(playerId, presetId, deps);
    }
    dispatchStartEnhancement(playerId, payload, deps) {
        deps.worldRuntimeEnhancementService.dispatchStartEnhancement(playerId, payload, deps);
    }
    dispatchCancelEnhancement(playerId, deps) {
        deps.worldRuntimeEnhancementService.dispatchCancelEnhancement(playerId, deps);
    }
    dispatchInteractNpcQuest(playerId, npcId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchInteractNpcQuest(playerId, npcId, deps);
    }
    dispatchAcceptNpcQuest(playerId, npcId, questId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchAcceptNpcQuest(playerId, npcId, questId, deps);
    }
    dispatchSubmitNpcQuest(playerId, npcId, questId, deps) {
        deps.worldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuest(playerId, npcId, questId, deps);
    }
    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps);
    }
    dispatchDefeatMonster(instanceId, runtimeId, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchDefeatMonster(instanceId, runtimeId, deps);
    }
    dispatchDamagePlayer(playerId, amount, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.dispatchDamagePlayer(playerId, amount, deps);
    }
    dispatchDamageMonster(instanceId, runtimeId, amount, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchDamageMonster(instanceId, runtimeId, amount, deps);
    }
    handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }
    handlePlayerDefeat(playerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.handlePlayerDefeat(playerId, deps);
    }
    processPendingRespawns(deps) {
        deps.worldRuntimePlayerCombatOutcomeService.processPendingRespawns(deps);
    }
    respawnPlayer(playerId, deps) {
        deps.worldRuntimePlayerCombatOutcomeService.respawnPlayer(playerId, deps);
    }
};
exports.WorldRuntimeGameplayWriteFacadeService = WorldRuntimeGameplayWriteFacadeService;
exports.WorldRuntimeGameplayWriteFacadeService = WorldRuntimeGameplayWriteFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeGameplayWriteFacadeService);
