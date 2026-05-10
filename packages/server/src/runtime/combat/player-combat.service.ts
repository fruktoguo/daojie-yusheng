/**
 * 玩家战斗运行时服务：负责技能施放校验、伤害结算和 buff 应用。
 *
 * 职责：
 * - 玩家对玩家/怪物/自身的技能施放入口
 * - 怪物对玩家的技能施放入口
 * - 技能合法性校验（解锁、冷却、元气、射程、存活）
 * - 伤害公式求值和战斗结算调用
 * - buff 生成和应用
 * - 冷却计算（含冷却速度属性加成）
 *
 * 设计：
 * - 所有施放入口最终汇聚到 executeResolvedSkillCast 统一处理
 * - 通过 handlers 回调解耦资源扣除、冷却设置、buff 应用等副作用
 * - 支持 skipResourceAndCooldown / skipTargetDamageApplication 等选项用于特殊场景
 */

import { Inject, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { calcQiCostWithOutputLimit, compileValueStatsToActualStats, percentModifierToMultiplier, signedRatioValue } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { resolveCombatHitForAction } from './combat-resolution.helpers';
import { resolveMonsterCombatExpEquivalentFallback } from './monster-combat-exp-equivalent.helper';
import { createCombatResolveContext, type CombatResolveContext } from './combat-pipeline';
import { runTilePipeline } from './combat-pipeline-compose';

/** 战斗运行时技能结算服务。 */
@Injectable()
export class PlayerCombatService {
    playerRuntimeService;

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }

    /**
     * 玩家对目标玩家施放技能。
     * 流程：校验自攻击 → 解析技能 → 执行结算 → 设置反击目标 → 应用伤害。
     */
    castSkill(attacker, target, skillId, currentTick, distance, options = undefined) {
        if (attacker.playerId === target.playerId) {
            throw new BadRequestException('不能以自己为攻击目标');
        }

        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        normalizeResolvedPlayerSkillCooldown(attacker, resolved, currentTick);

        const result = this.executeResolvedSkillCast(toCombatPlayerState(attacker), toCombatPlayerState(target), resolved, currentTick, distance, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
            },
            setCooldownReadyTick: (readyTick) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skillId, readyTick, currentTick);
            },
            applySelfBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
            applyTargetBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            },
        }, options);
        if (options?.skipTargetRetaliation !== true) {
            this.playerRuntimeService.setRetaliatePlayerTarget(target.playerId, attacker.playerId, currentTick);
        }
        if (options?.skipTargetDamageApplication !== true && result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }

    /**
     * 玩家对自身施放 buff 技能（无目标校验）。
     */
    castSelfSkill(attacker, skillId, currentTick, options = undefined) {
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        normalizeResolvedPlayerSkillCooldown(attacker, resolved, currentTick);
        const selfState = toCombatPlayerState(attacker);
        const result = this.executeResolvedSkillCast(selfState, selfState, resolved, currentTick, 0, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
            },
            setCooldownReadyTick: (readyTick) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skillId, readyTick, currentTick);
            },
            applySelfBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
            applyTargetBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
        }, options);
        return {
            ...result,
            targetPlayerId: attacker.playerId,
        };
    }

    /**
     * 玩家对妖兽施放技能。
     * 与 castSkill 类似，但目标 buff 通过外部回调应用（怪物 buff 系统不同）。
     */
    castSkillToMonster(attacker, target, skillId, currentTick, distance, applyTargetBuff, options = undefined) {
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        normalizeResolvedPlayerSkillCooldown(attacker, resolved, currentTick);

        const result = this.executeResolvedSkillCast(toCombatPlayerState(attacker), target, resolved, currentTick, distance, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
            },
            setCooldownReadyTick: (readyTick) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.setSkillCooldownReadyTick(attacker.playerId, skillId, readyTick, currentTick);
            },
            applySelfBuff: (buff) => {
                this.playerRuntimeService.applyTemporaryBuff(attacker.playerId, buff);
            },
            applyTargetBuff,
        }, options);
        return {
            ...result,
            targetMonsterId: target.runtimeId,
        };
    }

    /**
     * 妖兽对玩家施放技能。
     * 怪物侧跳过元气和冷却检查（由 AI 层保证），伤害直接应用到玩家。
     */
    castMonsterSkill(attacker, target, skillId, currentTick, distance, applySelfBuff, applyTargetBuff, spendQi, options = undefined) {
        const resolved = resolveMonsterSkill(attacker, skillId);

        const result = this.executeResolvedSkillCast(attacker, toCombatPlayerState(target), resolved, currentTick, distance, {
            setCooldownReadyTick: () => undefined,
            spendQi,
            applySelfBuff,
            applyTargetBuff: applyTargetBuff ?? ((buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            }),
        }, options);
        if (options?.skipTargetDamageApplication !== true && result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return {
            ...result,
            targetPlayerId: target.playerId,
        };
    }

    /**
     * 统一技能施放执行：校验存活/射程/冷却/元气 → 扣资源 → 设冷却 → 逐效果结算。
     * 支持多段伤害（多个 damage effect）和 buff effect。
     */
    executeResolvedSkillCast(attacker, target, resolved, currentTick, distance, handlers, options = undefined) {
        if (attacker.hp <= 0) {
            throw new BadRequestException('施法者已死亡');
        }
        if (target.hp <= 0) {
            throw new BadRequestException('目标已经死亡');
        }

        // 射程校验
        const range = resolveEffectiveSkillCastRange(resolved.skill, options);
        if (distance > range) {
            throw new BadRequestException(`技能 ${resolved.skill.id} 超出范围`);
        }
        // 冷却校验
        if (options?.skipResourceAndCooldown !== true && !resolved.skipCooldownCheck && currentTick < resolved.readyTick) {
            throw new BadRequestException(`技能 ${resolved.skill.id} 尚在冷却`);
        }

        // 元气消耗（受 maxQiOutputPerTick 限制）
        let qiCost = 0;
        if (options?.skipResourceAndCooldown !== true && !resolved.skipQiCost) {
            const plannedCost = normalizeSkillQiCost(resolved.skill.cost);
            qiCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, attacker.attrs.numericStats.maxQiOutputPerTick)));
            if (!Number.isFinite(qiCost) || attacker.qi < qiCost) {
                throw new BadRequestException(`技能 ${resolved.skill.id} 元气不足`);
            }
            if (qiCost > 0) {
                handlers.spendQi?.(qiCost);
            }
        }
        // 设置冷却（含冷却速度加成）
        handlers.setCooldownReadyTick(currentTick + resolveSkillCooldownTicks(attacker, resolved.skill.cooldown));

        // 逐效果结算
        let totalDamage = 0;
        let totalRawDamage = 0;
        let primaryDamageKind = null;
        let primaryDamageElement = undefined;
        const damageRolls = [];

        let hitCount = 0;
        for (const effect of resolved.skill.effects) {
            if (effect.type === 'damage') {
                // 伤害效果：求值公式 → 结算命中/暴击/防御
                const baseDamage = Math.max(1, Math.round(evaluateSkillFormula(effect.formula, {
                    attacker,
                    target,
                    techLevel: resolved.level,
                    targetCount: Math.max(1, Math.round(options?.targetCount ?? 1)),
                })));

                const damageRoll = options?.isTileTarget ? resolveTileDamage(attacker, target, effect, baseDamage) : resolveDamage(attacker, target, effect, baseDamage);
                damageRolls.push(damageRoll);
                totalRawDamage += Math.max(0, Math.round(damageRoll.rawDamage ?? 0));
                if (!primaryDamageKind) {
                    primaryDamageKind = damageRoll.damageKind;
                    primaryDamageElement = damageRoll.element;
                }
                if (damageRoll.damage > 0) {
                    totalDamage += damageRoll.damage;
                    hitCount += 1;
                }
                continue;
            }

            // buff 效果：生成临时 buff 并应用到自身或目标
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
            totalRawDamage,
            hitCount,
            damageKind: primaryDamageKind ?? undefined,
            damageElement: primaryDamageElement,
            damageRolls,
            crit: damageRolls.some((entry) => entry.crit),
            dodged: damageRolls.length > 0 && damageRolls.every((entry) => entry.dodged),
            resolved: damageRolls.some((entry) => entry.resolved),
            broken: damageRolls.some((entry) => entry.broken),
        };
    }
};

