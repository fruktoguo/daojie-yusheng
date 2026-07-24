/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { applyCombatAttackIntensityQiCost, calcQiCostWithOutputLimit, compileValueStatsToActualStats, percentModifierToMultiplier, resolveCombatAttackIntensityDamageMultiplier, resolvePlayerFacingContentName, resolveSkillEffectiveRange, signedRatioValue } from '@mud/shared';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { resolveMonsterCombatExpEquivalentFallback } from './monster-combat-exp-equivalent.helper';
import { resolveCombatDamage, resolveTileCombatDamage } from './combat-pipeline-compose';
import {
    areCombatCraftSkillLevelsEqual,
    resolveCombatantCraftSkillLevel,
    resolveCraftSkillKindFromFormulaVar,
    snapshotCombatantCraftSkillLevels,
} from './skill-formula-craft-level.helpers';

/** 战斗运行时技能结算服务。 */
@Injectable()
export class PlayerCombatService {
    playerRuntimeService;
    skillDamageCacheByOwner = new WeakMap();
    skillDamageCacheStats = createSkillDamageCacheStats();

    constructor(
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
    ) {
        this.playerRuntimeService = playerRuntimeService;
    }

    /** 构建单次施法可复用的施法者战斗态，避免 AOE 多目标重复包装玩家属性。 */
    createCombatPlayerState(player) {
        return toCombatPlayerState(player);
    }

    /** 读取施法伤害复用统计，供性能诊断与专项回归验证。 */
    getSkillDamageCacheStats() {
        return { ...this.skillDamageCacheStats };
    }

    /** 重置施法伤害复用统计，不清空缓存内容。 */
    resetSkillDamageCacheStats() {
        this.skillDamageCacheStats = createSkillDamageCacheStats();
    }

    /**
     * 判断地块目标能否复用整份技能结算结果。
     * 只要任一伤害公式读取目标变量或未知变量，就必须逐目标执行完整结算。
     */
    canReuseResolvedTileSkillResult(resolved) {
        const effects = Array.isArray(resolved?.skill?.effects) ? resolved.skill.effects : [];
        let hasDamageEffect = false;
        for (const effect of effects) {
            if (effect?.type !== 'damage') {
                continue;
            }
            hasDamageEffect = true;
            if (resolveReusableSkillFormulaDependencyMask(effect.formula) < 0) {
                return false;
            }
        }
        return hasDamageEffect;
    }

    /** 解析并规范化玩家技能；同一次多目标施法可复用该结果，避免按目标重复扫描功法列表。 */
    resolvePlayerSkillForCast(attacker, skillId, currentTick) {
        const resolved = resolvePlayerSkill(attacker.techniques.techniques, attacker.combat.cooldownReadyTickBySkillId, skillId);
        normalizeResolvedPlayerSkillCooldown(attacker, resolved, currentTick);
        return resolved;
    }

    /**
     * 玩家对目标玩家施放技能。
     * 流程：校验自攻击 → 解析技能 → 执行结算 → 设置反击目标 → 应用伤害。
     */
    castSkill(attacker, target, skillId, currentTick, distance, options = undefined) {
        if (attacker.playerId === target.playerId) {
            throw new BadRequestException('不能以自己为攻击目标');
        }

        const resolved = options?.resolvedSkill?.skill?.id === skillId
            ? options.resolvedSkill
            : this.resolvePlayerSkillForCast(attacker, skillId, currentTick);
        const attackerState = options?.attackerCombatState ?? toCombatPlayerState(attacker);

        const result = this.executeResolvedSkillCast(attackerState, toCombatPlayerState(target), resolved, currentTick, distance, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
                options?.onQiSpent?.(attacker, amount);
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
            applySelfHeal: (amount) => {
                this.playerRuntimeService.healPlayer(attacker.playerId, amount);
            },
        }, options);
        if (options?.skipTargetRetaliation !== true) {
            this.playerRuntimeService.setRetaliatePlayerTarget(target.playerId, attacker.playerId, currentTick);
        }
        if (options?.skipTargetDamageApplication !== true && result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return Object.assign(result, { targetPlayerId: target.playerId });
    }

