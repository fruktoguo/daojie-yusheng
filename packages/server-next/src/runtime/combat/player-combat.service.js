"use strict";
/**
 * 玩家战斗服务
 * 
 * 负责处理玩家相关的战斗逻辑，包括：
 * - 玩家对玩家释放技能
 * - 玩家对怪物释放技能
 * - 怪物对玩家释放技能
 * - 技能效果计算和应用
 * - 战斗伤害计算
 * - 技能冷却管理
 * - Buff效果应用
 */
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
exports.PlayerCombatService = void 0;
const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const player_runtime_service_1 = require("../player/player-runtime.service");
/**
 * 玩家战斗服务类
 * 
 * 负责处理玩家相关的战斗逻辑
 */
let PlayerCombatService = class PlayerCombatService {
    /** 玩家运行时服务 */
    playerRuntimeService;
    
    /**
     * 构造函数
     * @param playerRuntimeService 玩家运行时服务
     */
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
    /**
     * 玩家对玩家释放技能
     * 
     * @param attacker 攻击者玩家
     * @param target 目标玩家
     * @param skillId 技能ID
     * @param currentTick 当前tick
     * @param distance 距离
     * @returns 技能释放结果
     * @throws 如果目标是自身则抛出BadRequestException
     */
    castSkill(attacker, target, skillId, currentTick, distance) {
        // 检查是否攻击自己
        if (attacker.playerId === target.playerId) {
            throw new common_1.BadRequestException('self target is not supported');
        }
        
        // 解析玩家技能
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        
        // 执行技能释放
        const result = this.executeResolvedSkillCast(toCombatPlayerState(attacker), toCombatPlayerState(target), resolved, currentTick, distance, {
            spendQi: (amount) => {
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
            },
            setCooldownReadyTick: (readyTick) => {
                this.playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skillId, readyTick, currentTick);
            },
            applySelfBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
            applyTargetBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            },
        });
        
        // 应用伤害
        if (result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }
    /**
     * 玩家对怪物释放技能
     * 
     * @param attacker 攻击者玩家
     * @param target 目标怪物
     * @param skillId 技能ID
     * @param currentTick 当前tick
     * @param distance 距离
     * @param applyTargetBuff 应用目标Buff的回调函数
     * @returns 技能释放结果
     */
    castSkillToMonster(attacker, target, skillId, currentTick, distance, applyTargetBuff) {
        // 解析玩家技能
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        
        // 执行技能释放
        const result = this.executeResolvedSkillCast(toCombatPlayerState(attacker), target, resolved, currentTick, distance, {
            spendQi: (amount) => {
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
            },
            setCooldownReadyTick: (readyTick) => {
                this.playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skillId, readyTick, currentTick);
            },
            applySelfBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
            applyTargetBuff,
        });
        
        return {
            ...result,
            targetMonsterId: target.runtimeId,
        };
    }
    
    /**
     * 怪物对玩家释放技能
     * 
     * @param attacker 攻击者怪物
     * @param target 目标玩家
     * @param skillId 技能ID
     * @param currentTick 当前tick
     * @param distance 距离
     * @param applySelfBuff 应用自身Buff的回调函数
     * @param applyTargetBuff 应用目标Buff的回调函数
     * @returns 技能释放结果
     */
    castMonsterSkill(attacker, target, skillId, currentTick, distance, applySelfBuff, applyTargetBuff) {
        // 解析怪物技能
        const resolved = resolveMonsterSkill(attacker, skillId);
        
        // 执行技能释放
        const result = this.executeResolvedSkillCast(attacker, toCombatPlayerState(target), resolved, currentTick, distance, {
            setCooldownReadyTick: () => undefined,
            applySelfBuff,
            applyTargetBuff: applyTargetBuff ?? ((buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            }),
        });
        
        // 应用伤害
        if (result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }
    executeResolvedSkillCast(attacker, target, resolved, currentTick, distance, handlers) {
        if (attacker.hp <= 0) {
            throw new common_1.BadRequestException('Caster is dead');
        }
        if (target.hp <= 0) {
            throw new common_1.BadRequestException('Target is already dead');
        }
        const range = resolveSkillRange(resolved.skill);
        if (distance > range) {
            throw new common_1.BadRequestException(`Skill ${resolved.skill.id} out of range`);
        }
        if (!resolved.skipCooldownCheck && currentTick < resolved.readyTick) {
            throw new common_1.BadRequestException(`Skill ${resolved.skill.id} cooling down`);
        }
        let qiCost = 0;
        if (!resolved.skipQiCost) {
            const plannedCost = normalizeSkillQiCost(resolved.skill.cost);
            qiCost = Math.round((0, shared_1.calcQiCostWithOutputLimit)(plannedCost, Math.max(0, attacker.attrs.numericStats.maxQiOutputPerTick)));
            if (!Number.isFinite(qiCost) || attacker.qi < qiCost) {
                throw new common_1.BadRequestException(`Skill ${resolved.skill.id} qi insufficient`);
            }
            if (qiCost > 0) {
                handlers.spendQi?.(qiCost);
            }
        }
        handlers.setCooldownReadyTick(currentTick + Math.max(1, Math.round(resolved.skill.cooldown)));
        let totalDamage = 0;
        let hitCount = 0;
        for (const effect of resolved.skill.effects) {
            if (effect.type === 'damage') {
                const baseDamage = Math.max(1, Math.round(evaluateSkillFormula(effect.formula, {
                    attacker,
                    target,
                    techLevel: resolved.level,
                    targetCount: 1,
                })));
                const damage = resolveDamage(attacker, target, effect, baseDamage);
                if (damage > 0) {
                    totalDamage += damage;
                    hitCount += 1;
                }
                continue;
            }
            const buff = toTemporaryBuff(effect, resolved.skill);
            if (effect.target === 'self') {
                handlers.applySelfBuff?.(buff);
            }
            else {
                handlers.applyTargetBuff?.(buff);
            }
        }
        return {
            skillId: resolved.skill.id,
            qiCost,
            totalDamage,
            hitCount,
        };
    }
};
exports.PlayerCombatService = PlayerCombatService;
exports.PlayerCombatService = PlayerCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService])
], PlayerCombatService);
function resolvePlayerSkill(techniques, cooldownReadyTickBySkillId, skillId) {
    for (const technique of techniques) {
        const skill = technique.skills?.find((entry) => entry.id === skillId);
        if (!skill) {
            continue;
        }
        const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
        if ((technique.level ?? 1) < unlockLevel) {
            throw new common_1.BadRequestException(`Skill ${skillId} not unlocked`);
        }
        return {
            skill,
            level: Math.max(1, technique.level ?? 1),
            readyTick: cooldownReadyTickBySkillId[skillId] ?? 0,
        };
    }
    throw new common_1.NotFoundException(`Skill ${skillId} not found`);
}
function resolveMonsterSkill(attacker, skillId) {
    const skill = attacker.skills.find((entry) => entry.id === skillId);
    if (!skill) {
        throw new common_1.NotFoundException(`Monster skill ${skillId} not found`);
    }
    return {
        skill,
        level: Math.max(1, attacker.level),
        readyTick: attacker.cooldownReadyTickBySkillId[skillId] ?? 0,
        skipQiCost: true,
        skipCooldownCheck: true,
    };
}
function toCombatPlayerState(player) {
    return {
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        maxQi: player.maxQi,
        attrs: {
            finalAttrs: player.attrs.finalAttrs,
            numericStats: player.attrs.numericStats,
            ratioDivisors: player.attrs.ratioDivisors,
        },
        buffs: player.buffs.buffs,
    };
}
function resolveSkillRange(skill) {
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
function normalizeSkillQiCost(rawCost) {
    if (!Number.isFinite(rawCost)) {
        return 0;
    }
    return Math.max(0, Math.round(Number(rawCost)));
}
function resolveDamage(attacker, target, effect, baseDamage) {
    const attackerStats = attacker.attrs.numericStats;
    const targetStats = target.attrs.numericStats;
    const attackerRatios = attacker.attrs.ratioDivisors;
    const targetRatios = target.attrs.ratioDivisors;
    const damageKind = effect.damageKind ?? inferDamageKind(attackerStats);
    const hitGap = Math.max(0, targetStats.dodge - attackerStats.hit);
    if (hitGap > 0 && Math.random() < (0, shared_1.ratioValue)(hitGap, targetRatios.dodge)) {
        return 0;
    }
    const crit = attackerStats.crit > 0 && Math.random() < (0, shared_1.ratioValue)(attackerStats.crit, attackerRatios.crit);
    let damage = baseDamage;
    if (effect.element) {
        damage = Math.max(1, Math.round(damage * (1 + Math.max(0, attackerStats.elementDamageBonus[effect.element]) / 100)));
    }
    const defense = damageKind === 'physical' ? targetStats.physDef : targetStats.spellDef;
    let reduction = Math.max(0, (0, shared_1.ratioValue)(defense, 100));
    if (effect.element) {
        const elementReduce = Math.max(0, (0, shared_1.ratioValue)(targetStats.elementDamageReduce[effect.element], targetRatios.elementDamageReduce[effect.element]));
        reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * (1 - Math.min(0.95, reduction))));
    if (crit) {
        damage = Math.max(1, Math.round(damage * ((200 + Math.max(0, attackerStats.critDamage) / 10) / 100)));
    }
    return Math.max(1, Math.round(damage * (0, shared_1.getRealmGapDamageMultiplier)(1, 1)));
}
function inferDamageKind(stats) {
    return stats.spellAtk >= stats.physAtk ? 'spell' : 'physical';
}
function toTemporaryBuff(effect, skill) {
    return {
        buffId: effect.buffId,
        name: effect.name,
        desc: effect.desc,
        shortMark: effect.shortMark ?? (effect.name.slice(0, 1) || '*'),
        category: effect.category ?? 'debuff',
        visibility: effect.visibility ?? 'public',
        remainingTicks: Math.max(1, Math.round(effect.duration)),
        duration: Math.max(1, Math.round(effect.duration)),
        stacks: 1,
        maxStacks: Math.max(1, Math.round(effect.maxStacks ?? 1)),
        sourceSkillId: skill.id,
        sourceSkillName: skill.name,
        color: effect.color,
        attrs: effect.attrs ? { ...effect.attrs } : undefined,
        stats: effect.stats
            ? { ...effect.stats }
            : (effect.valueStats ? (0, shared_1.compileValueStatsToActualStats)(effect.valueStats) : undefined),
        qiProjection: effect.qiProjection ? effect.qiProjection.map((entry) => ({ ...entry })) : undefined,
    };
}
function evaluateSkillFormula(formula, context) {
    if (typeof formula === 'number') {
        return formula;
    }
    if ('var' in formula) {
        return resolveSkillFormulaVar(formula.var, context) * (formula.scale ?? 1);
    }
    if (formula.op === 'clamp') {
        const value = evaluateSkillFormula(formula.value, context);
        const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateSkillFormula(formula.min, context);
        const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateSkillFormula(formula.max, context);
        return Math.min(max, Math.max(min, value));
    }
    const values = formula.args.map((entry) => evaluateSkillFormula(entry, context));
    switch (formula.op) {
        case 'add':
            return values.reduce((sum, value) => sum + value, 0);
        case 'sub':
            return values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0);
        case 'mul':
            return values.reduce((product, value) => product * value, 1);
        case 'div':
            return values.slice(1).reduce((sum, value) => (value === 0 ? sum : sum / value), values[0] ?? 0);
        case 'min':
            return values.length > 0 ? Math.min(...values) : 0;
        case 'max':
            return values.length > 0 ? Math.max(...values) : 0;
        default:
            return 0;
    }
}
function resolveSkillFormulaVar(variable, context) {
    if (variable === 'techLevel') {
        return context.techLevel;
    }
    if (variable === 'targetCount') {
        return context.targetCount;
    }
    if (variable === 'caster.hp') {
        return context.attacker.hp;
    }
    if (variable === 'caster.maxHp') {
        return context.attacker.maxHp;
    }
    if (variable === 'caster.qi') {
        return context.attacker.qi;
    }
    if (variable === 'caster.maxQi') {
        return context.attacker.maxQi;
    }
    if (variable === 'target.hp') {
        return context.target.hp;
    }
    if (variable === 'target.maxHp') {
        return context.target.maxHp;
    }
    if (variable === 'target.qi') {
        return context.target.qi;
    }
    if (variable === 'target.maxQi') {
        return context.target.maxQi;
    }
    if (variable.startsWith('caster.attr.')) {
        const key = variable.slice('caster.attr.'.length);
        return context.attacker.attrs.finalAttrs[key] ?? 0;
    }
    if (variable.startsWith('target.attr.')) {
        const key = variable.slice('target.attr.'.length);
        return context.target.attrs.finalAttrs[key] ?? 0;
    }
    if (variable.startsWith('caster.stat.')) {
        const key = variable.slice('caster.stat.'.length);
        return context.attacker.attrs.numericStats[key] ?? 0;
    }
    if (variable.startsWith('target.stat.')) {
        const key = variable.slice('target.stat.'.length);
        return context.target.attrs.numericStats[key] ?? 0;
    }
    if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('caster.buff.'.length, -'.stacks'.length);
        return resolveBuffStacks(context.attacker.buffs, buffId);
    }
    if (variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('target.buff.'.length, -'.stacks'.length);
        return resolveBuffStacks(context.target.buffs, buffId);
    }
    return 0;
}
function resolveBuffStacks(buffs, buffId) {
    if (!buffs || !buffId) {
        return 0;
    }
    const target = buffs.find((entry) => entry.buffId === buffId);
    return target ? Math.max(0, target.stacks) : 0;
}
//# sourceMappingURL=player-combat.service.js.map