// ─── 内部工具函数 ───

/**
 * 从功法列表中解析指定技能，校验解锁等级。
 * 返回 skill 对象、功法等级和冷却就绪 tick。
 */
function resolvePlayerSkill(techniques, cooldownReadyTickBySkillId, skillId) {
    for (const technique of techniques) {
        const skill = technique.skills?.find((entry) => entry.id === skillId);
        if (!skill) {
            continue;
        }

        const unlockLevel = typeof skill.unlockLevel === 'number' ? skill.unlockLevel : 1;
        if ((technique.level ?? 1) < unlockLevel) {
            throw new BadRequestException(`技能 ${skillId} 尚未解锁`);
        }
        return {
            skill,
            level: Math.max(1, technique.level ?? 1),
            readyTick: cooldownReadyTickBySkillId[skillId] ?? 0,
        };
    }
    throw new NotFoundException(`技能不存在：${skillId}`);
}

/**
 * 规范化已解析技能的冷却状态。
 * 如果剩余冷却超过技能最大冷却（可能是旧数据），则清除冷却。
 */
function normalizeResolvedPlayerSkillCooldown(attacker, resolved, currentTick) {
    const cooldowns = attacker?.combat?.cooldownReadyTickBySkillId;
    if (!cooldowns || !resolved?.skill?.id) {
        resolved.readyTick = 0;
        return;
    }
    const readyTick = Math.max(0, Math.trunc(Number(cooldowns[resolved.skill.id] ?? 0)));
    if (readyTick <= 0) {
        resolved.readyTick = 0;
        return;
    }
    const normalizedCurrentTick = Math.max(0, Math.trunc(Number(currentTick) || 0));
    const remainingTicks = readyTick - normalizedCurrentTick;
    const maxCooldownTicks = resolveSkillCooldownTicks(toCombatPlayerState(attacker), resolved.skill.cooldown);
    if (remainingTicks <= 0 || remainingTicks > maxCooldownTicks) {
        delete cooldowns[resolved.skill.id];
        resolved.readyTick = 0;
        return;
    }
    resolved.readyTick = readyTick;
}