    /**
     * 玩家对自身施放 buff 技能（无目标校验）。
     */
    castSelfSkill(attacker, skillId, currentTick, options = undefined) {
        const resolved = options?.resolvedSkill?.skill?.id === skillId
            ? options.resolvedSkill
            : this.resolvePlayerSkillForCast(attacker, skillId, currentTick);
        const selfState = options?.attackerCombatState ?? toCombatPlayerState(attacker);
        const result = this.executeResolvedSkillCast(selfState, selfState, resolved, currentTick, 0, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
                options?.onQiSpent?.(attacker, amount);
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
            applySelfHeal: (amount) => {
                this.playerRuntimeService.healPlayer(attacker.playerId, amount);
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
        const resolved = options?.resolvedSkill?.skill?.id === skillId
            ? options.resolvedSkill
            : this.resolvePlayerSkillForCast(attacker, skillId, currentTick);
        const attackerState = options?.attackerCombatState ?? toCombatPlayerState(attacker);

        const result = this.executeResolvedSkillCast(attackerState, target, resolved, currentTick, distance, {
            spendQi: (amount) => {
                if (options?.skipResourceAndCooldown === true) {
                    return;
                }
                this.playerRuntimeService.spendQi(attacker.playerId, amount);
                options?.onQiSpent?.(attacker, amount);
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
            applySelfHeal: (amount) => {
                this.playerRuntimeService.healPlayer(attacker.playerId, amount);
            },
        }, options);
        return {
            ...result,
            targetMonsterId: target.runtimeId,
        };
    }

    /** 解析怪物技能；同一次怪物多目标施法可复用该结果。 */
    resolveMonsterSkillForCast(attacker, skillId) {
        return resolveMonsterSkill(attacker, skillId);
    }

    /**
     * 妖兽对玩家施放技能。
     * 怪物侧跳过元气和冷却检查（由 AI 层保证），伤害直接应用到玩家。
     */
    castMonsterSkill(attacker, target, skillId, currentTick, distance, applySelfBuff, applyTargetBuff, spendQi, options = undefined) {
        const resolved = options?.resolvedSkill?.skill?.id === skillId
            ? options.resolvedSkill
            : resolveMonsterSkill(attacker, skillId);
        const attackerState = options?.attackerCombatState ?? attacker;

        const result = this.executeResolvedSkillCast(attackerState, toCombatPlayerState(target), resolved, currentTick, distance, {
            setCooldownReadyTick: () => undefined,
            spendQi,
            applySelfBuff,
            applyTargetBuff: applyTargetBuff ?? ((buff) => {
                this.playerRuntimeService.applyTemporaryBuff(target.playerId, buff);
            }),
            applySelfHeal: () => undefined,
        }, options);
        if (options?.skipTargetDamageApplication !== true && result.totalDamage > 0) {
            this.playerRuntimeService.applyDamage(target.playerId, result.totalDamage);
        }
        return Object.assign(result, { targetPlayerId: target.playerId });
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
        if (options?.skipRangeValidation !== true && range > 0 && distance > range) {
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
            const standardQiCost = Math.round(calcQiCostWithOutputLimit(plannedCost, Math.max(0, attacker.attrs.numericStats.maxQiOutputPerTick)));
            qiCost = applyCombatAttackIntensityQiCost(standardQiCost, options?.combatAttackIntensity ?? attacker.combatAttackIntensity);
            if (!Number.isFinite(qiCost) || attacker.qi < qiCost) {
                throw new BadRequestException(`技能 ${resolved.skill.id} 元气不足`);
            }
            if (qiCost > 0) {
                handlers.spendQi?.(qiCost);
            }
        }
        // 设置冷却（含冷却速度加成）。AOE 后续目标和怪物技能已由调用方保证资源/冷却，不再重复计算。
        if (options?.skipResourceAndCooldown !== true && !resolved.skipCooldownCheck) {
            handlers.setCooldownReadyTick(currentTick + resolveSkillCooldownTicks(attacker, resolved.skill.cooldown));
        }

        // 逐效果结算
        let totalDamage = 0;
        let totalRawDamage = 0;
        let primaryDamageKind = null;
        let primaryDamageElement = undefined;
        const damageRolls = [];
        let totalHeal = 0;
        const selfBuffs = [];
        const targetBuffs = [];
        let anyCrit = false;
        let allDodged = true;
        let anyResolved = false;
        let anyBroken = false;
        let hasDamageRoll = false;

        let hitCount = 0;
        const targetCount = Math.max(1, Math.round(options?.targetCount ?? 1));
        const formulaContext = {
            attacker,
            target,
            techLevel: resolved.level,
            targetCount,
        };
        const damageMultiplier = resolveCombatAttackIntensityDamageMultiplier(options?.combatAttackIntensity ?? attacker.combatAttackIntensity);
        const combatContext = createEffectDamageContext(attacker, target, options?.isTileTarget === true);
        const sectionRecorder = typeof options?.recordSkillCastSectionDuration === 'function'
            ? options.recordSkillCastSectionDuration
            : null;
        for (const effect of resolved.skill.effects) {
            if (effect.type === 'damage') {
                // 伤害效果：求值公式 → 结算命中/暴击/防御
                const reusableDamage = this.resolveReusableSkillDamage(
                    effect,
                    formulaContext,
                    damageMultiplier,
                    combatContext,
                    options,
                    sectionRecorder,
                );
                const baseDamage = reusableDamage.baseDamage;
                let damageRoll = options?.isTileTarget === true
                    ? reusableDamage.tileDamageRoll
                    : undefined;
                if (!damageRoll) {
                    const damageStartedAt = sectionRecorder ? performance.now() : 0;
                    damageRoll = resolveEffectDamage(effect, baseDamage, combatContext);
                    sectionRecorder?.('damagePipelineMs', performance.now() - damageStartedAt);
                    if (options?.isTileTarget === true && reusableDamage.cacheable === true) {
                        reusableDamage.tileDamageRoll = damageRoll;
                        this.skillDamageCacheStats.tilePipelineMisses += 1;
                    }
                }
                damageRolls.push(damageRoll);
                hasDamageRoll = true;
                anyCrit ||= damageRoll.crit === true;
                allDodged &&= damageRoll.dodged === true;
                anyResolved ||= damageRoll.resolved === true;
                anyBroken ||= damageRoll.broken === true;
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

            // heal 效果：求值公式 → 治疗施法者（allies 视为施法者自身）
            // skipSelfEffects 用于 AOE 多目标场景，避免 heal 重复执行
            if (effect.type === 'heal') {
                if (options?.skipSelfEffects === true) {
                    continue;
                }
                const formulaStartedAt = sectionRecorder ? performance.now() : 0;
                const healAmount = Math.max(0, Math.round(evaluateSkillFormula(effect.formula, formulaContext)));
                sectionRecorder?.('formulaEvalMs', performance.now() - formulaStartedAt);
                if (healAmount > 0) {
                    totalHeal += healAmount;
                    const applyStartedAt = sectionRecorder ? performance.now() : 0;
                    handlers.applySelfHeal?.(healAmount);
                    sectionRecorder?.('healApplyMs', performance.now() - applyStartedAt);
                }
                continue;
            }

            // 仅 buff 类型才走 buff 应用分支；
            // heal / cleanse / temporary_tile 等其他 effect 类型在此处不应被当作 buff 处理，
            // 否则 toTemporaryBuff 会生成 buffId=undefined 的条目，进入 buff 集合后排序时
            // 在 String.prototype.localeCompare 上崩溃（见 player_runtime / map_instance buff 排序）。
            if (effect.type !== 'buff') {
                continue;
            }
            // buff 效果：生成临时 buff 并应用到自身或目标
            const buildStartedAt = sectionRecorder ? performance.now() : 0;
            const buff = toTemporaryBuff(effect, resolved.skill);
            sectionRecorder?.('buffBuildMs', performance.now() - buildStartedAt);
            if (effect.target === 'self' || effect.target === 'allies') {
                if (options?.skipSelfEffects !== true) {
                    const applyStartedAt = sectionRecorder ? performance.now() : 0;
                    handlers.applySelfBuff?.(buff);
                    sectionRecorder?.('buffApplySelfMs', performance.now() - applyStartedAt);
                    selfBuffs.push({ buffId: buff.buffId, name: buff.name, category: buff.category, duration: buff.duration });
                }
            }
            else {
                const applyStartedAt = sectionRecorder ? performance.now() : 0;
                handlers.applyTargetBuff?.(buff);
                sectionRecorder?.('buffApplyTargetMs', performance.now() - applyStartedAt);
                targetBuffs.push({ buffId: buff.buffId, name: buff.name, category: buff.category, duration: buff.duration });
            }
        }
        return {
            skillId: resolved.skill.id,
            qiCost,
            totalDamage,
            totalRawDamage,
            totalHeal,
            hitCount,
            damageKind: primaryDamageKind ?? undefined,
            damageElement: primaryDamageElement,
            damageRolls,
            selfBuffs,
            targetBuffs,
            crit: anyCrit,
            dodged: hasDamageRoll && allDodged,
            resolved: anyResolved,
            broken: anyBroken,
        };
    }

    /**
     * 复用目标无关的技能基础伤害；地块目标还可复用完整地块伤害管线结果。
     * 玩家和妖兽目标仍在调用方逐目标执行随机命中、暴击、防御与境界结算。
     */
    resolveReusableSkillDamage(effect, formulaContext, damageMultiplier, combatContext, options, sectionRecorder) {
        const cacheOwner = options?.formulaCacheOwner;
        const formulaDependencyMask = resolveReusableSkillFormulaDependencyMask(effect.formula);
        if (!cacheOwner || typeof cacheOwner !== 'object' || formulaDependencyMask < 0) {
            this.skillDamageCacheStats.bypasses += 1;
            const formulaStartedAt = sectionRecorder ? performance.now() : 0;
            const baseDamage = Math.max(1, Math.round(evaluateSkillFormula(effect.formula, formulaContext) * damageMultiplier));
            sectionRecorder?.('formulaEvalMs', performance.now() - formulaStartedAt);
            return { baseDamage };
        }
        const dependencyMask = formulaDependencyMask | SKILL_FORMULA_DEPENDENCY.ATTRS;

        let cacheByEffect = this.skillDamageCacheByOwner.get(cacheOwner);
        if (!cacheByEffect) {
            cacheByEffect = new WeakMap();
            this.skillDamageCacheByOwner.set(cacheOwner, cacheByEffect);
        }
        const cached = cacheByEffect.get(effect);
        if (cached && matchesSkillDamageCacheEntry(cached, formulaContext, damageMultiplier, dependencyMask)) {
            this.skillDamageCacheStats.formulaHits += 1;
            if (options?.isTileTarget === true && cached.tileDamageRoll) {
                this.skillDamageCacheStats.tilePipelineHits += 1;
            }
            return cached;
        }

        this.skillDamageCacheStats.formulaMisses += 1;
        const formulaStartedAt = sectionRecorder ? performance.now() : 0;
        const baseDamage = Math.max(1, Math.round(evaluateSkillFormula(effect.formula, formulaContext) * damageMultiplier));
        sectionRecorder?.('formulaEvalMs', performance.now() - formulaStartedAt);
        const entry = createSkillDamageCacheEntry(formulaContext, damageMultiplier, baseDamage, dependencyMask);
        cacheByEffect.set(effect, entry);
        return entry;
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
    const maxCooldownTicks = resolveSkillCooldownTicks(attacker, resolved.skill.cooldown);
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
        combatAttackIntensity: player.combat?.combatAttackIntensity,
        realm: player.realm,
        realmLv: player.realm?.realmLv,
        combatExp: player.combatExp,
        attrs: {
            finalAttrs: player.attrs.finalAttrs,
            numericStats: player.attrs.numericStats,
            ratioDivisors: player.attrs.ratioDivisors,
            revision: Math.max(0, Math.trunc(Number(player.attrs.revision) || 0)),
        },
        buffs: player.buffs.buffs,
        buffsRevision: Math.max(0, Math.trunc(Number(player.buffs.revision) || 0)),
        craftSkillLevels: snapshotCombatantCraftSkillLevels(player),
    };
}

/** 获取技能射程（优先 targeting.range，兜底 skill.range）。 */
function resolveSkillRange(skill) {
    return resolveSkillEffectiveRange(skill);
}

/** 获取有效施放射程（options 可覆盖）。 */
function resolveEffectiveSkillCastRange(skill, options) {
    const optionRange = Number(options?.range);
    if (Number.isFinite(optionRange)) {
        return Math.max(0, Math.round(optionRange));
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

/** 构建单次施法可复用的伤害结算上下文，避免多段效果重复解析战斗者属性。 */
function createEffectDamageContext(attacker, target, isTile = false) {
    const attackerStats = attacker.attrs.numericStats;
    return {
        attackerStats,
        attackerRatios: attacker.attrs.ratioDivisors,
        attackerRealmLv: resolveCombatantRealmLv(attacker),
        attackerCombatExp: resolveCombatantCombatExp(attacker),
        targetStats: isTile ? {} : target.attrs.numericStats,
        targetRatios: isTile ? {} : target.attrs.ratioDivisors,
        targetRealmLv: isTile ? 1 : resolveCombatantRealmLv(target),
        targetCombatExp: isTile ? 0 : resolveCombatantCombatExp(target),
        inferredDamageKind: inferDamageKind(attackerStats),
        resolve: isTile ? resolveTileCombatDamage : resolveCombatDamage,
    };
}

/** 单次技能效果伤害结算：战斗者走完整管线，地块走地块管线。 */
function resolveEffectDamage(effect, baseDamage, context) {
    const damageKind = effect.damageKind ?? context.inferredDamageKind;
    const outcome = context.resolve({
        attackerStats: context.attackerStats,
        attackerRatios: context.attackerRatios,
        attackerRealmLv: context.attackerRealmLv,
        attackerCombatExp: context.attackerCombatExp,
        targetStats: context.targetStats,
        targetRatios: context.targetRatios,
        targetRealmLv: context.targetRealmLv,
        targetCombatExp: context.targetCombatExp,
        baseDamage,
        damageKind,
        element: effect.element,
    });
    outcome.damageKind = damageKind;
    outcome.element = effect.element;
    return outcome;
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
const temporaryBuffCompiledStatsCache = new WeakMap();

function toTemporaryBuff(effect, skill) {
    const fallbackName = resolvePlayerFacingContentName(
        effect.buffId ?? skill.id,
        '未知效果',
        effect.name,
        skill.name,
    );
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
        sourceSkillName: resolvePlayerFacingContentName(skill.id, '未知技能', skill.name),
        color: effect.color,
        attrs: effect.attrs || undefined,
        attrMode: effect.attrMode,
        stats: resolveTemporaryBuffStats(effect),
        statMode: effect.statMode,
        qiProjection: effect.qiProjection || undefined,
        persistOnDeath: effect.persistOnDeath === true,
        persistOnReturnToSpawn: effect.persistOnReturnToSpawn === true,
    };
}

function resolveTemporaryBuffStats(effect) {
    if (effect.stats) {
        return effect.stats;
    }
    if (!effect.valueStats) {
        return undefined;
    }
    if (effect.statMode !== 'flat') {
        return effect.valueStats;
    }
    const cached = temporaryBuffCompiledStatsCache.get(effect);
    if (cached) {
        return cached;
    }
    const compiled = compileValueStatsToActualStats(effect.valueStats);
    temporaryBuffCompiledStatsCache.set(effect, compiled);
    return compiled;
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
const constantZeroSkillFormulaEvaluator = () => 0;
const compiledSkillFormulaCache = new WeakMap();
const reusableSkillFormulaDependencyCache = new WeakMap();
const SKILL_FORMULA_DEPENDENCY = Object.freeze({
    ATTRS: 1 << 0,
    BUFFS: 1 << 1,
    HP: 1 << 2,
    MAX_HP: 1 << 3,
    QI: 1 << 4,
    MAX_QI: 1 << 5,
    REALM: 1 << 6,
    TECH_LEVEL: 1 << 7,
    TARGET_COUNT: 1 << 8,
    CRAFT_SKILLS: 1 << 9,
});
const UNREUSABLE_SKILL_FORMULA_DEPENDENCY = -1;

function evaluateSkillFormula(formula, context) {
    if (typeof formula === 'number') {
        return formula;
    }
    return getCompiledSkillFormula(formula)(context);
}

function getCompiledSkillFormula(formula) {
    if (typeof formula === 'number') {
        return () => formula;
    }
    if (!formula || typeof formula !== 'object') {
        return constantZeroSkillFormulaEvaluator;
    }
    const cached = compiledSkillFormulaCache.get(formula);
    if (cached) {
        return cached;
    }
    const compiled = compileSkillFormula(formula);
    compiledSkillFormulaCache.set(formula, compiled);
    return compiled;
}

/**
 * 只有已知的施法者变量、功法等级和目标数可以跨目标复用。
 * 未知变量保守视为不可复用，避免未来扩展公式变量后误用旧缓存。
 */
function resolveReusableSkillFormulaDependencyMask(formula) {
    if (typeof formula === 'number') {
        return 0;
    }
    if (!formula || typeof formula !== 'object') {
        return UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
    }
    const cached = reusableSkillFormulaDependencyCache.get(formula);
    if (cached !== undefined) {
        return cached;
    }
    let result = UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
    if ('var' in formula) {
        result = resolveReusableSkillFormulaVariableDependency(formula.var);
    }
    else if (formula.op === 'clamp') {
        result = mergeReusableSkillFormulaDependencies([
            resolveReusableSkillFormulaDependencyMask(formula.value),
            formula.min === undefined ? 0 : resolveReusableSkillFormulaDependencyMask(formula.min),
            formula.max === undefined ? 0 : resolveReusableSkillFormulaDependencyMask(formula.max),
        ]);
    }
    else if (['add', 'sub', 'mul', 'div', 'min', 'max'].includes(formula.op)) {
        result = Array.isArray(formula.args)
            ? mergeReusableSkillFormulaDependencies(
                formula.args.map((entry) => resolveReusableSkillFormulaDependencyMask(entry)),
            )
            : UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
    }
    reusableSkillFormulaDependencyCache.set(formula, result);
    return result;
}

function mergeReusableSkillFormulaDependencies(dependencies) {
    let merged = 0;
    for (const dependency of dependencies) {
        if (dependency < 0) {
            return UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
        }
        merged |= dependency;
    }
    return merged;
}

function resolveReusableSkillFormulaVariableDependency(variable) {
    if (variable === 'techLevel') return SKILL_FORMULA_DEPENDENCY.TECH_LEVEL;
    if (variable === 'targetCount') return SKILL_FORMULA_DEPENDENCY.TARGET_COUNT;
    if (typeof variable !== 'string') {
        return UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
    }
    if (variable === 'caster.realmLv') return SKILL_FORMULA_DEPENDENCY.REALM;
    if (variable === 'caster.hp') return SKILL_FORMULA_DEPENDENCY.HP;
    if (variable === 'caster.maxHp') return SKILL_FORMULA_DEPENDENCY.MAX_HP;
    if (variable === 'caster.qi') return SKILL_FORMULA_DEPENDENCY.QI;
    if (variable === 'caster.maxQi') return SKILL_FORMULA_DEPENDENCY.MAX_QI;
    if (resolveCraftSkillKindFromFormulaVar(variable)) return SKILL_FORMULA_DEPENDENCY.CRAFT_SKILLS;
    if (variable.startsWith('caster.attr.') || variable.startsWith('caster.stat.')) {
        return SKILL_FORMULA_DEPENDENCY.ATTRS;
    }
    if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
        return SKILL_FORMULA_DEPENDENCY.BUFFS;
    }
    return UNREUSABLE_SKILL_FORMULA_DEPENDENCY;
}

function createSkillDamageCacheStats() {
    return {
        formulaHits: 0,
        formulaMisses: 0,
        tilePipelineHits: 0,
        tilePipelineMisses: 0,
        bypasses: 0,
    };
}

function createSkillDamageCacheEntry(context, damageMultiplier, baseDamage, dependencyMask) {
    return {
        cacheable: true,
        dependencyMask,
        attrsRevision: Math.max(0, Math.trunc(Number(context.attacker?.attrs?.revision) || 0)),
        buffsRevision: Math.max(0, Math.trunc(Number(context.attacker?.buffsRevision) || 0)),
        hp: Number(context.attacker?.hp) || 0,
        maxHp: Number(context.attacker?.maxHp) || 0,
        qi: Number(context.attacker?.qi) || 0,
        maxQi: Number(context.attacker?.maxQi) || 0,
        realmLv: resolveCombatantRealmLv(context.attacker),
        techLevel: Math.max(0, Math.trunc(Number(context.techLevel) || 0)),
        targetCount: Math.max(1, Math.trunc(Number(context.targetCount) || 1)),
        craftSkillLevels: (dependencyMask & SKILL_FORMULA_DEPENDENCY.CRAFT_SKILLS) !== 0
            ? snapshotCombatantCraftSkillLevels(context.attacker)
            : null,
        damageMultiplier,
        baseDamage,
        tileDamageRoll: undefined,
    };
}

function matchesSkillDamageCacheEntry(entry, context, damageMultiplier, dependencyMask) {
    if (entry.dependencyMask !== dependencyMask || entry.damageMultiplier !== damageMultiplier) {
        return false;
    }
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.ATTRS) !== 0
        && entry.attrsRevision !== Math.max(0, Math.trunc(Number(context.attacker?.attrs?.revision) || 0))) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.BUFFS) !== 0
        && entry.buffsRevision !== Math.max(0, Math.trunc(Number(context.attacker?.buffsRevision) || 0))) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.HP) !== 0
        && entry.hp !== (Number(context.attacker?.hp) || 0)) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.MAX_HP) !== 0
        && entry.maxHp !== (Number(context.attacker?.maxHp) || 0)) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.QI) !== 0
        && entry.qi !== (Number(context.attacker?.qi) || 0)) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.MAX_QI) !== 0
        && entry.maxQi !== (Number(context.attacker?.maxQi) || 0)) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.REALM) !== 0
        && entry.realmLv !== resolveCombatantRealmLv(context.attacker)) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.TECH_LEVEL) !== 0
        && entry.techLevel !== Math.max(0, Math.trunc(Number(context.techLevel) || 0))) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.TARGET_COUNT) !== 0
        && entry.targetCount !== Math.max(1, Math.trunc(Number(context.targetCount) || 1))) return false;
    if ((dependencyMask & SKILL_FORMULA_DEPENDENCY.CRAFT_SKILLS) !== 0
        && !areCombatCraftSkillLevelsEqual(entry.craftSkillLevels, context.attacker)) return false;
    return true;
}

