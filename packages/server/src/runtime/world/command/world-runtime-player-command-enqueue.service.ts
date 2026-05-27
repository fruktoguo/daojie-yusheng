/**
 * 本文件属于服务端权威运行时，负责地图、玩家、世界、市场、邮件或后台运行态逻辑。
 *
 * 维护时要保持状态变更受控，所有影响资产或位置的结果都应能被持久化与恢复链覆盖。
 */
import { Inject, Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { buildTechniqueActivityCancelCommand, buildTechniqueActivityStartCommand } from '../../craft/technique-activity-registry.helpers';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';

const {
    normalizeEquipSlot,
    normalizeTechniqueId,
    normalizePositiveCount,
    normalizeCoordinate,
} = world_runtime_normalization_helpers_1;

/** world-runtime player-command enqueue orchestration：承接玩家命令入队前的归一化、校验与排队。 */
@Injectable()
export class WorldRuntimePlayerCommandEnqueueService {
/**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
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
 * @param payloadInput 背包物品操作载荷。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Use道具相关状态。
 */

    enqueueUseItem(playerId, payloadInput, deps) {
        const payload = typeof payloadInput === 'object' && payloadInput !== null ? payloadInput : {};
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'useItem',
            itemInstanceId: this.resolveInventoryItemInstanceId(playerId, payload, 'useItem'),
            payload: { ...(payload ?? {}) },
        }, deps);
    }
    enqueueCreateFormation(playerId, payload, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'createFormation',
            payload: { ...(payload ?? {}) },
        }, deps);
    }
    enqueueSetFormationActive(playerId, payload, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'setFormationActive',
            payload: { ...(payload ?? {}) },
        }, deps);
    }
    enqueueRefillFormation(playerId, payload, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'refillFormation',
            payload: { ...(payload ?? {}) },
        }, deps);
    }
    /**
 * enqueueDropItem：处理Drop道具并更新相关状态。
 * @param playerId 玩家 ID。
 * @param payloadInput 背包物品操作载荷。
 * @param countInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Drop道具相关状态。
 */

    enqueueDropItem(playerId, payloadInput, countInput, deps) {
        const payload = typeof payloadInput === 'object' && payloadInput !== null ? payloadInput : { count: countInput };
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'dropItem',
            itemInstanceId: this.resolveInventoryItemInstanceId(playerId, payload, 'dropItem'),
            count: normalizePositiveCount(payload?.count ?? countInput),
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
            throw new BadRequestException('来源 ID 不能为空');
        }
        if (!itemKey) {
            throw new BadRequestException('物品键不能为空');
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
            throw new BadRequestException('来源 ID 不能为空');
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
 * @param payloadInput 背包物品操作载荷。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Equip相关状态。
 */

    enqueueEquip(playerId, payloadInput, deps, expectedItemInstanceId?: string) {
        const payload = typeof payloadInput === 'object' && payloadInput !== null ? payloadInput : { itemInstanceId: expectedItemInstanceId };
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'equip',
            itemInstanceId: this.resolveInventoryItemInstanceId(playerId, payload, 'equip'),
        }, deps);
    }
    /**
 * enqueueUnequip：处理Unequip并更新相关状态。
 * @param playerId 玩家 ID。
 * @param slotInput 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Unequip相关状态。
 */

    enqueueUnequip(playerId, slotInput, deps, expectedItemInstanceId?: string) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
            expectedItemInstanceId,
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
    enqueueStartTechniqueTransmission(playerId, learnerPlayerIdInput, techniqueIdInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'startTechniqueTransmission',
            learnerPlayerId: typeof learnerPlayerIdInput === 'string' ? learnerPlayerIdInput.trim() : '',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        }, deps);
    }
    enqueueCancelTechniqueTransmission(playerId, techniqueIdInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'cancelTechniqueTransmission',
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
        return this.enqueueStartTechniqueActivity(playerId, 'alchemy', this.cloneAlchemyPayload(payload), deps);
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
        return this.enqueueStartTechniqueActivity(playerId, 'enhancement', this.cloneEnhancementPayload(payload), deps);
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
 * enqueueStartTechniqueActivity：统一技艺活动开始入队。
 * @param playerId 玩家 ID。
 * @param kind 参数说明。
 * @param payload 载荷参数。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动开始入队相关状态。
 */

    enqueueStartTechniqueActivity(playerId, kind, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(
            playerId,
            buildTechniqueActivityStartCommand(kind, payload),
            deps,
        );
    }
    /**
 * enqueueCancelTechniqueActivity：统一技艺活动取消入队。
 * @param playerId 玩家 ID。
 * @param kind 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新技艺活动取消入队相关状态。
 */

    enqueueCancelTechniqueActivity(playerId, kind, deps, cancelRef = null) {
        return this.enqueueNormalizedPlayerCommand(
            playerId,
            buildTechniqueActivityCancelCommand(kind, cancelRef),
            deps,
        );
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
            throw new BadRequestException('天门动作不能为空');
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
            throw new BadRequestException('技能 ID 不能为空');
        }

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const action = player.actions.actions.find((entry) => entry.id === skillId && entry.type === 'skill');
        if (!action) {
            throw new NotFoundException(`技能动作不存在：${skillId}`);
        }
        if (action.skillEnabled === false) {
            throw new BadRequestException('技能未启用，无法释放');
        }
        if (!targetPlayerId && !targetMonsterId && !targetRef && action.requiresTarget !== false) {
            throw new BadRequestException('必须指定目标');
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
* resolveInventoryItemInstanceId：从玩家输入中的背包目标读取稳定实例 ID。
 * @param playerId 玩家 ID。
 * @param payload 载荷参数。
 * @param eventName 事件名。
 * @returns itemInstanceId。
 */

    resolveInventoryItemInstanceId(playerId, payload, _eventName) {
        const direct = normalizeInventoryItemInstanceId(payload?.itemRef?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.itemInstanceId)
            || normalizeInventoryItemInstanceId(payload?.expectedItemInstanceId);
        if (direct) {
            return direct;
        }
        this.playerRuntimeService.repairInventoryItemInstanceIds(playerId);
        throw new BadRequestException('背包物品身份已修复，请重新选择。');
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
            if (kind === 'engageBattle' && target.locked === true) {
                const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
                const hadLockedCombatState = player?.combat?.autoBattle === true
                    || player?.combat?.combatTargetLocked === true
                    || player?.combat?.combatTargetId !== null;
                if (hadLockedCombatState) {
                    const currentTick = typeof deps.resolveCurrentTickForPlayerId === 'function'
                        ? deps.resolveCurrentTickForPlayerId(playerId)
                        : 0;
                    this.playerRuntimeService.clearCombatTarget(playerId, currentTick);
                }
                return deps.getPlayerViewOrThrow(playerId);
            }
            throw new BadRequestException('必须指定目标');
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

function normalizeInventoryItemInstanceId(value) {
    return typeof value === 'string' ? value.trim() : '';
}
