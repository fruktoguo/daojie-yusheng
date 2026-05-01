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
    assertPlayerInstanceLeaseWritable(playerId, deps) {
        const location = deps.getPlayerLocation?.(playerId);
        const instance = location ? deps.getInstanceRuntime?.(location.instanceId) : null;
        if (instance && typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
            if (typeof deps.fenceInstanceRuntime === 'function') {
                deps.fenceInstanceRuntime(instance.meta.instanceId, 'player_write_lease_check_failed');
            }
            throw new common_1.ServiceUnavailableException(`地图实例 ${instance.meta.instanceId} 租约不可写`);
        }
    }

    assertInstanceLeaseWritable(instanceId, deps) {
        const instance = deps.getInstanceRuntime?.(instanceId);
        if (instance && typeof deps.isInstanceLeaseWritable === 'function' && !deps.isInstanceLeaseWritable(instance)) {
            if (typeof deps.fenceInstanceRuntime === 'function') {
                deps.fenceInstanceRuntime(instance.meta.instanceId, 'instance_write_lease_check_failed');
            }
            throw new common_1.ServiceUnavailableException(`地图实例 ${instance.meta.instanceId} 租约不可写`);
        }
    }
/**
 * dispatchRedeemCodes：判断RedeemCode是否满足条件。
 * @param playerId 玩家 ID。
 * @param codes 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */

    async dispatchRedeemCodes(playerId, codes, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeRedeemCodeService.dispatchRedeemCodes(playerId, codes, deps);
    }    
    /**
 * dispatchCastSkill：判断Cast技能是否满足条件。
 * @param playerId 玩家 ID。
 * @param skillId skill ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能相关状态。
 */

    async dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeCombatCommandService.dispatchCastSkill(playerId, skillId, targetPlayerId, targetMonsterId, targetRef, deps);
    }    
    /**
 * resolveLegacySkillTargetRef：读取Legacy技能目标Ref并返回结果。
 * @param attacker 参数说明。
 * @param skill 参数说明。
 * @param targetRef 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Legacy技能目标Ref相关状态。
 */

    resolveLegacySkillTargetRef(attacker, skill, targetRef, deps) {
        return deps.worldRuntimeCombatCommandService.resolveLegacySkillTargetRef(attacker, skill, targetRef, deps);
    }    
    /**
 * dispatchEngageBattle：判断EngageBattle是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param locked 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新EngageBattle相关状态。
 */

    async dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeCombatCommandService.dispatchEngageBattle(playerId, targetPlayerId, targetMonsterId, targetX, targetY, locked, deps);
    }    
    /**
 * dispatchCastSkillToMonster：判断Cast技能To怪物是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetMonsterId targetMonster ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能To怪物相关状态。
 */

    async dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps) {
        this.assertPlayerInstanceLeaseWritable(attacker.playerId, deps);
        return deps.worldRuntimeCombatCommandService.dispatchCastSkillToMonster(attacker, skillId, targetMonsterId, deps);
    }    
    /**
 * dispatchCastSkillToTile：判断Cast技能ToTile是否满足条件。
 * @param attacker 参数说明。
 * @param skillId skill ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cast技能ToTile相关状态。
 */

    async dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps) {
        this.assertPlayerInstanceLeaseWritable(attacker.playerId, deps);
        return deps.worldRuntimeCombatCommandService.dispatchCastSkillToTile(attacker, skillId, targetX, targetY, deps);
    }    
    /**
 * dispatchUseItem：判断Use道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    dispatchUseItem(playerId, slotIndex, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeUseItemService.dispatchUseItem(playerId, slotIndex, deps);
    }    
    /**
 * dispatchBreakthrough：判断Breakthrough是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Breakthrough相关状态。
 */

    dispatchBreakthrough(playerId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeProgressionService.dispatchBreakthrough(playerId, deps);
    }    
    /**
 * dispatchHeavenGateAction：判断HeavenGateAction是否满足条件。
 * @param playerId 玩家 ID。
 * @param action 参数说明。
 * @param element 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新HeavenGateAction相关状态。
 */

    dispatchHeavenGateAction(playerId, action, element, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeProgressionService.dispatchHeavenGateAction(playerId, action, element, deps);
    }    
    /**
 * dispatchBasicAttack：判断BasicAttack是否满足条件。
 * @param playerId 玩家 ID。
 * @param targetPlayerId targetPlayer ID。
 * @param targetMonsterId targetMonster ID。
 * @param targetX 参数说明。
 * @param targetY 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BasicAttack相关状态。
 */

    async dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeCombatCommandService.dispatchBasicAttack(playerId, targetPlayerId, targetMonsterId, targetX, targetY, deps);
    }    
    /**
 * dispatchDropItem：判断Drop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param count 数量。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    dispatchDropItem(playerId, slotIndex, count, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeItemGroundService.dispatchDropItem(playerId, slotIndex, count, deps);
    }    
    /**
 * dispatchTakeGround：判断Take地面是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param itemKey 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGround相关状态。
 */

    async dispatchTakeGround(playerId, sourceId, itemKey, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeItemGroundService.dispatchTakeGround(playerId, sourceId, itemKey, deps);
    }    
    /**
 * dispatchTakeGroundAll：判断Take地面All是否满足条件。
 * @param playerId 玩家 ID。
 * @param sourceId source ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    async dispatchTakeGroundAll(playerId, sourceId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeItemGroundService.dispatchTakeGroundAll(playerId, sourceId, deps);
    }    
    /**
 * dispatchBuyNpcShopItem：判断BuyNPCShop道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param itemId 道具 ID。
 * @param quantity 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新BuyNPCShop道具相关状态。
 */

    async dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeNpcShopService.dispatchBuyNpcShopItem(playerId, npcId, itemId, quantity, deps);
    }    
    /**
 * dispatchNpcInteraction：判断NPCInteraction是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新NPCInteraction相关状态。
 */

    async dispatchNpcInteraction(playerId, npcId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeNpcQuestWriteService.dispatchNpcInteraction(playerId, npcId, deps);
    }    
    /**
 * dispatchEquipItem：判断Equip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slotIndex 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip道具相关状态。
 */

    async dispatchEquipItem(playerId, slotIndex, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeEquipmentService.dispatchEquipItem(playerId, slotIndex, deps);
    }    
    /**
 * dispatchUnequipItem：判断Unequip道具是否满足条件。
 * @param playerId 玩家 ID。
 * @param slot 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip道具相关状态。
 */

    async dispatchUnequipItem(playerId, slot, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeEquipmentService.dispatchUnequipItem(playerId, slot, deps);
    }    
    /**
 * dispatchCultivateTechnique：判断Cultivate功法是否满足条件。
 * @param playerId 玩家 ID。
 * @param techniqueId technique ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cultivate功法相关状态。
 */

    dispatchCultivateTechnique(playerId, techniqueId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeCultivationService.dispatchCultivateTechnique(playerId, techniqueId, deps);
    }    
    /**
 * dispatchStartTechniqueActivity：统一开始技艺活动写侧入口。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    async dispatchStartTechniqueActivity(playerId, kind, payload, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        switch (kind) {
            case 'alchemy':
                return deps.worldRuntimeAlchemyService.dispatchStartAlchemy(playerId, payload, deps);
            case 'enhancement':
                return deps.worldRuntimeEnhancementService.dispatchStartEnhancement(playerId, payload, deps);
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
 * dispatchCancelTechniqueActivity：统一取消技艺活动写侧入口。
 * @param playerId 玩家 ID。
 * @param kind 技艺活动类型。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动相关状态。
 */

    async dispatchCancelTechniqueActivity(playerId, kind, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        switch (kind) {
            case 'alchemy':
                return deps.worldRuntimeAlchemyService.dispatchCancelAlchemy(playerId, deps);
            case 'enhancement':
                return deps.worldRuntimeEnhancementService.dispatchCancelEnhancement(playerId, deps);
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
 * dispatchStartAlchemy：判断开始炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

    async dispatchStartAlchemy(playerId, payload, deps) {
        return this.dispatchStartTechniqueActivity(playerId, 'alchemy', payload, deps);
    }    
    /**
 * dispatchCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

    async dispatchCancelAlchemy(playerId, deps) {
        return this.dispatchCancelTechniqueActivity(playerId, 'alchemy', deps);
    }    
    /**
 * dispatchSaveAlchemyPreset：判断Save炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

    dispatchSaveAlchemyPreset(playerId, payload, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeAlchemyService.dispatchSaveAlchemyPreset(playerId, payload, deps);
    }    
    /**
 * dispatchDeleteAlchemyPreset：判断Delete炼丹Preset是否满足条件。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeAlchemyService.dispatchDeleteAlchemyPreset(playerId, presetId, deps);
    }    
    /**
 * dispatchStartEnhancement：判断开始强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

    async dispatchStartEnhancement(playerId, payload, deps) {
        return this.dispatchStartTechniqueActivity(playerId, 'enhancement', payload, deps);
    }    
    /**
 * dispatchCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

    async dispatchCancelEnhancement(playerId, deps) {
        return this.dispatchCancelTechniqueActivity(playerId, 'enhancement', deps);
    }    
    /**
 * dispatchInteractNpcQuest：判断InteractNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新InteractNPC任务相关状态。
 */

    dispatchInteractNpcQuest(playerId, npcId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeNpcQuestWriteService.dispatchInteractNpcQuest(playerId, npcId, deps);
    }    
    /**
 * dispatchAcceptNpcQuest：判断AcceptNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新AcceptNPC任务相关状态。
 */

    dispatchAcceptNpcQuest(playerId, npcId, questId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimeNpcQuestWriteService.dispatchAcceptNpcQuest(playerId, npcId, questId, deps);
    }    
    /**
 * dispatchSubmitNpcQuest：判断SubmitNPC任务是否满足条件。
 * @param playerId 玩家 ID。
 * @param npcId npc ID。
 * @param questId quest ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新SubmitNPC任务相关状态。
 */

    async dispatchSubmitNpcQuest(playerId, npcId, questId, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        return deps.worldRuntimeNpcQuestWriteService.dispatchSubmitNpcQuest(playerId, npcId, questId, deps);
    }    
    /**
 * dispatchSpawnMonsterLoot：判断Spawn怪物掉落是否满足条件。
 * @param instanceId instance ID。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param monsterId monster ID。
 * @param rolls 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Spawn怪物掉落相关状态。
 */

    dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps) {
        this.assertInstanceLeaseWritable(instanceId, deps);
        deps.worldRuntimeMonsterSystemCommandService.dispatchSpawnMonsterLoot(instanceId, x, y, monsterId, rolls, deps);
    }    
    /**
 * dispatchDefeatMonster：判断Defeat怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Defeat怪物相关状态。
 */

    dispatchDefeatMonster(instanceId, runtimeId, deps) {
        this.assertInstanceLeaseWritable(instanceId, deps);
        deps.worldRuntimeMonsterSystemCommandService.dispatchDefeatMonster(instanceId, runtimeId, deps);
    }    
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    dispatchDamagePlayer(playerId, amount, deps) {
        this.assertPlayerInstanceLeaseWritable(playerId, deps);
        deps.worldRuntimePlayerCombatOutcomeService.dispatchDamagePlayer(playerId, amount, deps);
    }    
    /**
 * dispatchDamageMonster：判断Damage怪物是否满足条件。
 * @param instanceId instance ID。
 * @param runtimeId runtime ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage怪物相关状态。
 */

    dispatchDamageMonster(instanceId, runtimeId, amount, deps) {
        deps.worldRuntimeMonsterSystemCommandService.dispatchDamageMonster(instanceId, runtimeId, amount, deps);
    }    
    /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

    async handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
        return deps.worldRuntimePlayerCombatOutcomeService.handlePlayerMonsterKill(instance, monster, killerPlayerId, deps);
    }    
    /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

    async handlePlayerDefeat(playerId, deps, killerPlayerId = null) {
        return deps.worldRuntimePlayerCombatOutcomeService.handlePlayerDefeat(playerId, deps, killerPlayerId);
    }    
    /**
 * processPendingRespawns：处理待处理重生并更新相关状态。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Pending重生相关状态。
 */

    processPendingRespawns(deps) {
        deps.worldRuntimePlayerCombatOutcomeService.processPendingRespawns(deps);
    }    
    /**
 * respawnPlayer：执行重生玩家相关逻辑。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新重生玩家相关状态。
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