/**
 * 从怪物技能列表中解析指定技能。
 * 怪物侧跳过元气和冷却检查。
 */
function resolveMonsterSkill(attacker, skillId) {
    const skill = attacker.skills.find((entry) => entry.id === skillId);
    if (!skill) {
        throw new NotFoundException(`妖兽技能不存在：${skillId}`);
    }
    return {
        skill,
        level: Math.max(1, attacker.level),
        readyTick: attacker.cooldownReadyTickBySkillId[skillId] ?? 0,
        skipQiCost: true,
        skipCooldownCheck: true,
    };
}

/** 将玩家运行时对象转换为战斗结算所需的精简状态。 */
function toCombatPlayerState(player) {
    return {
        playerId: player.playerId,
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        maxQi: player.maxQi,
        realm: player.realm,
        realmLv: player.realm?.realmLv,
        combatExp: player.combatExp,
        attrs: {
            finalAttrs: player.attrs.finalAttrs,
            numericStats: player.attrs.numericStats,
            ratioDivisors: player.attrs.ratioDivisors,
        },
        buffs: player.buffs.buffs,
    };
}

/** 获取技能射程（优先 targeting.range，兜底 skill.range）。 */
function resolveSkillRange(skill) {
    const targetingRange = skill.targeting?.range;
    if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
        return Math.max(1, Math.round(targetingRange));
    }
    return Math.max(1, Math.round(skill.range));
}

/** 获取有效施放射程（options 可覆盖）。 */
function resolveEffectiveSkillCastRange(skill, options) {
    const optionRange = Number(options?.range);
    if (Number.isFinite(optionRange)) {
        return Math.max(1, Math.round(optionRange));
    }
    return resolveSkillRange(skill);
}

/** 规范化技能元气消耗为非负整数。 */
function normalizeSkillQiCost(rawCost) {
    if (!Number.isFinite(rawCost)) {
        return 0;
    }
    return Math.max(0, Math.round(Number(rawCost)));
}

/** 调用 resolveCombatHitForAction 执行单次伤害结算。 */
function resolveDamage(attacker, target, effect, baseDamage) {
    const attackerStats = attacker.attrs.numericStats;
    const targetStats = target.attrs.numericStats;
    const attackerRatios = attacker.attrs.ratioDivisors;
    const targetRatios = target.attrs.ratioDivisors;
    const damageKind = effect.damageKind ?? inferDamageKind(attackerStats);

    const resolved = resolveCombatHitForAction({
        actor: attacker,
        target,
        attackerStats,
        attackerRatios,
        attackerRealmLv: resolveCombatantRealmLv(attacker),
        attackerCombatExp: resolveCombatantCombatExp(attacker),
        targetStats,
        targetRatios,
        targetRealmLv: resolveCombatantRealmLv(target),
        targetCombatExp: resolveCombatantCombatExp(target),
        baseDamage,
        damageKind,
        element: effect.element,
        damageMultiplier: 1,
    });
    return {
        ...resolved,
        damageKind,
        element: effect.element,
    };
}

/** 地块伤害结算：只走五行加成和额外乘区，不吃境界压制/暴击/命中/破招/防御。 */
function resolveTileDamage(attacker, _target, effect, baseDamage) {
    const attackerStats = attacker.attrs.numericStats;
    const damageKind = effect.damageKind ?? inferDamageKind(attackerStats);
    const ctx = createCombatResolveContext({
        attackerStats,
        attackerRatios: attacker.attrs.ratioDivisors,
        targetStats: {},
        targetRatios: {},
        baseDamage,
        damageKind,
        element: effect.element,
        extraMultiplier: 1,
    });
    runTilePipeline(ctx);
    return {
        hit: true,
        rawDamage: ctx.rawDamage,
        damage: ctx.damage,
        crit: false,
        dodged: false,
        resolved: false,
        broken: false,
        damageKind,
        element: effect.element,
    };
}

