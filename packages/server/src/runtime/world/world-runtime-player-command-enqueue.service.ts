// @ts-nocheck
"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") {
        r = Reflect.decorate(decorators, target, key, desc);
    }
    else {
        for (var i = decorators.length - 1; i >= 0; i--) {
            if (d = decorators[i]) {
                r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
            }
        }
    }
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") {
        return Reflect.metadata(k, v);
    }
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimePlayerCommandEnqueueService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const {
    normalizeSlotIndex,
    normalizeEquipSlot,
    normalizeTechniqueId,
    normalizePositiveCount,
    normalizeCoordinate,
} = world_runtime_normalization_helpers_1;

/** world-runtime player-command enqueue orchestration：承接玩家命令入队前的归一化、校验与排队。 */
let WorldRuntimePlayerCommandEnqueueService = class WorldRuntimePlayerCommandEnqueueService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
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
        return this.enqueueCombatTargetCommand(playerId, 'basicAttack', {
            targetPlayerIdInput,
            targetMonsterIdInput,
            targetXInput,
            targetYInput,
        }, deps);
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
        return this.enqueueCombatTargetCommand(playerId, 'engageBattle', {
            targetPlayerIdInput,
            targetMonsterIdInput,
            targetXInput,
            targetYInput,
            locked,
        }, deps);
    }    
    /**
 * enqueueUseItem：处理Use道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    enqueueUseItem(playerId, slotIndexInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'useItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        }, deps);
    }    
    /**
 * enqueueDropItem：处理Drop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    enqueueDropItem(playerId, slotIndexInput, countInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'dropItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
            count: normalizePositiveCount(countInput),
        }, deps);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';
        const itemKey = typeof itemKeyInput === 'string' ? itemKeyInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        if (!itemKey) {
            throw new common_1.BadRequestException('itemKey is required');
        }
        deps.enqueuePendingCommand(playerId, {
            kind: 'takeGround',
            sourceId,
            itemKey,
        });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * enqueueTakeGroundAll：处理Take地面All并更新相关状态。
 * @param playerId 玩家 ID。
 * @param sourceIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新TakeGroundAll相关状态。
 */

    enqueueTakeGroundAll(playerId, sourceIdInput, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);

        const sourceId = typeof sourceIdInput === 'string' ? sourceIdInput.trim() : '';
        if (!sourceId) {
            throw new common_1.BadRequestException('sourceId is required');
        }
        deps.enqueuePendingCommand(playerId, {
            kind: 'takeGroundAll',
            sourceId,
        });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * enqueueEquip：处理Equip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotIndexInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip相关状态。
 */

    enqueueEquip(playerId, slotIndexInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'equip',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        }, deps);
    }    
    /**
 * enqueueUnequip：处理Unequip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip相关状态。
 */

    enqueueUnequip(playerId, slotInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
        }, deps);
    }    
    /**
 * enqueueCultivate：处理Cultivate并更新相关状态。
 * @param playerId 玩家 ID。
 * @param techniqueIdInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cultivate相关状态。
 */

    enqueueCultivate(playerId, techniqueIdInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'cultivate',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        }, deps);
    }    
    /**
 * enqueueStartAlchemy：处理开始炼丹并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start炼丹相关状态。
 */

    enqueueStartAlchemy(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'startAlchemy',
            payload: this.cloneAlchemyPayload(payload),
        }, deps);
    }    
    /**
 * enqueueCancelAlchemy：判断Cancel炼丹是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel炼丹相关状态。
 */

    enqueueCancelAlchemy(playerId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, { kind: 'cancelAlchemy' }, deps);
    }    
    /**
 * enqueueSaveAlchemyPreset：处理Save炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Save炼丹Preset相关状态。
 */

    enqueueSaveAlchemyPreset(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'saveAlchemyPreset',
            payload: this.cloneAlchemyPayload(payload),
        }, deps);
    }    
    /**
 * enqueueDeleteAlchemyPreset：处理Delete炼丹Preset并更新相关状态。
 * @param playerId 玩家 ID。
 * @param presetId preset ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Delete炼丹Preset相关状态。
 */

    enqueueDeleteAlchemyPreset(playerId, presetId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'deleteAlchemyPreset',
            presetId: typeof presetId === 'string' ? presetId : '',
        }, deps);
    }    
    /**
 * enqueueStartEnhancement：处理开始强化并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Start强化相关状态。
 */

    enqueueStartEnhancement(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'startEnhancement',
            payload: this.cloneEnhancementPayload(payload),
        }, deps);
    }    
    /**
 * enqueueCancelEnhancement：判断Cancel强化是否满足条件。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Cancel强化相关状态。
 */

    enqueueCancelEnhancement(playerId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, { kind: 'cancelEnhancement' }, deps);
    }    
    /**
 * enqueueRedeemCodes：处理RedeemCode并更新相关状态。
 * @param playerId 玩家 ID。
 * @param codesInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新RedeemCode相关状态。
 */

    enqueueRedeemCodes(playerId, codesInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'redeemCodes',
            codes: Array.isArray(codesInput) ? codesInput.filter((entry) => typeof entry === 'string') : [],
        }, deps);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);

        const action = typeof actionInput === 'string' ? actionInput.trim() : '';
        if (action !== 'sever' && action !== 'restore' && action !== 'open' && action !== 'reroll' && action !== 'enter') {
            throw new common_1.BadRequestException('heaven gate action is required');
        }

        const element = typeof elementInput === 'string' ? elementInput.trim() : '';
        deps.enqueuePendingCommand(playerId, {
            kind: 'heavenGateAction',
            action,
            element: element === 'metal' || element === 'wood' || element === 'water' || element === 'fire' || element === 'earth'
                ? element
                : undefined,
        });
        return deps.getPlayerViewOrThrow(playerId);
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
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);

        const skillId = typeof skillIdInput === 'string' ? skillIdInput.trim() : '';
        const targetPlayerId = typeof targetPlayerIdInput === 'string' ? targetPlayerIdInput.trim() : '';
        const targetMonsterId = typeof targetMonsterIdInput === 'string' ? targetMonsterIdInput.trim() : '';
        const targetRef = typeof targetRefInput === 'string' ? targetRefInput.trim() : '';
        if (!skillId) {
            throw new common_1.BadRequestException('skillId is required');
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const action = player.actions.actions.find((entry) => entry.id === skillId && entry.type === 'skill');
        if (!action) {
            throw new common_1.NotFoundException(`Skill action ${skillId} not found`);
        }
        if (!targetPlayerId && !targetMonsterId && !targetRef && action.requiresTarget !== false) {
            throw new common_1.BadRequestException('target is required');
        }
        deps.enqueuePendingCommand(playerId, {
            kind: 'castSkill',
            skillId,
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetRef: targetRef || null,
        });
        return deps.getPlayerViewOrThrow(playerId);
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
        return this.enqueueCastSkill(playerId, skillIdInput, null, null, targetRefInput, deps);
    }    
    /**
 * enqueueNormalizedPlayerCommand：规范化或转换Normalized玩家Command。
 * @param playerId 玩家 ID。
 * @param command 输入指令。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Normalized玩家Command相关状态。
 */

    enqueueNormalizedPlayerCommand(playerId, command, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        deps.enqueuePendingCommand(playerId, command);
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * enqueueCombatTargetCommand：读取战斗目标Command并返回结果。
 * @param playerId 玩家 ID。
 * @param kind 参数说明。
 * @param target 目标对象。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新战斗目标Command相关状态。
 */

    enqueueCombatTargetCommand(playerId, kind, target, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.getPlayerLocationOrThrow(playerId);
        deps.interruptManualCombat(playerId);

        const targetPlayerId = typeof target.targetPlayerIdInput === 'string' ? target.targetPlayerIdInput.trim() : '';
        const targetMonsterId = typeof target.targetMonsterIdInput === 'string' ? target.targetMonsterIdInput.trim() : '';
        const hasTileTarget = Number.isFinite(target.targetXInput) && Number.isFinite(target.targetYInput);
        if (!targetPlayerId && !targetMonsterId && !hasTileTarget) {
            throw new common_1.BadRequestException('target is required');
        }
        deps.enqueuePendingCommand(playerId, {
            kind,
            targetPlayerId: targetPlayerId || null,
            targetMonsterId: targetMonsterId || null,
            targetX: hasTileTarget ? normalizeCoordinate(target.targetXInput ?? Number.NaN, 'x') : null,
            targetY: hasTileTarget ? normalizeCoordinate(target.targetYInput ?? Number.NaN, 'y') : null,
            locked: target.locked,
        });
        return deps.getPlayerViewOrThrow(playerId);
    }    
    /**
 * cloneAlchemyPayload：读取炼丹载荷并返回结果。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新炼丹载荷相关状态。
 */

    cloneAlchemyPayload(payload) {
        return payload && typeof payload === 'object'
            ? {
                ...payload,
                ingredients: Array.isArray(payload.ingredients)
                    ? payload.ingredients.map((entry) => ({ ...entry }))
                    : [],
            }
            : {};
    }    
    /**
 * cloneEnhancementPayload：读取强化载荷并返回结果。
 * @param payload 载荷参数。
 * @returns 无返回值，直接更新强化载荷相关状态。
 */

    cloneEnhancementPayload(payload) {
        return payload && typeof payload === 'object'
            ? {
                ...payload,
                target: payload.target && typeof payload.target === 'object'
                    ? { ...payload.target }
                    : payload.target,
                protection: payload.protection && typeof payload.protection === 'object'
                    ? { ...payload.protection }
                    : payload.protection,
            }
            : {};
    }
};
exports.WorldRuntimePlayerCommandEnqueueService = WorldRuntimePlayerCommandEnqueueService;
exports.WorldRuntimePlayerCommandEnqueueService = WorldRuntimePlayerCommandEnqueueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimePlayerCommandEnqueueService);

export { WorldRuntimePlayerCommandEnqueueService };
