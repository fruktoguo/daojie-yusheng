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
exports.WorldRuntimeMonsterActionApplyService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const player_combat_service_1 = require("../combat/player-combat.service");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_combat_effects_service_1 = require("./world-runtime-combat-effects.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");
const { getSkillEffectColor } = world_runtime_normalization_helpers_1;
const world_runtime_path_planning_helpers_1 = require("./world-runtime.path-planning.helpers");
const { chebyshevDistance } = world_runtime_path_planning_helpers_1;

/** 妖兽动作落地服务：承接 monster action apply 与 monster skill apply。 */
let WorldRuntimeMonsterActionApplyService = class WorldRuntimeMonsterActionApplyService {
    playerRuntimeService;
    playerCombatService;
    worldRuntimeCombatEffectsService;
    logger = new common_1.Logger(WorldRuntimeMonsterActionApplyService.name);
    constructor(playerRuntimeService, playerCombatService, worldRuntimeCombatEffectsService) {
        this.playerRuntimeService = playerRuntimeService;
        this.playerCombatService = playerCombatService;
        this.worldRuntimeCombatEffectsService = worldRuntimeCombatEffectsService;
    }
    applyMonsterAction(action, deps) {
        if (action.kind === 'skill') {
            this.applyMonsterSkill(action, deps);
            return;
        }
        this.applyMonsterBasicAttack(action, deps);
    }
    applyMonsterBasicAttack(action, deps) {
        const location = deps.getPlayerLocation(action.targetPlayerId);
        if (!location) {
            return;
        }
        const instance = deps.getInstanceRuntime(action.instanceId);
        if (!instance) {
            return;
        }
        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }
        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(action.targetPlayerId);
        if (!player || player.instanceId !== location.instanceId || player.hp <= 0) {
            return;
        }
        const distance = chebyshevDistance(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y);
        if (distance > monster.attackRange) {
            return;
        }
        const damage = typeof action.damage === 'number' ? Math.max(0, Math.round(action.damage)) : 0;
        if (damage <= 0) {
            return;
        }
        const effectColor = (0, shared_1.getDamageTrailColor)('physical');
        this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, '攻击');
        const updated = this.playerRuntimeService.applyDamage(action.targetPlayerId, damage);
        this.worldRuntimeCombatEffectsService.pushAttackEffect(action.instanceId, monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, effectColor);
        this.worldRuntimeCombatEffectsService.pushDamageFloatEffect(action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, damage, effectColor);
        this.playerRuntimeService.recordActivity(action.targetPlayerId, deps.resolveCurrentTickForPlayerId(action.targetPlayerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            deps.handlePlayerDefeat(updated.playerId);
        }
    }
    applyMonsterSkill(action, deps) {
        if (!action.skillId) {
            return;
        }
        const instance = deps.getInstanceRuntime(action.instanceId);
        if (!instance) {
            return;
        }
        const monster = instance.getMonster(action.runtimeId);
        if (!monster || !monster.alive) {
            return;
        }
        const runtimeTargetPosition = instance.getPlayerPosition(action.targetPlayerId);
        if (!runtimeTargetPosition) {
            return;
        }
        const player = this.playerRuntimeService.getPlayer(action.targetPlayerId);
        if (!player || player.instanceId !== action.instanceId || player.hp <= 0) {
            return;
        }
        const distance = chebyshevDistance(monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y);
        try {
            const currentTick = instance.tick;
            const result = this.playerCombatService.castMonsterSkill({
                runtimeId: monster.runtimeId,
                monsterId: monster.monsterId,
                hp: monster.hp,
                maxHp: monster.maxHp,
                qi: 0,
                maxQi: 0,
                level: monster.level,
                skills: monster.skills,
                cooldownReadyTickBySkillId: monster.cooldownReadyTickBySkillId,
                attrs: {
                    finalAttrs: monster.attrs,
                    numericStats: monster.numericStats,
                    ratioDivisors: monster.ratioDivisors,
                },
                buffs: monster.buffs,
            }, player, action.skillId, currentTick, distance, (buff) => {
                instance.applyTemporaryBuffToMonster(monster.runtimeId, buff);
            }, (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(player.playerId, buff);
            });
            const skill = monster.skills.find((entry) => entry.id === action.skillId);
            const effectColor = skill ? getSkillEffectColor(skill) : (0, shared_1.getDamageTrailColor)('spell');
            if (skill) {
                this.worldRuntimeCombatEffectsService.pushActionLabelEffect(action.instanceId, monster.x, monster.y, skill.name);
            }
            this.worldRuntimeCombatEffectsService.pushAttackEffect(action.instanceId, monster.x, monster.y, runtimeTargetPosition.x, runtimeTargetPosition.y, effectColor);
            if (result.totalDamage > 0) {
                this.worldRuntimeCombatEffectsService.pushDamageFloatEffect(action.instanceId, runtimeTargetPosition.x, runtimeTargetPosition.y, result.totalDamage, effectColor);
            }
            this.playerRuntimeService.recordActivity(player.playerId, currentTick, {
                interruptCultivation: true,
            });
            const updatedPlayer = this.playerRuntimeService.getPlayer(player.playerId);
            if (updatedPlayer && updatedPlayer.hp <= 0) {
                deps.handlePlayerDefeat(updatedPlayer.playerId);
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            (deps.logger ?? this.logger).warn(`处理妖兽技能 ${action.skillId}（来源 ${action.runtimeId}）失败：${message}`);
        }
    }
};
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService;
exports.WorldRuntimeMonsterActionApplyService = WorldRuntimeMonsterActionApplyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        player_combat_service_1.PlayerCombatService,
        world_runtime_combat_effects_service_1.WorldRuntimeCombatEffectsService])
], WorldRuntimeMonsterActionApplyService);