/** 推断伤害类型：法攻 >= 物攻时为 spell，否则 physical。 */
function inferDamageKind(stats) {
    return stats.spellAtk >= stats.physAtk ? 'spell' : 'physical';
}

/** 获取战斗者境界等级（兼容多种数据结构）。 */
function resolveCombatantRealmLv(combatant) {
    return Math.max(1, Math.floor(Number(combatant?.realm?.realmLv ?? combatant?.realmLv ?? combatant?.level ?? 1) || 1));
}

/** 获取战斗者战斗经验（怪物使用等价值计算）。 */
function resolveCombatantCombatExp(combatant) {
    if (Number.isFinite(combatant?.combatExp)) {
        return Math.max(0, Math.floor(Number(combatant.combatExp)));
    }
    return resolveMonsterCombatExpEquivalentFallback(combatant);
}

/**
 * 从技能效果生成临时 buff 对象。
 * 包含名称、描述、持续时间、层数、属性加成、元气投影等。
 */
function toTemporaryBuff(effect, skill) {
    const fallbackName = typeof effect.name === 'string' && effect.name.trim()
        ? effect.name.trim()
        : (typeof skill.name === 'string' && skill.name.trim() ? skill.name.trim() : String(effect.buffId ?? skill.id ?? '效果'));
    return {
        buffId: effect.buffId,
        name: fallbackName,
        desc: effect.desc,
        shortMark: effect.shortMark ?? (fallbackName.slice(0, 1) || '*'),
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
        attrMode: effect.attrMode,
        stats: effect.stats
            ? { ...effect.stats }
            : (effect.valueStats
                ? (effect.statMode === 'flat' ? compileValueStatsToActualStats(effect.valueStats) : { ...effect.valueStats })
                : undefined),
        statMode: effect.statMode,
        qiProjection: effect.qiProjection ? effect.qiProjection.map((entry) => ({ ...entry })) : undefined,
        persistOnDeath: effect.persistOnDeath === true,
        persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    };
}

/**
 * 计算技能实际冷却 tick 数（含冷却速度属性加成）。
 * 冷却速度越高，实际冷却越短，最低 1 tick。
 */
function resolveSkillCooldownTicks(attacker, cooldown) {
    const baseCooldown = Math.max(1, Math.round(Number(cooldown) || 1));
    const cooldownSpeed = Math.trunc(Number(attacker.attrs?.numericStats?.cooldownSpeed ?? 0));
    const cooldownDivisor = Math.max(1, Math.trunc(Number(attacker.attrs?.ratioDivisors?.cooldownSpeed ?? 100)));
    const cooldownRate = signedRatioValue(cooldownSpeed, cooldownDivisor);
    const cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100);
    return Math.max(1, Math.ceil(baseCooldown * cooldownMultiplier));
}

/**
 * 递归求值技能伤害公式。
 * 支持：数值字面量、变量引用（var）、运算符（add/sub/mul/div/min/max/clamp）。
 */
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

/**
 * 解析技能公式变量引用。
 * 支持：techLevel、caster/target 的 hp/maxHp/qi/maxQi/realmLv、
 * caster/target 的 attr.*、stat.*、buff.*.stacks。
 */
function resolveSkillFormulaVar(variable, context) {
    if (variable === 'techLevel') {
        return context.techLevel;
    }
    if (variable === 'caster.realmLv') {
        return context.attacker.realmLv ?? context.attacker.level ?? context.techLevel ?? 0;
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
        return Object.hasOwn(context.attacker.attrs.finalAttrs, key) ? context.attacker.attrs.finalAttrs[key] : 0;
    }
    if (variable.startsWith('target.attr.')) {
        const key = variable.slice('target.attr.'.length);
        return Object.hasOwn(context.target.attrs.finalAttrs, key) ? context.target.attrs.finalAttrs[key] : 0;
    }
    if (variable.startsWith('caster.stat.')) {
        const key = variable.slice('caster.stat.'.length);
        return Object.hasOwn(context.attacker.attrs.numericStats, key) ? context.attacker.attrs.numericStats[key] : 0;
    }
    if (variable.startsWith('target.stat.')) {
        const key = variable.slice('target.stat.'.length);
        return Object.hasOwn(context.target.attrs.numericStats, key) ? context.target.attrs.numericStats[key] : 0;
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

/** 获取指定 buff 的当前层数。 */
function resolveBuffStacks(buffs, buffId) {
    if (!buffs || !buffId) {
        return 0;
    }
    const target = buffs.find((entry) => entry.buffId === buffId);
    return target ? Math.max(0, target.stacks) : 0;
}