function compileSkillFormula(formula) {
    if ('var' in formula) {
        const resolveVar = compileSkillFormulaVarResolver(formula.var);
        const scale = formula.scale ?? 1;
        return (context) => resolveVar(context) * scale;
    }
    if (formula.op === 'clamp') {
        const evaluateValue = getCompiledSkillFormula(formula.value);
        const evaluateMin = formula.min === undefined ? null : getCompiledSkillFormula(formula.min);
        const evaluateMax = formula.max === undefined ? null : getCompiledSkillFormula(formula.max);
        return (context) => {
            const value = evaluateValue(context);
            const min = evaluateMin ? evaluateMin(context) : Number.NEGATIVE_INFINITY;
            const max = evaluateMax ? evaluateMax(context) : Number.POSITIVE_INFINITY;
            return Math.min(max, Math.max(min, value));
        };
    }

    const args = Array.isArray(formula.args) ? formula.args : [];
    const evaluators = args.map((entry) => getCompiledSkillFormula(entry));
    switch (formula.op) {
        case 'add': {
            return (context) => {
                let sum = 0;
                for (const evaluate of evaluators) {
                    sum += evaluate(context);
                }
                return sum;
            };
        }
        case 'sub': {
            if (args.length <= 0) {
                return constantZeroSkillFormulaEvaluator;
            }
            return (context) => {
                let value = evaluators[0](context);
                for (let index = 1; index < evaluators.length; index += 1) {
                    value -= evaluators[index](context);
                }
                return value;
            };
        }
        case 'mul': {
            return (context) => {
                let product = 1;
                for (const evaluate of evaluators) {
                    product *= evaluate(context);
                }
                return product;
            };
        }
        case 'div': {
            if (args.length <= 0) {
                return constantZeroSkillFormulaEvaluator;
            }
            return (context) => {
                let value = evaluators[0](context);
                for (let index = 1; index < evaluators.length; index += 1) {
                    const divisor = evaluators[index](context);
                    if (divisor !== 0) {
                        value /= divisor;
                    }
                }
                return value;
            };
        }
        case 'min': {
            if (args.length <= 0) {
                return constantZeroSkillFormulaEvaluator;
            }
            return (context) => {
                let value = evaluators[0](context);
                for (let index = 1; index < evaluators.length; index += 1) {
                    value = Math.min(value, evaluators[index](context));
                }
                return value;
            };
        }
        case 'max': {
            if (args.length <= 0) {
                return constantZeroSkillFormulaEvaluator;
            }
            return (context) => {
                let value = evaluators[0](context);
                for (let index = 1; index < evaluators.length; index += 1) {
                    value = Math.max(value, evaluators[index](context));
                }
                return value;
            };
        }
        default:
            return constantZeroSkillFormulaEvaluator;
    }
}

