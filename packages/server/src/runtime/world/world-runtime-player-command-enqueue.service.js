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
    playerRuntimeService;
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    enqueueBasicAttack(playerId, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return this.enqueueCombatTargetCommand(playerId, 'basicAttack', {
            targetPlayerIdInput,
            targetMonsterIdInput,
            targetXInput,
            targetYInput,
        }, deps);
    }
    enqueueBattleTarget(playerId, locked, targetPlayerIdInput, targetMonsterIdInput, targetXInput, targetYInput, deps) {
        return this.enqueueCombatTargetCommand(playerId, 'engageBattle', {
            targetPlayerIdInput,
            targetMonsterIdInput,
            targetXInput,
            targetYInput,
            locked,
        }, deps);
    }
    enqueueUseItem(playerId, slotIndexInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'useItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        }, deps);
    }
    enqueueDropItem(playerId, slotIndexInput, countInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'dropItem',
            slotIndex: normalizeSlotIndex(slotIndexInput),
            count: normalizePositiveCount(countInput),
        }, deps);
    }
    enqueueTakeGround(playerId, sourceIdInput, itemKeyInput, deps) {
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
    enqueueTakeGroundAll(playerId, sourceIdInput, deps) {
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
    enqueueEquip(playerId, slotIndexInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'equip',
            slotIndex: normalizeSlotIndex(slotIndexInput),
        }, deps);
    }
    enqueueUnequip(playerId, slotInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'unequip',
            slot: normalizeEquipSlot(slotInput),
        }, deps);
    }
    enqueueCultivate(playerId, techniqueIdInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'cultivate',
            techniqueId: normalizeTechniqueId(techniqueIdInput),
        }, deps);
    }
    enqueueStartAlchemy(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'startAlchemy',
            payload: this.cloneAlchemyPayload(payload),
        }, deps);
    }
    enqueueCancelAlchemy(playerId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, { kind: 'cancelAlchemy' }, deps);
    }
    enqueueSaveAlchemyPreset(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'saveAlchemyPreset',
            payload: this.cloneAlchemyPayload(payload),
        }, deps);
    }
    enqueueDeleteAlchemyPreset(playerId, presetId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'deleteAlchemyPreset',
            presetId: typeof presetId === 'string' ? presetId : '',
        }, deps);
    }
    enqueueStartEnhancement(playerId, payload, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'startEnhancement',
            payload: this.cloneEnhancementPayload(payload),
        }, deps);
    }
    enqueueCancelEnhancement(playerId, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, { kind: 'cancelEnhancement' }, deps);
    }
    enqueueRedeemCodes(playerId, codesInput, deps) {
        return this.enqueueNormalizedPlayerCommand(playerId, {
            kind: 'redeemCodes',
            codes: Array.isArray(codesInput) ? codesInput.filter((entry) => typeof entry === 'string') : [],
        }, deps);
    }
    enqueueHeavenGateAction(playerId, actionInput, elementInput, deps) {
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
    enqueueCastSkill(playerId, skillIdInput, targetPlayerIdInput, targetMonsterIdInput, targetRefInput, deps) {
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
    enqueueCastSkillTargetRef(playerId, skillIdInput, targetRefInput, deps) {
        return this.enqueueCastSkill(playerId, skillIdInput, null, null, targetRefInput, deps);
    }
    enqueueNormalizedPlayerCommand(playerId, command, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        deps.enqueuePendingCommand(playerId, command);
        return deps.getPlayerViewOrThrow(playerId);
    }
    enqueueCombatTargetCommand(playerId, kind, target, deps) {
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
