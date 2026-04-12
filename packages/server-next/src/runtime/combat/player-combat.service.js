"use strict";
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerCombatService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** player_runtime_service_1：定义该变量以承载业务值。 */
const player_runtime_service_1 = require("../player/player-runtime.service");
/** PlayerCombatService：定义该变量以承载业务值。 */
let PlayerCombatService = class PlayerCombatService {
    playerRuntimeService;
/** 构造函数：执行实例初始化流程。 */
    constructor(playerRuntimeService) {
        this.playerRuntimeService = playerRuntimeService;
    }
/** castSkill：执行对应的业务逻辑。 */
    castSkill(attacker, target, skillId, currentTick, distance) {
        if (attacker.playerId === target.playerId) {
            throw new common_1.BadRequestException('self target is not supported');
        }
/** resolved：定义该变量以承载业务值。 */
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
/** result：定义该变量以承载业务值。 */
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
        if (result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }
/** castSkillToMonster：执行对应的业务逻辑。 */
    castSkillToMonster(attacker, target, skillId, currentTick, distance, applyTargetBuff) {
/** resolved：定义该变量以承载业务值。 */
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
/** result：定义该变量以承载业务值。 */
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
/** castMonsterSkill：执行对应的业务逻辑。 */
    castMonsterSkill(attacker, target, skillId, currentTick, distance, applySelfBuff, applyTargetBuff) {
/** resolved：定义该变量以承载业务值。 */
        const resolved = resolveMonsterSkill(attacker, skillId);
/** result：定义该变量以承载业务值。 */
        const result = this.executeResolvedSkillCast(attacker, toCombatPlayerState(target), resolved, currentTick, distance, {
            setCooldownReadyTick: () => undefined,
            applySelfBuff,
            applyTargetBuff: applyTargetBuff ?? ((buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            }),
        });
        if (result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }
/** executeResolvedSkillCast：执行对应的业务逻辑。 */
    executeResolvedSkillCast(attacker, target, resolved, currentTick, distance, handlers) {
        if (attacker.hp <= 0) {
            throw new common_1.BadRequestException('Caster is dead');
        }
        if (target.hp <= 0) {
            throw new common_1.BadRequestException('Target is already dead');
        }
/** range：定义该变量以承载业务值。 */
        const range = resolveSkillRange(resolved.skill);
        if (distance > range) {
            throw new common_1.BadRequestException(`Skill ${resolved.skill.id} out of range`);
        }
        if (!resolved.skipCooldownCheck && currentTick < resolved.readyTick) {
            throw new common_1.BadRequestException(`Skill ${resolved.skill.id} cooling down`);
        }
/** qiCost：定义该变量以承载业务值。 */
        let qiCost = 0;
        if (!resolved.skipQiCost) {
/** plannedCost：定义该变量以承载业务值。 */
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
/** totalDamage：定义该变量以承载业务值。 */
        let totalDamage = 0;
/** hitCount：定义该变量以承载业务值。 */
        let hitCount = 0;
        for (const effect of resolved.skill.effects) {
            if (effect.type === 'damage') {
                const baseDamage = Math.max(1, Math.round(evaluateSkillFormula(effect.formula, {
                    attacker,
                    target,
                    techLevel: resolved.level,
                    targetCount: 1,
                })));
/** damage：定义该变量以承载业务值。 */
                const damage = resolveDamage(attacker, target, effect, baseDamage);
                if (damage > 0) {
                    totalDamage += damage;
                    hitCount += 1;
                }
                continue;
            }
/** buff：定义该变量以承载业务值。 */
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
/** resolvePlayerSkill：执行对应的业务逻辑。 */
function resolvePlayerSkill(techniques, cooldownReadyTickBySkillId, skillId) {
    for (const technique of techniques) {
        const skill = technique.skills?.find((entry) => entry.id === skillId);
        if (!skill) {
            continue;
        }
/** unlockLevel：定义该变量以承载业务值。 */
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
/** resolveMonsterSkill：执行对应的业务逻辑。 */
function resolveMonsterSkill(attacker, skillId) {
/** skill：定义该变量以承载业务值。 */
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
/** toCombatPlayerState：执行对应的业务逻辑。 */
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
/** resolveSkillRange：执行对应的业务逻辑。 */
function resolveSkillRange(skill) {
/** targetingRange：定义该变量以承载业务值。 */
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}
/** normalizeSkillQiCost：执行对应的业务逻辑。 */
function normalizeSkillQiCost(rawCost) {
    if (!Number.isFinite(rawCost)) {
        return 0;
    }
    return Math.max(0, Math.round(Number(rawCost)));
}
/** resolveDamage：执行对应的业务逻辑。 */
function resolveDamage(attacker, target, effect, baseDamage) {
/** attackerStats：定义该变量以承载业务值。 */
    const attackerStats = attacker.attrs.numericStats;
/** targetStats：定义该变量以承载业务值。 */
    const targetStats = target.attrs.numericStats;
/** attackerRatios：定义该变量以承载业务值。 */
    const attackerRatios = attacker.attrs.ratioDivisors;
/** targetRatios：定义该变量以承载业务值。 */
    const targetRatios = target.attrs.ratioDivisors;
/** damageKind：定义该变量以承载业务值。 */
    const damageKind = effect.damageKind ?? inferDamageKind(attackerStats);
/** hitGap：定义该变量以承载业务值。 */
    const hitGap = Math.max(0, targetStats.dodge - attackerStats.hit);
    if (hitGap > 0 && Math.random() < (0, shared_1.ratioValue)(hitGap, targetRatios.dodge)) {
        return 0;
    }
/** crit：定义该变量以承载业务值。 */
    const crit = attackerStats.crit > 0 && Math.random() < (0, shared_1.ratioValue)(attackerStats.crit, attackerRatios.crit);
/** damage：定义该变量以承载业务值。 */
    let damage = baseDamage;
    if (effect.element) {
        damage = Math.max(1, Math.round(damage * (1 + Math.max(0, attackerStats.elementDamageBonus[effect.element]) / 100)));
    }
/** defense：定义该变量以承载业务值。 */
    const defense = damageKind === 'physical' ? targetStats.physDef : targetStats.spellDef;
/** reduction：定义该变量以承载业务值。 */
    let reduction = Math.max(0, (0, shared_1.ratioValue)(defense, 100));
    if (effect.element) {
/** elementReduce：定义该变量以承载业务值。 */
        const elementReduce = Math.max(0, (0, shared_1.ratioValue)(targetStats.elementDamageReduce[effect.element], targetRatios.elementDamageReduce[effect.element]));
        reduction = 1 - (1 - reduction) * (1 - elementReduce);
    }
    damage = Math.max(1, Math.round(damage * (1 - Math.min(0.95, reduction))));
    if (crit) {
        damage = Math.max(1, Math.round(damage * ((200 + Math.max(0, attackerStats.critDamage) / 10) / 100)));
    }
    return Math.max(1, Math.round(damage * (0, shared_1.getRealmGapDamageMultiplier)(1, 1)));
}
/** inferDamageKind：执行对应的业务逻辑。 */
function inferDamageKind(stats) {
    return stats.spellAtk >= stats.physAtk ? 'spell' : 'physical';
}
/** toTemporaryBuff：执行对应的业务逻辑。 */
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
/** evaluateSkillFormula：执行对应的业务逻辑。 */
function evaluateSkillFormula(formula, context) {
    if (typeof formula === 'number') {
        return formula;
    }
    if ('var' in formula) {
        return resolveSkillFormulaVar(formula.var, context) * (formula.scale ?? 1);
    }
    if (formula.op === 'clamp') {
/** value：定义该变量以承载业务值。 */
        const value = evaluateSkillFormula(formula.value, context);
/** min：定义该变量以承载业务值。 */
        const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateSkillFormula(formula.min, context);
/** max：定义该变量以承载业务值。 */
        const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateSkillFormula(formula.max, context);
        return Math.min(max, Math.max(min, value));
    }
/** values：定义该变量以承载业务值。 */
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
/** resolveSkillFormulaVar：执行对应的业务逻辑。 */
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
/** key：定义该变量以承载业务值。 */
        const key = variable.slice('caster.attr.'.length);
        return context.attacker.attrs.finalAttrs[key] ?? 0;
    }
    if (variable.startsWith('target.attr.')) {
/** key：定义该变量以承载业务值。 */
        const key = variable.slice('target.attr.'.length);
        return context.target.attrs.finalAttrs[key] ?? 0;
    }
    if (variable.startsWith('caster.stat.')) {
/** key：定义该变量以承载业务值。 */
        const key = variable.slice('caster.stat.'.length);
        return context.attacker.attrs.numericStats[key] ?? 0;
    }
    if (variable.startsWith('target.stat.')) {
/** key：定义该变量以承载业务值。 */
        const key = variable.slice('target.stat.'.length);
        return context.target.attrs.numericStats[key] ?? 0;
    }
    if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
/** buffId：定义该变量以承载业务值。 */
        const buffId = variable.slice('caster.buff.'.length, -'.stacks'.length);
        return resolveBuffStacks(context.attacker.buffs, buffId);
    }
    if (variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
/** buffId：定义该变量以承载业务值。 */
        const buffId = variable.slice('target.buff.'.length, -'.stacks'.length);
        return resolveBuffStacks(context.target.buffs, buffId);
    }
    return 0;
}
/** resolveBuffStacks：执行对应的业务逻辑。 */
function resolveBuffStacks(buffs, buffId) {
    if (!buffs || !buffId) {
        return 0;
    }
/** target：定义该变量以承载业务值。 */
    const target = buffs.find((entry) => entry.buffId === buffId);
    return target ? Math.max(0, target.stacks) : 0;
}
//# sourceMappingURL=player-combat.service.js.map