function compileSkillFormulaVarResolver(variable) {
    if (variable === 'techLevel') {
        return (context) => context.techLevel;
    }
    if (variable === 'caster.realmLv') {
        return (context) => context.attacker.realmLv ?? context.attacker.level ?? context.techLevel ?? 0;
    }
    if (variable === 'targetCount') {
        return (context) => context.targetCount;
    }
    if (variable === 'caster.hp') {
        return (context) => context.attacker.hp;
    }
    if (variable === 'caster.maxHp') {
        return (context) => context.attacker.maxHp;
    }
    if (variable === 'caster.qi') {
        return (context) => context.attacker.qi;
    }
    if (variable === 'caster.maxQi') {
        return (context) => context.attacker.maxQi;
    }
    const craftSkillKind = resolveCraftSkillKindFromFormulaVar(variable);
    if (craftSkillKind) {
        return (context) => resolveCombatantCraftSkillLevel(context.attacker, craftSkillKind);
    }
    if (variable === 'target.hp') {
        return (context) => context.target.hp;
    }
    if (variable === 'target.maxHp') {
        return (context) => context.target.maxHp;
    }
    if (variable === 'target.qi') {
        return (context) => context.target.qi;
    }
    if (variable === 'target.maxQi') {
        return (context) => context.target.maxQi;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.attr.')) {
        const key = variable.slice('caster.attr.'.length);
        return (context) => context.attacker.attrs.finalAttrs[key] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('target.attr.')) {
        const key = variable.slice('target.attr.'.length);
        return (context) => context.target.attrs.finalAttrs[key] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.stat.')) {
        const key = variable.slice('caster.stat.'.length);
        return (context) => context.attacker.attrs.numericStats[key] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('target.stat.')) {
        const key = variable.slice('target.stat.'.length);
        return (context) => context.target.attrs.numericStats[key] ?? 0;
    }
    if (typeof variable === 'string' && variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('caster.buff.'.length, -'.stacks'.length);
        return (context) => resolveBuffStacks(context.attacker.buffs, buffId);
    }
    if (typeof variable === 'string' && variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
        const buffId = variable.slice('target.buff.'.length, -'.stacks'.length);
        return (context) => resolveBuffStacks(context.target.buffs, buffId);
    }
    return constantZeroSkillFormulaEvaluator;
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
    const craftSkillKind = resolveCraftSkillKindFromFormulaVar(variable);
    if (craftSkillKind) {
        return resolveCombatantCraftSkillLevel(context.attacker, craftSkillKind);
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
