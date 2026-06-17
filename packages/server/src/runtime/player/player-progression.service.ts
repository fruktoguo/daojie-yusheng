/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable, Logger, Optional, Inject } from '@nestjs/common';
import * as fs from 'fs';
import { ATTR_KEYS, DEFAULT_PLAYER_REALM_STAGE, PLAYER_REALM_CONFIG, PLAYER_REALM_ORDER, PLAYER_REALM_STAGE_LEVEL_RANGES, PlayerRealmStage, SHATTER_SPIRIT_PILL_COST_RATIO as SHARED_SHATTER_SPIRIT_PILL_COST_RATIO, TechniqueRealm, calculateTechniqueComprehensionProgressGain, calculateTechniqueComprehensionRequiredProgress, computeCraftSkillExpGain, deriveTechniqueRealm, getBodyTrainingExpToNext, getMonsterKillExpLevelAdjustment, getMonsterLevelExpDecayMultiplier, getTechniqueExpLevelAdjustment, getTechniqueExpToNext, getTechniqueMaxLevel, isCreatedTechniqueId, normalizeBodyTrainingState } from '@mud/shared';
import { resolveProjectPath } from '../../common/project-path';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { getMonsterCombatExpGradeFactor, resolveMonsterCombatExpTierFactor } from '../combat/monster-combat-exp-equivalent.helper';
import { PlayerAttributesService } from './player-attributes.service';
import { PlayerCountersPersistenceService } from '../../persistence/player-counters-persistence.service';
import { normalizeRuntimeRealmExpMultiplier, normalizeRuntimeRealmLevelEntry } from './realm-runtime-exp.helpers';

/** 境界配置文件路径，启动时从这里加载所有境界参数。 */
const REALM_LEVELS_PATH = ['packages', 'server', 'data', 'content', 'realm-levels.json'];

/** 突破配置文件路径，启动时加载每级突破材料、功法和属性门槛。 */
const BREAKTHROUGHS_PATH = ['packages', 'server', 'data', 'content', 'breakthroughs.json'];

/** 元素类型顺序，用于天门、灵根和面板展示。 */
const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];

/** 功法品阶顺序，用于突破要求的最低品阶判断。 */
const TECHNIQUE_GRADE_ORDER = ['mortal', 'yellow', 'mystic', 'earth', 'heaven', 'spirit', 'saint', 'emperor'];

/** 元素中文名，供面板和日志直接展示。 */
const ELEMENT_KEY_LABELS = {
    metal: '金',
    wood: '木',
    water: '水',
    fire: '火',
    earth: '土',
};

/** 开启天门玩法的境界门槛。 */
const HEAVEN_GATE_REALM_LEVEL = 18;

/** main 口径：境界修为不足时，底蕴最多按本次经验的额外两倍补足。 */
const FOUNDATION_EXP_MULTIPLIER = 3;
const FOUNDATION_EXP_BONUS_MULTIPLIER = FOUNDATION_EXP_MULTIPLIER - 1;

/** main 口径：单次击杀最多给当前境界需求 5 倍的境界/战斗经验。 */
const SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER = 5;

/** 每点根基提供的六维境界乘区百分比。 */
const ROOT_FOUNDATION_ATTR_PERCENT_PER_POINT = 1;

/** 每次天门斩根允许切掉的最大条目数。 */
const HEAVEN_GATE_MAX_SEVERED = 4;

/** 默认天门重掷时使用的平均加成。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;

const SPIRITUAL_ROOT_SEED_REROLL_COUNTS = {
    heaven: 10,
    divine: 100,
};

const SHATTER_SPIRIT_PILL_COST_RATIO = SHARED_SHATTER_SPIRIT_PILL_COST_RATIO ?? 0.25;
const PATH_SEVERED_BREAKTHROUGH_LABEL = '仙路断绝';
const PATH_SEVERED_BREAKTHROUGH_REASON = '仙路断绝，你的前路已被无形天堑阻断，暂时无法继续突破。';

/** 额外完美灵根的软上限。 */
const HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP = 174;

/** 天门灵根分布在不同段位上的权重表。 */
const HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS = {
    5: [
        { min: 1, max: 15, weight: 35 },
        { min: 16, max: 30, weight: 35 },
        { min: 31, max: 45, weight: 18 },
        { min: 46, max: 60, weight: 8 },
        { min: 61, max: 75, weight: 2.95 },
        { min: 76, max: 99, weight: 1 },
        { min: 100, max: 100, weight: 0.05 },
    ],
    4: [
        { min: 1, max: 15, weight: 32 },
        { min: 16, max: 32, weight: 33 },
        { min: 33, max: 50, weight: 18 },
        { min: 51, max: 66, weight: 8 },
        { min: 67, max: 82, weight: 4.8 },
        { min: 83, max: 99, weight: 4 },
        { min: 100, max: 100, weight: 0.2 },
    ],
    3: [
        { min: 1, max: 12, weight: 17 },
        { min: 13, max: 30, weight: 23 },
        { min: 31, max: 50, weight: 27 },
        { min: 51, max: 68, weight: 18 },
        { min: 69, max: 84, weight: 9.2 },
        { min: 85, max: 99, weight: 5.3 },
        { min: 100, max: 100, weight: 0.5 },
    ],
    2: [
        { min: 1, max: 10, weight: 10 },
        { min: 11, max: 25, weight: 13 },
        { min: 26, max: 45, weight: 21 },
        { min: 46, max: 65, weight: 23 },
        { min: 66, max: 82, weight: 16.5 },
        { min: 83, max: 99, weight: 15.5 },
        { min: 100, max: 100, weight: 1 },
    ],
    1: [
        { min: 1, max: 8, weight: 1 },
        { min: 9, max: 20, weight: 3 },
        { min: 21, max: 40, weight: 10 },
        { min: 41, max: 60, weight: 16 },
        { min: 61, max: 78, weight: 24 },
        { min: 79, max: 92, weight: 23 },
        { min: 93, max: 99, weight: 20 },
        { min: 100, max: 100, weight: 3 },
    ],
};

/** 天门分布的展开幅度，决定灵根数值的离散程度。 */
const HEAVEN_GATE_DISTRIBUTION_SPREAD = {
    5: 0.18,
    4: 0.28,
    3: 0.4,
    2: 0.58,
    1: 0,
};

/** 玩家成长结算器：负责境界、战力、道行和修炼态推进。 */
@Injectable()
export class PlayerProgressionService {
    /** 内容仓库，用于境界描述、奖励和外部模板查询。 */
    contentTemplateRepository;
    /** 属性结算器，用于境界变化后重算最终面板。 */
    playerAttributesService;
    /** 玩家计数器持久化服务，用于记录逆天改命次数等。 */
    playerCountersPersistenceService;
    /** 运行时日志器，记录境界加载和结算异常。 */
    logger = new Logger(PlayerProgressionService.name);
    /** 已加载的境界表，按 realmLv 索引。 */
    realmLevels = new Map();
    /** 当前读取到的最大境界等级。 */
    maxRealmLevel = 1;
    /** 已加载的突破配置，按来源境界等级索引。 */
    breakthroughTransitions = new Map();
    /** 注入内容仓库和属性结算器。 */
    constructor(
        contentTemplateRepository: ContentTemplateRepository,
        playerAttributesService: PlayerAttributesService,
        @Optional() @Inject(PlayerCountersPersistenceService) playerCountersPersistenceService: PlayerCountersPersistenceService | null = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerAttributesService = playerAttributesService;
        this.playerCountersPersistenceService = playerCountersPersistenceService;
    }
    /** 模块初始化时加载境界表。 */
    onModuleInit() {
        this.loadRealmLevels();
    }
    /** 初始化玩家的境界、属性和体力/元气上限。 */
    initializePlayer(player) {

        const resolved = this.resolveInitialRealmState(player);
        this.applyRealmPresentation(player, resolved);
        this.playerAttributesService.recalculate(player);
        // recalculate 后立刻刷一次 breakthrough preview，避免 detail 文案残留
        // createInitialState 默认 baseAttrs（六维总值 60）。否则手机端在 recalculate
        // 之后、下一次 refreshPreview 之前打开突破弹层，会看到"当前六维总属性 60"。
        this.refreshPreview(player);
        player.hp = clamp(player.hp, 0, player.maxHp);
        player.qi = clamp(player.qi, 0, player.maxQi);
        // 启动时对比补齐 highestRealmLv
        const currentRealmLv = resolved.realmLv ?? 1;
        if (currentRealmLv > 1 && player.playerId) {
            this.playerCountersPersistenceService?.setMax?.(player.playerId, 'highestRealmLv', currentRealmLv);
        }
    }
    /** 读取历史最高境界；当前境界更高时同步取当前值，供永久解锁类系统使用。 */
    getHighestRealmLv(player) {
        const highestRealmLv = this.playerCountersPersistenceService?.get?.(player.playerId, 'highestRealmLv') ?? 0;
        const currentRealmLv = player.realm?.realmLv ?? 1;
        return Math.max(
            Math.max(0, Math.trunc(Number(highestRealmLv) || 0)),
            Math.max(1, Math.trunc(Number(currentRealmLv) || 1)),
        );
    }
    /** 只刷新境界展示态，不修改实际推进结果。 */
    refreshPreview(player) {

        const resolved = this.normalizeRealmState(player.realm);
        this.applyRealmPresentation(player, resolved);
    }
    /** 增加境界经验并返回本次是否真的发生变化。 */
    gainRealmProgress(player, amount, options: any = {}) {

        const result = this.gainRealmProgressInternal(player, amount, options);
        this.finalizeProgressionMutation(player, result);
        return toProgressionMutationResult(result);
    }
    /** 增加基础修为值。 */
    gainFoundation(player, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        player.foundation += normalized;
        const mutation = {
            changed: true,
            panelDirty: true,
            attrRecalculated: false,
            techniquesDirty: false,
            actionsDirty: false,
            notices: [],
        };
        this.finalizeProgressionMutation(player, mutation);
        return toProgressionMutationResult(mutation);
    }
    /** 消耗当前境界修为与底蕴，优先扣进度，不足再扣底蕴。 */
    consumeRealmProgressAndFoundation(player, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                consumedProgress: 0,
                consumedFoundation: 0,
            };
        }

        const currentRealm = this.normalizeRealmState(player.realm);
        const consumedProgress = Math.min(currentRealm.progress, normalized);
        const remaining = Math.max(0, normalized - consumedProgress);
        const consumedFoundation = Math.min(player.foundation, remaining);
        const nextProgress = Math.max(0, currentRealm.progress - consumedProgress);
        const nextRealm = this.createRealmStateFromLevel(currentRealm.realmLv, nextProgress);
        if (consumedFoundation > 0) {
            player.foundation -= consumedFoundation;
        }
        const realmChanged = nextRealm.progress !== currentRealm.progress
            || nextRealm.breakthroughReady !== currentRealm.breakthroughReady;
        const attrRecalculated = realmChanged
            ? this.applyResolvedRealmState(player, nextRealm, { bumpPersistentRevision: false })
            : false;
        const changed = consumedProgress > 0 || consumedFoundation > 0;
        this.finalizeProgressionMutation(player, {
            changed,
            panelDirty: !attrRecalculated && consumedFoundation > 0,
            attrRecalculated,
            techniquesDirty: false,
            actionsDirty: nextRealm.breakthroughReady !== currentRealm.breakthroughReady,
            notices: [],
        });
        return {
            changed,
            consumedProgress,
            consumedFoundation,
            dirtyDomains: changed ? describeProgressionDirtyDomains({
                changed,
                panelDirty: !attrRecalculated && consumedFoundation > 0,
                attrRecalculated,
                techniquesDirty: false,
                actionsDirty: nextRealm.breakthroughReady !== currentRealm.breakthroughReady,
                notices: [],
            }) : [],
        };
    }
    /** 增加战斗经验。 */
    gainCombatExp(player, amount) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        player.combatExp += normalized;
        const mutation = {
            changed: true,
            panelDirty: true,
            attrRecalculated: false,
            techniquesDirty: false,
            actionsDirty: false,
            notices: [],
        };
        this.finalizeProgressionMutation(player, mutation);
        return toProgressionMutationResult(mutation);
    }
    /** 推进修炼 tick，处理境界经验、战斗经验和功法经验。 */
    advanceProgressionTick(player, elapsedTicks = 1, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedTicks = normalizeProgressionTicks(elapsedTicks);

        let changed = false;

        let panelDirty = false;

        let attrRecalculated = false;

        let techniquesDirty = false;

        let actionsDirty = false;

        const notices = [];
        if (normalizedTicks > 0) {
            player.lifeElapsedTicks += normalizedTicks;
            changed = true;
            panelDirty = true;
        }

        const foundationGain = normalizeProgressionAmount(options.foundation);
        if (foundationGain > 0) {
            player.foundation += foundationGain;
            changed = true;
            panelDirty = true;
        }

        const combatExpGain = normalizeProgressionAmount(options.combatExp);
        if (combatExpGain > 0) {
            player.combatExp += combatExpGain;
            changed = true;
            panelDirty = true;
        }

        const realmProgressGain = normalizeProgressionAmount(options.realmProgress);
        if (realmProgressGain > 0) {

            const realmResult = this.gainRealmProgressInternal(player, realmProgressGain, options);
            changed = changed || realmResult.changed;
            panelDirty = panelDirty || realmResult.panelDirty;
            attrRecalculated = attrRecalculated || realmResult.attrRecalculated;
            techniquesDirty = techniquesDirty || realmResult.techniquesDirty;
            actionsDirty = actionsDirty || realmResult.actionsDirty;
            notices.push(...realmResult.notices);
        }
        if (!changed) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        this.finalizeProgressionMutation(player, {
            changed,
            panelDirty,
            attrRecalculated,
            techniquesDirty,
            actionsDirty,
            notices,
        });
        return toProgressionMutationResult({
            changed,
            panelDirty,
            attrRecalculated,
            techniquesDirty,
            actionsDirty,
            notices,
        });
    }
    /** 增加工艺活动附带的境界修为，按 main 的 craft 经验口径溢出到底蕴。 */
    grantCraftRealmExp(player, baseGain) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalizedBaseGain = Math.max(0, Math.round(Number(baseGain) || 0));
        if (normalizedBaseGain <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        const result = this.gainRealmProgressInternal(player, normalizedBaseGain, {
            useFoundation: false,
            overflowToFoundation: true,
        });
        this.finalizeProgressionMutation(player, result);
        return toProgressionMutationResult(result);
    }
    /** 推进闭关修炼 tick。 */
    advanceCultivation(player, elapsedTicks = 1, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const ticks = Math.max(0, Math.floor(normalizeProgressionTicks(elapsedTicks)));
        if (ticks <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        if (player.combat?.cultivationActive !== true) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }

        const resolved = this.resolveActiveCultivatingTechnique(player);
        let mutation = resolved;

        const auraMultiplier = normalizeCultivationAuraMultiplier(options.auraMultiplier);

        const realmBasePerTick = Math.max(0, Math.round(player.attrs.numericStats.realmExpPerTick * auraMultiplier));

        const techniqueBasePerTick = Math.max(0, Math.round(player.attrs.numericStats.techniqueExpPerTick * auraMultiplier));

        const realmGain = applyRateBonus(realmBasePerTick * ticks, player.attrs.numericStats.playerExpRate, 1);

        if (realmGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.gainRealmProgressInternal(player, realmGain, {
                useFoundation: true,
                overflowToFoundation: true,
            }));
        }
        const techniqueBaseGain = techniqueBasePerTick * ticks;
        const pendingComprehensionTicks = this.resolveCultivatingPendingComprehension(player) ? ticks : 0;
        if (techniqueBaseGain > 0 || pendingComprehensionTicks > 0) {
            mutation = mergeProgressionMutation(mutation, this.advanceTechniqueProgressInternal(player, techniqueBaseGain, {
                expBonus: player.attrs.numericStats.techniqueExpRate,
                minimumGain: 1,
                allowPendingComprehension: true,
                pendingComprehensionTicks,
            }));
        }
        if (!mutation.changed) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        this.finalizeProgressionMutation(player, mutation);
        return toProgressionMutationResult(mutation);
    }
    /** 统计击杀妖兽后获得的境界和功法经验。 */
    grantMonsterKillProgress(player, input: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const monsterLevel = Math.max(1, Math.floor(Number(input.monsterLevel) || 1));

        const expAdjustmentRealmLv = Math.max(1, Math.floor(Number(input.expAdjustmentRealmLv) || player.realm?.realmLv || 1));

        const contributionRatio = clamp(Number(input.contributionRatio) || 1, 0, 1);

        const expMultiplier = Number.isFinite(input.expMultiplier) ? Math.max(0, Number(input.expMultiplier)) : 1;

        const monsterTier = input.monsterTier;

        const beforeFoundation = player.foundation;

        const beforeCombatExp = player.combatExp;

        const beforeRealmLv = player.realm?.realmLv ?? 1;

        const beforeRealmProgress = player.realm?.progress ?? 0;

        const beforeTechnique = snapshotCultivatingTechnique(player);

        const realmGain = applyRateBonus(this.getRealmCombatExp(monsterLevel, expAdjustmentRealmLv, monsterTier, expMultiplier, contributionRatio), player.attrs.numericStats.playerExpRate, 0);

        const techniqueBaseGain = this.getTechniqueCombatExp(monsterLevel, expAdjustmentRealmLv, monsterTier, expMultiplier, contributionRatio);

        let mutation = createEmptyMutation();
        if (realmGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.gainRealmProgressInternal(player, realmGain, {
                useFoundation: true,
                overflowToFoundation: true,
                trackCombatExp: true,
            }));
        }
        if (techniqueBaseGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.advanceTechniqueProgressInternal(player, techniqueBaseGain, {
                expBonus: player.attrs.numericStats.techniqueExpRate,
                minimumGain: 0,
                allowPendingComprehension: true,
                pendingComprehensionTicks: 1,
            }));
        }

        const actualRealmGain = calculateRealmProgressGain(beforeRealmLv, beforeRealmProgress, player.realm);

        const actualFoundationGain = Math.max(0, player.foundation - beforeFoundation);

        const actualCombatExpGain = Math.max(0, player.combatExp - beforeCombatExp);

        const actualTechniqueGain = calculateTechniqueGain(beforeTechnique, snapshotCultivatingTechnique(player));
        if (actualRealmGain > 0 || actualFoundationGain > 0 || actualCombatExpGain > 0 || actualTechniqueGain.gained > 0) {

            const segments = [];
            if (actualRealmGain > 0) {
                segments.push(`境界修为 +${actualRealmGain}`);
            }
            if (actualTechniqueGain.gained > 0 && actualTechniqueGain.name) {
                const gainLabel = actualTechniqueGain.kind === 'comprehension' ? '领悟进度' : '经验';
                segments.push(`${actualTechniqueGain.name} ${gainLabel} +${formatProgressionGainAmount(actualTechniqueGain.gained)}`);
            }
            if (actualCombatExpGain > 0) {
                segments.push(`战斗经验 +${actualCombatExpGain}`);
            }
            if (actualFoundationGain > 0) {
                segments.push(`底蕴 +${actualFoundationGain}`);
            }
            mutation = mergeProgressionMutation(mutation, {
                ...createEmptyMutation(),
                changed: true,
                notices: [{

                        text: `${input.isKiller === false ? '参与击杀' : '斩杀'}${input.monsterName?.trim() ? ` ${input.monsterName.trim()}` : ' 敌人'}，${segments.join('，')}。`,
                        kind: 'info',
                        structured: { key: 'notice.combat.kill-progress', vars: { action: input.isKiller === false ? '参与击杀' : '斩杀', target: input.monsterName?.trim() || '敌人', details: segments.join('，') }, pills: [{ key: 'target', style: 'target' }] },
                    }],
            });
        }
        if (!mutation.changed) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        this.finalizeProgressionMutation(player, mutation);
        return toProgressionMutationResult(mutation);
    }
    /** 处理天门界面的斩根、重掷和抽灵根操作。 */
    handleHeavenGateAction(player, action, element) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const realm = this.normalizeRealmState(player.realm);
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            return {
                changed: false,
                notices: [{ text: '当前境界不可开天门', kind: 'warn', structured: { key: 'notice.heaven-gate.realm-invalid' } }],
                dirtyDomains: [],
            };
        }

        const heavenGate = this.syncHeavenGateState(player, realm);
        if (!heavenGate?.unlocked) {
            return {
                changed: false,
                notices: [{ text: '当前尚未叩开仙门，暂时不能开天门', kind: 'warn', structured: { key: 'notice.heaven-gate.not-unlocked' } }],
                dirtyDomains: [],
            };
        }
        if (action === 'sever' || action === 'restore') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再改动灵根', kind: 'warn', structured: { key: 'notice.heaven-gate.already-entered-no-modify' } }],
                    dirtyDomains: [],
                };
            }
            if (!element || !ELEMENT_KEYS.includes(element)) {
                return {
                    changed: false,
                    notices: [{ text: '灵根目标无效', kind: 'warn', structured: { key: 'notice.heaven-gate.invalid-element' } }],
                    dirtyDomains: [],
                };
            }

            const cost = this.getHeavenGateSeverCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足', kind: 'warn', structured: { key: 'notice.heaven-gate.progress-insufficient' } }],
                    dirtyDomains: [],
                };
            }

            const severed = new Set(heavenGate.severed);
            if (action === 'sever') {
                if (severed.has(element)) {
                    return {
                        changed: false,
                        notices: [{ text: `${ELEMENT_KEY_LABELS[element]}灵根已被斩断`, kind: 'warn', structured: { key: 'notice.heaven-gate.already-severed', vars: { element: ELEMENT_KEY_LABELS[element] } } }],
                        dirtyDomains: [],
                    };
                }
                if (severed.size >= HEAVEN_GATE_MAX_SEVERED) {
                    return {
                        changed: false,
                        notices: [{ text: '最多只能斩断四条灵根', kind: 'warn', structured: { key: 'notice.heaven-gate.max-severed' } }],
                        dirtyDomains: [],
                    };
                }
                severed.add(element);
            }
            else if (!severed.has(element)) {
                return {
                    changed: false,
                    notices: [{ text: `${ELEMENT_KEY_LABELS[element]}灵根尚未斩断`, kind: 'warn', structured: { key: 'notice.heaven-gate.not-severed', vars: { element: ELEMENT_KEY_LABELS[element] } } }],
                    dirtyDomains: [],
                };
            }
            else {
                severed.delete(element);
            }
            player.heavenGate = {
                unlocked: true,
                severed: [...severed],
                roots: null,
                entered: false,
                averageBonus: heavenGate.averageBonus,
            };
            this.applyResolvedRealmState(player, this.createRealmStateFromLevel(realm.realmLv, Math.max(0, realm.progress - cost)));
            return {
                changed: true,
                notices: [{

                        text: `${action === 'sever' ? '斩断' : '补回'}${ELEMENT_KEY_LABELS[element]}灵根，消耗 ${cost} 点境界修为。`,
                        kind: 'success',
                        structured: { key: action === 'sever' ? 'notice.heaven-gate.sever-success' : 'notice.heaven-gate.restore-success', vars: { element: ELEMENT_KEY_LABELS[element], cost }, pills: [{ key: 'element', style: 'target' }] },
                    }],
                dirtyDomains: ['progression', 'attr'],
            };
        }
        if (action === 'open') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再重开天门', kind: 'warn', structured: { key: 'notice.heaven-gate.already-entered-no-reopen' } }],
                    dirtyDomains: [],
                };
            }

            const roots = this.rollHeavenGateRoots(heavenGate.severed, heavenGate.averageBonus);
            player.heavenGate = {
                unlocked: true,
                severed: [...heavenGate.severed],
                roots,
                entered: false,
                averageBonus: heavenGate.averageBonus,
            };
            this.applyRealmPresentation(player, realm);
            this.finalizePresentationMutation(player);

            const total = ELEMENT_KEYS.reduce((sum, key) => sum + roots[key], 0);
            return {
                changed: true,
                notices: [{
                        text: `天门已开，本次灵根总值为 ${total}。`,
                        kind: 'success',
                        structured: { key: 'notice.heaven-gate.open-success', vars: { total }, pills: [{ key: 'total', style: 'damage' }] },
                    }],
                dirtyDomains: ['progression', 'attr'],
            };
        }
        if (action === 'reroll') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再逆天改命', kind: 'warn', structured: { key: 'notice.heaven-gate.already-entered-no-reroll' } }],
                    dirtyDomains: [],
                };
            }
            if (!heavenGate.roots) {
                return {
                    changed: false,
                    notices: [{ text: '当前尚未开天门，无法逆天改命', kind: 'warn', structured: { key: 'notice.heaven-gate.not-opened-no-reroll' } }],
                    dirtyDomains: [],
                };
            }

            const cost = this.getHeavenGateRerollCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足，无法逆天改命', kind: 'warn', structured: { key: 'notice.heaven-gate.progress-insufficient-reroll' } }],
                    dirtyDomains: [],
                };
            }

            const nextAverageBonus = heavenGate.averageBonus + HEAVEN_GATE_REROLL_AVERAGE_BONUS;
            player.heavenGate = {
                unlocked: true,
                severed: [...heavenGate.severed],
                roots: null,
                entered: false,
                averageBonus: nextAverageBonus,
            };
            this.playerCountersPersistenceService?.increment?.(player.playerId, 'rerollCount');
            this.applyResolvedRealmState(player, this.createRealmStateFromLevel(realm.realmLv, Math.max(0, realm.progress - cost)));
            return {
                changed: true,
                notices: [{
                        text: `逆天改命消耗 ${cost} 点境界修为，后续开天门平均品质加成提升至 +${nextAverageBonus}。`,
                        kind: 'success',
                        structured: { key: 'notice.heaven-gate.reroll-success', vars: { cost, averageBonus: nextAverageBonus }, pills: [{ key: 'cost', style: 'damage' }, { key: 'averageBonus', style: 'target' }] },
                    }],
                dirtyDomains: ['progression', 'attr'],
            };
        }
        if (!heavenGate.roots) {
            return {
                changed: false,
                notices: [{ text: '尚未开天门，无法入天门', kind: 'warn', structured: { key: 'notice.heaven-gate.not-opened-no-enter' } }],
                dirtyDomains: [],
            };
        }
        if (heavenGate.entered) {
            return {
                changed: false,
                notices: [{ text: '当前已入天门，无需重复确认', kind: 'warn', structured: { key: 'notice.heaven-gate.already-entered-duplicate' } }],
                dirtyDomains: [],
            };
        }

        const resolvedRoots = cloneHeavenGateRoots(heavenGate.roots);
        player.spiritualRoots = resolvedRoots;
        player.heavenGate = {
            unlocked: true,
            severed: [...heavenGate.severed],
            roots: resolvedRoots,
            entered: true,
            averageBonus: heavenGate.averageBonus,
        };
        this.applyResolvedRealmState(player, realm, { forceAttrRecalculate: true });
        return {
            changed: true,
            notices: [{
                    text: '你已入天门，灵根结果已定。后续仍需按原本条件突破至练气。',
                    kind: 'success',
                    structured: { key: 'notice.heaven-gate.enter-success' },
                }],
            dirtyDomains: ['progression', 'attr'],
        };
    }
    applySpiritualRootSeed(player, tierInput) {
  // 灵根幼苗是服务端权威消耗品效果；这里只改天门状态，不直接完成“入天门”确认。

        const tier = tierInput === 'heaven' || tierInput === 'divine' ? tierInput : null;
        if (!tier) {
            return {
                changed: false,
                notices: [{ text: '灵根幼苗品阶无效', kind: 'warn', structured: { key: 'notice.heaven-gate.seed-tier-invalid' } }],
                dirtyDomains: [],
            };
        }

        const realm = this.normalizeRealmState(player.realm);
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            return {
                changed: false,
                notices: [{ text: '至少需在叩仙门境界使用灵根幼苗', kind: 'warn', structured: { key: 'notice.heaven-gate.seed-realm-invalid' } }],
                dirtyDomains: [],
            };
        }

        const heavenGate = this.syncHeavenGateState(player, realm);
        if (heavenGate?.entered) {
            return {
                changed: false,
                notices: [{ text: '当前已入天门，无法再改动灵根', kind: 'warn', structured: { key: 'notice.heaven-gate.already-entered-no-modify' } }],
                dirtyDomains: [],
            };
        }

        const gainedRerollCount = SPIRITUAL_ROOT_SEED_REROLL_COUNTS[tier];
        const currentRerollCount = Math.max(0, Math.floor((heavenGate?.averageBonus ?? 0) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
        const reducedRerollCount = Math.max(0, gainedRerollCount - currentRerollCount);
        const foundationCost = this.getHeavenGateRerollCost(realm) * reducedRerollCount;
        const currentFoundation = Math.max(0, Math.floor(Number(player.foundation) || 0));
        if (foundationCost > currentFoundation) {
            return {
                changed: false,
                notices: [{ text: `底蕴不足，使用${tier === 'divine' ? '神品' : '天品'}灵根幼苗需要 ${foundationCost} 点底蕴`, kind: 'warn', structured: { key: 'notice.heaven-gate.seed-foundation-insufficient', vars: { tierName: tier === 'divine' ? '神品' : '天品', cost: foundationCost } } }],
                dirtyDomains: [],
            };
        }

        const roots = createSpiritualRootSeedRoots(tier);
        player.foundation = currentFoundation - foundationCost;
        const nextRerollCount = currentRerollCount + gainedRerollCount;
        player.heavenGate = {
            unlocked: true,
            severed: [],
            roots,
            entered: false,
            averageBonus: getHeavenGateAverageBonusFromRerollCount(nextRerollCount),
        };
        this.playerCountersPersistenceService?.increment?.(player.playerId, 'rerollCount', gainedRerollCount);
        this.applyRealmPresentation(player, realm);

        const rootSummary = tier === 'divine'
            ? '五行灵根已全部固定为 100'
            : '五行灵根已全部定为 99，并至少一系催至 100';
        const costSummary = foundationCost > 0 ? `，消耗 ${foundationCost} 点底蕴` : '';
        return {
            changed: true,
            notices: [{
                text: `${tier === 'divine' ? '神品' : '天品'}灵根幼苗扎入命宫${costSummary}，${rootSummary}，逆天改命累计提升 ${gainedRerollCount} 次（现为 ${nextRerollCount} 次）。`,
                kind: 'success',
                structured: { key: 'notice.heaven-gate.seed-success', vars: { tierName: tier === 'divine' ? '神品' : '天品', costSummary: foundationCost > 0 ? `消耗 ${foundationCost} 点底蕴` : '', rootSummary, gainedRerollCount, totalRerollCount: nextRerollCount }, pills: [{ key: 'tierName', style: 'target' }] },
            }],
            actionsDirty: false,
            dirtyDomains: ['progression', 'attr'],
        };
    }
    applyShatterSpiritPill(player) {
        const realm = this.normalizeRealmState(player.realm);
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            return {
                changed: false,
                notices: [{ text: '当前至少需要叩仙门境界，才能使用碎灵丹', kind: 'warn', structured: { key: 'notice.heaven-gate.shatter-realm-invalid' } }],
                dirtyDomains: [],
            };
        }

        const heavenGate = this.syncHeavenGateState(player, realm);
        if (!heavenGate?.unlocked) {
            return {
                changed: false,
                notices: [{ text: '当前尚未叩开仙门，暂时不能使用碎灵丹', kind: 'warn', structured: { key: 'notice.heaven-gate.shatter-not-unlocked' } }],
                dirtyDomains: [],
            };
        }

        const cost = Math.max(0, Math.round(Math.max(0, realm.progress) * SHATTER_SPIRIT_PILL_COST_RATIO));
        const previousRerollCount = getHeavenGateRerollCount(heavenGate.averageBonus);
        const nextRerollCount = previousRerollCount + 1;
        const nextRealm = this.createRealmStateFromLevel(realm.realmLv, Math.max(0, realm.progress - cost));
        this.playerCountersPersistenceService?.increment?.(player.playerId, 'rerollCount');
        this.applyHeavenGateResetState(player, nextRealm, getHeavenGateAverageBonusFromRerollCount(nextRerollCount), heavenGate.unlocked === true);
        return {
            changed: true,
            notices: [{
                text: `碎灵丹化开命宫旧痕，消耗 ${cost} 点境界修为，天门已重置，逆天改命累计额外增加 1 次（现为 ${nextRerollCount} 次）。`,
                kind: 'success',
                structured: { key: 'notice.heaven-gate.shatter-success', vars: { cost, totalRerollCount: nextRerollCount }, pills: [{ key: 'cost', style: 'damage' }] },
            }],
            actionsDirty: true,
            dirtyDomains: ['progression', 'attr', 'vitals'],
        };
    }
    applyWangshengPill(player) {
        const nextRealm = this.createRealmStateFromLevel(1, 0);
        player.foundation = 0;
        this.applyResolvedRealmState(player, nextRealm, { forceAttrRecalculate: true });
        player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
        player.qi = Math.min(Math.round(player.maxQi ?? player.qi), Math.max(0, player.qi));
        player.dead = false;
        // 复活/重置并 clamp hp/qi 后显式 bump selfRevision，确保客户端收到 hp/qi/dead 更新
        // （applyResolvedRealmState 仅在 recalculate 且 attrs 真变时 bump，复活场景可能不 bump，导致 HUD 仍显示死亡/旧值）。
        player.selfRevision += 1;
        return {
            changed: true,
            notices: [{
                text: '往生丹药力尽化前尘，境界已重归凡胎，境界修为与底蕴尽数归零。',
                kind: 'success',
                structured: { key: 'notice.heaven-gate.wangsheng-success' },
            }],
            actionsDirty: true,
            dirtyDomains: ['progression', 'attr', 'vitals'],
        };
    }
    /** 尝试完成一次境界突破。 */
    attemptBreakthrough(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const realm = this.normalizeRealmState(player.realm);
        if (!realm.breakthroughReady) {
            return {
                changed: false,
                notices: [{ text: '你的境界火候未到，尚不能突破', kind: 'warn', structured: { key: 'notice.progression.breakthrough-not-ready' } }],
                dirtyDomains: [],
            };
        }

        const preview = this.buildBreakthroughPreview(player, realm);
        if (!preview) {
            return {
                changed: false,
                notices: [{ text: '突破条件尚未满足', kind: 'warn', structured: { key: 'notice.progression.breakthrough-requirements-unmet' } }],
                dirtyDomains: [],
            };
        }
        if (!preview.canBreakthrough) {
            return {
                changed: false,
                notices: [{ text: preview.blockedReason ?? '突破条件尚未满足', kind: 'warn', structured: { key: 'notice.progression.breakthrough-blocked' } }],
                dirtyDomains: [],
            };
        }
        const transition = this.breakthroughTransitions.get(realm.realmLv);
        let consumedItems = false;
        for (const requirement of transition?.requirements ?? []) {
            if (requirement.type !== 'item' || !hasInventoryItemCountAtLeast(player, requirement.itemId, requirement.count)) {
                continue;
            }
            this.consumeInventoryItemById(player, requirement.itemId, requirement.count);
            consumedItems = true;
        }
        if (consumedItems) {
            player.inventory.revision += 1;
        }
        const targetRealm = this.createRealmStateFromLevel(preview.targetRealmLv, 0);
        this.applyResolvedRealmState(player, targetRealm);
        this.playerCountersPersistenceService?.setMax?.(player.playerId, 'highestRealmLv', preview.targetRealmLv);
        player.hp = player.maxHp;
        player.qi = player.maxQi;
        // 突破后 hp/qi 全恢复，需显式 bump selfRevision 以确保客户端 SelfDelta 携带 hp/qi：
        // buildSelfDelta 以 selfRevision 为唯一发送闸门，applyResolvedRealmState 仅在 recalculate 且 attrs 真变时 bump，
        // 同 stage 突破（attrRecalculated=false）不会 recalculate，导致客户端 HUD 短暂显示旧血量直到下次 regen。
        player.selfRevision += 1;
        return {
            changed: true,
            notices: [{
                    text: `你已成功突破至 ${targetRealm.displayName}。`,
                    kind: 'success',
                    structured: { key: 'notice.progression.breakthrough', vars: { realmName: targetRealm.displayName }, pills: [{ key: 'realmName', style: 'target' }] },
                }],
            dirtyDomains: ['progression', 'attr', 'vitals'],
        };
    }
    /** 凝练 1 点根基：消耗当前境界整条修为和当前突破材料。 */
    refineRootFoundation(player) {
        const realm = this.normalizeRealmState(player.realm);
        const preview = this.buildRootFoundationPreview(player, realm);
        if (!preview.canRefine) {
            return {
                changed: false,
                notices: [{ text: preview.blockedReason ?? '当前还不能凝练根基', kind: 'warn', structured: { key: 'notice.progression.refine-blocked' } }],
                dirtyDomains: [],
            };
        }
        for (const item of preview.items) {
            this.consumeInventoryItemById(player, item.itemId, item.count);
        }
        if (preview.items.length > 0) {
            player.inventory.revision += 1;
        }
        player.rootFoundation = Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)) + 1;
        const nextRealm = this.createRealmStateFromLevel(realm.realmLv, 0);
        this.applyResolvedRealmState(player, nextRealm, { forceAttrRecalculate: true });
        return {
            changed: true,
            notices: [{
                    text: `你凝练 1 点根基，六维境界乘区提高 ${ROOT_FOUNDATION_ATTR_PERCENT_PER_POINT}%。`,
                    kind: 'success',
                    structured: { key: 'notice.progression.refine-success', vars: { percent: ROOT_FOUNDATION_ATTR_PERCENT_PER_POINT }, pills: [{ key: 'percent', style: 'damage' }] },
                }],
            actionsDirty: true,
            dirtyDomains: ['inventory', 'progression', 'attr', 'vitals'],
        };
    }
    /** 自动凝练根基：只在玩家开关开启且当前预览已经满足时执行，不输出阻塞提示。 */
    autoRefineRootFoundation(player) {
        if (player?.combat?.autoRootFoundation !== true) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        const realm = this.normalizeRealmState(player.realm);
        const preview = this.buildRootFoundationPreview(player, realm);
        if (!preview.canRefine) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
                dirtyDomains: [],
            };
        }
        return this.refineRootFoundation(player);
    }
    /** 判断当前境界根基是否已达可凝练上限。 */
    isRootFoundationAtCurrentCap(player) {
        const realm = this.normalizeRealmState(player.realm);
        const preview = this.buildRootFoundationPreview(player, realm);
        return preview.remaining <= 0;
    }
    /** 读取并缓存境界配置文件。 */
    loadRealmLevels() {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const filePath = resolveProjectPath(...REALM_LEVELS_PATH);

        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        const expMultiplier = normalizeRuntimeRealmExpMultiplier(raw?.expMultiplier);
        this.realmLevels.clear();
        for (const entry of raw.levels ?? []) {
            const runtimeEntry = normalizeRuntimeRealmLevelEntry(entry, expMultiplier);
            if (!runtimeEntry) {
                continue;
            }
            this.realmLevels.set(runtimeEntry.realmLv, {
                realmLv: runtimeEntry.realmLv,
                displayName: runtimeEntry.displayName,
                name: runtimeEntry.name,
                phaseName: runtimeEntry.phaseName,
                path: runtimeEntry.path,
                review: runtimeEntry.review,
                lifespanYears: runtimeEntry.lifespanYears,
                grade: runtimeEntry.grade,
                expToNext: runtimeEntry.runtimeExpToNext,
                runtimeExpToNext: runtimeEntry.runtimeExpToNext,
            });
        }

        const finalRealmStage = PLAYER_REALM_ORDER[PLAYER_REALM_ORDER.length - 1] ?? PlayerRealmStage.QiRefining;
        const configuredMaxRealmLevel = PLAYER_REALM_STAGE_LEVEL_RANGES[finalRealmStage]?.levelTo ?? 30;
        this.maxRealmLevel = Math.min(Math.max(1, ...this.realmLevels.keys()), configuredMaxRealmLevel);
        this.loadBreakthroughTransitions();
        this.logger.log(`已从 ${filePath} 加载 ${this.realmLevels.size} 个境界等级`);
    }
    /** 读取并缓存每级突破配置。 */
    loadBreakthroughTransitions() {
        const filePath = resolveProjectPath(...BREAKTHROUGHS_PATH);
        this.breakthroughTransitions.clear();
        if (!fs.existsSync(filePath)) {
            return;
        }
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        for (const entry of raw?.transitions ?? []) {
            const transition = normalizeBreakthroughTransition(entry);
            if (!transition) {
                continue;
            }
            this.breakthroughTransitions.set(transition.fromRealmLv, transition);
        }
    }
    /** 返回已加载的境界等级列表。 */
    listRealmLevels() {
        return Array.from(this.realmLevels.values(), (entry) => ({
            realmLv: entry.realmLv,
            displayName: entry.displayName,
            name: entry.name,
            phaseName: entry.phaseName ?? undefined,
            review: entry.review,
        })).sort((left, right) => left.realmLv - right.realmLv);
    }
    /** 按等级读取已解析的境界配置，供技艺经验等运行时规则复用。 */
    getRealmLevelEntry(realmLv) {
        const normalizedLevel = Math.max(1, Math.floor(Number(realmLv) || 1));
        const entry = this.realmLevels.get(normalizedLevel);
        return entry;
    }
    /** 按等级读取已展开的运行时升级经验，禁止业务层直接读取原始配置系数。 */
    getRealmRuntimeExpToNext(realmLv) {
        const normalizedLevel = Math.max(1, Math.floor(Number(realmLv) || 1));
        return Math.max(0, Math.floor(Number(this.realmLevels.get(normalizedLevel)?.runtimeExpToNext) || 0));
    }
    /** 按 main 口径计算怪物在战斗经验伤害分层中的等价值。 */
    getMonsterCombatExpEquivalent(monsterOrLevel, monsterTier = undefined) {
        const normalizedLevel = Math.max(1, Math.floor(Number(typeof monsterOrLevel === 'object' ? monsterOrLevel?.level : monsterOrLevel) || 1));
        const expToNext = this.getRealmRuntimeExpToNext(normalizedLevel);
        if (expToNext <= 0) {
            return 0;
        }
        const realmEntry = this.realmLevels.get(normalizedLevel);
        const gradeIndex = Math.max(0, TECHNIQUE_GRADE_ORDER.indexOf(realmEntry?.grade ?? 'mortal'));
        const gradeFactor = getMonsterCombatExpGradeFactor(gradeIndex);
        const tier = typeof monsterOrLevel === 'object' ? monsterOrLevel?.tier : monsterTier;
        const tierFactor = resolveMonsterCombatExpTierFactor(tier);
        return Math.max(0, Math.floor(expToNext * gradeFactor * tierFactor));
    }
    /**
 * resolveInitialRealmState：规范化或转换InitialRealm状态。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新InitialRealm状态相关状态。
 */

    resolveInitialRealmState(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const rawRealmLv = player.realm?.realmLv;

        const rawProgress = player.realm?.progress ?? 0;
        if (typeof rawRealmLv === 'number' && Number.isFinite(rawRealmLv) && rawRealmLv > 0) {
            return this.createRealmStateFromLevel(rawRealmLv, rawProgress);
        }

        const stage = player.realm?.stage ?? PLAYER_REALM_ORDER[0];
        return this.createRealmStateFromLevel(resolveRealmLevelFromStage(stage), rawProgress);
    }
    /**
 * normalizeRealmState：规范化或转换Realm状态。
 * @param value 参数说明。
 * @returns 无返回值，直接更新Realm状态相关状态。
 */

    normalizeRealmState(value) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!value) {
            return this.createRealmStateFromLevel(1, 0);
        }
        return this.createRealmStateFromLevel(value.realmLv, value.progress);
    }
    /**
 * createRealmStateFromLevel：构建并返回目标对象。
 * @param realmLvInput 参数说明。
 * @param progressInput 参数说明。
 * @returns 无返回值，直接更新Realm状态From等级相关状态。
 */

    createRealmStateFromLevel(realmLvInput, progressInput = 0) {

        const realmLv = clamp(normalizePositiveInt(realmLvInput, 1), 1, this.maxRealmLevel);

        const entry = this.realmLevels.get(realmLv) ?? this.realmLevels.get(1);

        const stage = resolveStageForRealmLevel(realmLv);

        const config = PLAYER_REALM_CONFIG[stage];
        const breakthroughTransition = this.breakthroughTransitions.get(realmLv);

        const progressToNext = Math.max(0, entry.expToNext);

        const progress = progressToNext > 0
            ? clamp(Math.floor(Math.max(0, Number(progressInput) || 0)), 0, progressToNext)
            : 0;

        const breakthroughReady = progressToNext > 0 && progress >= progressToNext;
        return {
            stage,
            realmLv: entry.realmLv,
            displayName: entry.displayName,
            name: entry.name,
            shortName: entry.phaseName ?? config.shortName,
            path: entry.path,
            narrative: config.narrative,
            review: entry.review,
            lifespanYears: entry.lifespanYears,
            progress,
            progressToNext,
            breakthroughReady,
            nextStage: realmLv < this.maxRealmLevel ? resolveStageForRealmLevel(realmLv + 1) : undefined,
            breakthroughItems: breakthroughReady
                ? (breakthroughTransition
                    ? getBreakthroughItemRequirements(breakthroughTransition)
                    : config.breakthroughItems)
                : [],
            minTechniqueLevel: breakthroughTransition ? 0 : config.minTechniqueLevel,
            minTechniqueRealm: breakthroughTransition ? undefined : config.minTechniqueRealm,
        };
    }
    /**
 * applyResolvedRealmState：规范化或转换ResolvedRealm状态。
 * @param player 玩家对象。
 * @param realm 参数说明。
 * @param options 选项参数。
 * @returns 无返回值，直接更新ResolvedRealm状态相关状态。
 */

    applyResolvedRealmState(player, realm, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const previousStage = player.realm?.stage ?? null;

        const previousRoots = cloneHeavenGateRoots(player.spiritualRoots);
        this.applyRealmPresentation(player, realm);

        const attrRecalculated = options?.forceAttrRecalculate === true
            || previousStage !== player.realm?.stage
            || !isSameHeavenGateRoots(previousRoots, player.spiritualRoots);
        if (attrRecalculated) {
            this.playerAttributesService.recalculate(player);
            // recalculate 后立刻刷一次 breakthrough preview，避免下一级突破要求里的
            // "当前六维总属性 X / Y" 仍按 recalculate 之前的 finalAttrs 拼装。
            this.refreshPreview(player);
        }
        if (options?.bumpPersistentRevision !== false) {
            player.persistentRevision += 1;
        }
        return attrRecalculated;
    }
    /**
 * applyRealmPresentation：处理RealmPresentation并更新相关状态。
 * @param player 玩家对象。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新RealmPresentation相关状态。
 */

    applyRealmPresentation(player, realm) {

        const heavenGate = this.syncHeavenGateState(player, realm);

        const nextRealm = {
            ...realm,
            heavenGate,
            breakthrough: this.buildBreakthroughPreview(player, realm),
        };
        player.realm = nextRealm;
        player.heavenGate = heavenGate;
        player.lifespanYears = nextRealm.lifespanYears;
    }
    /**
 * buildBreakthroughPreview：构建并返回目标对象。
 * @param player 玩家对象。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新BreakthroughPreview相关状态。
 */

    buildBreakthroughPreview(player, realm) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
        const requirements = [];
        const transition = this.breakthroughTransitions.get(realm.realmLv);
        let blockedReason;
        if (!realm.breakthroughReady) {
            requirements.push({
                id: `realm_${realm.realmLv}_progress_not_ready`,
                type: 'attribute_total',
                label: '境界修为圆满',
                completed: false,
                hidden: false,
                blocksBreakthrough: true,
                detail: `当前境界修为 ${Math.max(0, Math.floor(Number(realm.progress ?? 0) || 0))} / ${Math.max(0, Math.floor(Number(realm.progressToNext ?? 0) || 0))}`,
            });
        }
        if (!transition || transition.requirements.length === 0 || transition.toRealmLv > this.maxRealmLevel) {
            requirements.push(buildPathSeveredBreakthroughRequirement(realm.realmLv));
        }
        else {
            const increaseMultiplier = transition.requirements.reduce((multiplier, requirement) => {
                if (!isOptionalBreakthroughRequirementIncreaser(requirement)
                    || isBreakthroughRequirementCompleted(player, requirement)) {
                    return multiplier;
                }
                return multiplier * (1 + getBreakthroughRequirementIncreasePct(requirement) / 100);
            }, 1);
            for (const requirement of transition.requirements) {
                const blocksBreakthrough = doesBreakthroughRequirementBlock(requirement);
                const completed = isBreakthroughRequirementCompleted(player, requirement, increaseMultiplier);
                if (requirement.type === 'item') {
                    const itemName = this.contentTemplateRepository.getItemName(requirement.itemId) ?? requirement.itemId;
                    const ownedCount = getInventoryCount(player, requirement.itemId);
                    requirements.push({
                        id: requirement.id,
                        type: 'item',
                        label: requirement.label ?? `${itemName} x${requirement.count}`,
                        completed,
                        hidden: false,
                        optional: !blocksBreakthrough,
                        blocksBreakthrough,
                        detail: completed
                            ? '当前已满足，确认突破后会消耗对应材料。'
                            : `当前尚未满足。当前 ${ownedCount} / ${requirement.count}`,
                    });
                    continue;
                }
                if (requirement.type === 'technique') {
                    requirements.push({
                        id: requirement.id,
                        type: 'technique',
                        label: requirement.label ?? formatTechniqueRequirementLabel(requirement),
                        completed,
                        hidden: false,
                        optional: !blocksBreakthrough,
                        blocksBreakthrough,
                        increasePct: isOptionalBreakthroughRequirementIncreaser(requirement) ? getBreakthroughRequirementIncreasePct(requirement) : undefined,
                        detail: isOptionalBreakthroughRequirementIncreaser(requirement)
                            ? (completed
                                ? `当前已生效；若不满足该功法条件，全部属性要求上浮 ${getBreakthroughRequirementIncreasePct(requirement)}%。`
                                : `当前未生效；若不满足该功法条件，全部属性要求上浮 ${getBreakthroughRequirementIncreasePct(requirement)}%。`)
                            : (completed ? '当前已满足。' : '当前尚未满足。'),
                    });
                    continue;
                }
                if (requirement.type === 'attribute_total') {
                    const currentTotal = getPlayerTotalAttributes(player);
                    const requiredTotal = getEffectiveAttributeRequirement(requirement.minTotalValue, increaseMultiplier);
                    requirements.push({
                        id: requirement.id,
                        type: 'attribute_total',
                        label: requiredTotal > requirement.minTotalValue
                            ? `六维总属性达到 ${requiredTotal}（基础 ${requirement.minTotalValue}）`
                            : (requirement.label ?? `六维总属性达到 ${requirement.minTotalValue}`),
                        completed,
                        hidden: false,
                        blocksBreakthrough: true,
                        detail: requiredTotal > requirement.minTotalValue
                            ? `当前六维总属性 ${currentTotal} / ${requiredTotal}，基础要求 ${requirement.minTotalValue}`
                            : `当前六维总属性 ${currentTotal} / ${requirement.minTotalValue}`,
                    });
                    continue;
                }
                if (requirement.type === 'root') {
                    const currentValue = getMaxSpiritualRootValue(player);
                    requirements.push({
                        id: requirement.id,
                        type: 'root',
                        label: requirement.label ?? `任意灵根达到 ${requirement.minValue}`,
                        completed,
                        hidden: false,
                        blocksBreakthrough: true,
                        detail: `当前最高灵根 ${currentValue} / ${requirement.minValue}`,
                    });
                    continue;
                }
            }
        }

        const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false).length;

        const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false && entry.completed).length;

        const targetRealmLv = transition?.toRealmLv ?? (this.realmLevels.has(realm.realmLv + 1) ? realm.realmLv + 1 : realm.realmLv);

        const targetRealm = this.realmLevels.get(targetRealmLv);

        blockedReason = requirements.find((entry) => entry.blocksBreakthrough !== false && !entry.completed)?.label;

        const canBreakthrough = realm.breakthroughReady
            && Boolean(transition)
            && transition.requirements.length > 0
            && transition.toRealmLv <= this.maxRealmLevel
            && blockingRequirements === completedBlockingRequirements
            && !blockedReason;
        return {
            targetRealmLv,
            targetDisplayName: targetRealm?.displayName ?? `realmLv ${targetRealmLv}`,
            totalRequirements: blockingRequirements,
            completedRequirements: completedBlockingRequirements,
            allCompleted: canBreakthrough,
            canBreakthrough,
            blockingRequirements,
            completedBlockingRequirements,
            requirements,
            rootFoundation: this.shouldShowRootFoundation(player) ? this.buildRootFoundationPreview(player, realm) : undefined,
            blockedReason,
        };
    }
    /** 历史最高境界 >= 半步筑基(30) 时才显示凝练根基。 */
    private shouldShowRootFoundation(player): boolean {
        const highestRealmLv = this.playerCountersPersistenceService?.get?.(player.playerId, 'highestRealmLv') ?? 0;
        const currentRealmLv = player.realm?.realmLv ?? 1;
        return Math.max(highestRealmLv, currentRealmLv) >= 30;
    }
    /** 构建凝练根基预览。 */
    buildRootFoundationPreview(player, realm) {
        const current = Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0));
        const cap = getRootFoundationCap(realm.realmLv);
        const remaining = Math.max(0, cap - current);
        const transition = this.breakthroughTransitions.get(realm.realmLv);
        const items = transition
            ? getBreakthroughItemRequirements(transition)
            : (realm.breakthroughItems ?? []);
        const costProgress = Math.max(0, Math.floor(realm.progressToNext ?? 0));
        const progress = Math.max(0, Math.floor(realm.progress ?? 0));
        const missingItems = getMissingBreakthroughItemRequirements(player, items);
        const canRefine = realm.breakthroughReady
            && remaining > 0
            && costProgress > 0
            && progress >= costProgress
            && missingItems.length === 0;
        let blockedReason;
        if (remaining <= 0) {
            blockedReason = current > cap
                ? `已有根基 ${current} 点，已超过当前等级可凝练上限 ${cap} 点；已有根基保留，暂不可继续凝练。`
                : `已达当前等级可凝练上限 ${cap} 点；已有根基保留，暂不可继续凝练。`;
        }
        else if (!realm.breakthroughReady || progress < costProgress) {
            blockedReason = '需要当前境界修为圆满';
        }
        else if (missingItems.length > 0) {
            const missingText = missingItems.map((item) => {
                const itemName = this.contentTemplateRepository.getItemName(item.itemId) ?? item.itemId;
                return `${itemName}缺 ${item.missingCount}`;
            }).join('、');
            blockedReason = `材料不足：${missingText}`;
        }
        return {
            current,
            cap,
            remaining,
            costProgress,
            progress,
            items,
            canRefine,
            blockedReason,
        };
    }
    /**
 * syncHeavenGateState：处理HeavenGate状态并更新相关状态。
 * @param player 玩家对象。
 * @param realm 参数说明。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

    syncHeavenGateState(player, realm) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const persisted = normalizeHeavenGateState(player.heavenGate);

        const resolvedRoots = persisted?.roots
            ? cloneHeavenGateRoots(persisted.roots)
            : normalizeHeavenGateRoots(player.spiritualRoots);

        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            if (persisted || resolvedRoots) {
                player.spiritualRoots = resolvedRoots;
                const preservedState = {
                    unlocked: persisted?.unlocked === true || resolvedRoots !== null,
                    severed: persisted?.severed ?? [],
                    roots: resolvedRoots,
                    entered: persisted?.entered === true || resolvedRoots !== null,
                    averageBonus: persisted?.averageBonus ?? 0,
                };
                player.heavenGate = preservedState;
                return preservedState;
            }
            player.heavenGate = null;
            return null;
        }

        const entered = persisted?.entered === true || (resolvedRoots !== null && player.spiritualRoots !== null);

        const unlocked = persisted?.unlocked === true || entered || this.hasReachedHeavenGateRealm(realm.realmLv);

        const nextState = {
            unlocked,
            severed: persisted?.severed ?? [],
            roots: resolvedRoots,
            entered,
            averageBonus: persisted?.averageBonus ?? 0,
        };
        player.heavenGate = nextState;
        return nextState;
    }
    /**
 * hasCompletedHeavenGate：判断CompletedHeavenGate是否满足条件。
 * @param player 玩家对象。
 * @returns 无返回值，完成CompletedHeavenGate的条件判断。
 */

    hasCompletedHeavenGate(player) {

        const heavenGate = normalizeHeavenGateState(player.heavenGate);
        return heavenGate?.entered === true || normalizeHeavenGateRoots(player.spiritualRoots) !== null;
    }
    /**
 * hasReachedHeavenGateRealm：判断ReachedHeavenGateRealm是否满足条件。
 * @param realmLv 参数说明。
 * @returns 无返回值，完成ReachedHeavenGateRealm的条件判断。
 */

    hasReachedHeavenGateRealm(realmLv) {
        return realmLv >= HEAVEN_GATE_REALM_LEVEL;
    }
    /**
 * getHeavenGateSeverCost：读取HeavenGateSever消耗。
 * @param realm 参数说明。
 * @returns 无返回值，完成HeavenGateSever消耗的读取/组装。
 */

    getHeavenGateSeverCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.1));
    }
    /**
 * getHeavenGateRerollCost：读取HeavenGateReroll消耗。
 * @param realm 参数说明。
 * @returns 无返回值，完成HeavenGateReroll消耗的读取/组装。
 */

    getHeavenGateRerollCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.25));
    }
    /**
 * weightedPickHeavenGateSegment：执行weightedPickHeavenGateSegment相关逻辑。
 * @param segments 参数说明。
 * @returns 无返回值，直接更新weightedPickHeavenGateSegment相关状态。
 */

    weightedPickHeavenGateSegment(segments) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);

        let cursor = Math.random() * totalWeight;
        for (const segment of segments) {
            cursor -= segment.weight;
            if (cursor <= 0) {
                return segment;
            }
        }
        return segments[segments.length - 1];
    }
    /**
 * randomHeavenGateInt：执行randomHeavenGateInt相关逻辑。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新randomHeavenGateInt相关状态。
 */

    randomHeavenGateInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    /**
 * getHeavenGateExtraPerfectRootKeepChance：读取HeavenGateExtraPerfect根容器KeepChance。
 * @param averageBonus 参数说明。
 * @returns 无返回值，完成HeavenGateExtraPerfect根容器KeepChance的读取/组装。
 */

    getHeavenGateExtraPerfectRootKeepChance(averageBonus) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const bonus = Math.max(0, averageBonus);
        if (bonus <= 0) {
            return 1;
        }

        const squaredBonus = bonus * bonus;

        const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
        return squaredBonus / (squaredBonus + squaredSoftCap);
    }
    /**
 * distributeHeavenGateRoots：判断distributeHeavenGate根容器是否满足条件。
 * @param total 参数说明。
 * @param remaining 参数说明。
 * @returns 无返回值，直接更新distributeHeavenGate根容器相关状态。
 */

    distributeHeavenGateRoots(total, remaining) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const result = createEmptyRoots();
        if (remaining.length === 0) {
            return result;
        }
        if (remaining.length === 1) {
            result[remaining[0]] = clamp(total, 1, 100);
            return result;
        }
        if (total === remaining.length) {
            for (const key of remaining) {
                result[key] = 1;
            }
            return result;
        }
        if (total === remaining.length * 100) {
            for (const key of remaining) {
                result[key] = 100;
            }
            return result;
        }

        const spread = HEAVEN_GATE_DISTRIBUTION_SPREAD[remaining.length] ?? 0.18;

        const scores = remaining.map(() => Math.max(0.08, 1 + (Math.random() * 2 - 1) * spread));

        const scoreSum = scores.reduce((sum, score) => sum + score, 0);

        const remainder = Math.max(0, total - remaining.length);

        const allocations = remaining.map((element, index) => ({
            element,
            extra: Math.min(99, Math.floor((remainder * scores[index]) / scoreSum)),
            fraction: (remainder * scores[index]) / scoreSum,
        }));

        let allocated = allocations.reduce((sum, entry) => sum + entry.extra, 0);

        const sorted = [...allocations].sort((left, right) => right.fraction - left.fraction);

        let cursor = 0;
        while (allocated < remainder) {

            const target = sorted[cursor % sorted.length];
            if (target.extra < 99) {
                target.extra += 1;
                allocated += 1;
            }
            cursor += 1;
        }
        for (const entry of sorted) {
            result[entry.element] = 1 + entry.extra;
        }
        return result;
    }
    /**
 * softenHeavenGatePerfectRoots：执行softenHeavenGatePerfect根容器相关逻辑。
 * @param roots 参数说明。
 * @param averageBonus 参数说明。
 * @returns 无返回值，直接更新softenHeavenGatePerfect根容器相关状态。
 */

    softenHeavenGatePerfectRoots(roots, averageBonus) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const keepChance = this.getHeavenGateExtraPerfectRootKeepChance(averageBonus);

        let preservedPerfectCount = 0;
        for (const key of ELEMENT_KEYS) {
            if (roots[key] !== 100) {
                continue;
            }
            if (preservedPerfectCount === 0) {
                preservedPerfectCount = 1;
                continue;
            }
            if (Math.random() > keepChance) {
                roots[key] = 99;
                continue;
            }
            preservedPerfectCount += 1;
        }
        return roots;
    }
    /**
 * rollHeavenGateRoots：执行rollHeavenGate根容器相关逻辑。
 * @param severed 参数说明。
 * @param averageBonus 参数说明。
 * @returns 无返回值，直接更新rollHeavenGate根容器相关状态。
 */

    rollHeavenGateRoots(severed, averageBonus) {

        const remaining = ELEMENT_KEYS.filter((element) => !severed.includes(element));

        const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remaining.length] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];

        const segment = this.weightedPickHeavenGateSegment(segments);

        const average = Math.min(100, this.randomHeavenGateInt(segment.min, segment.max) + Math.max(0, averageBonus));

        const roots = this.distributeHeavenGateRoots(average * remaining.length, [...remaining]);
        return this.softenHeavenGatePerfectRoots(roots, averageBonus);
    }
    /**
 * consumeInventoryItemById：执行consume背包道具ByID相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @param count 数量。
 * @returns 无返回值，直接更新consume背包道具ByID相关状态。
 */

    consumeInventoryItemById(player, itemId, count) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        let remaining = count;
        for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
            const item = player.inventory.items[index];
            if (!item || item.itemId !== itemId) {
                continue;
            }

            const consumed = Math.min(item.count, remaining);
            item.count -= consumed;
            remaining -= consumed;
            if (item.count <= 0) {
                player.inventory.items.splice(index, 1);
            }
        }
    }
    /**
 * gainRealmProgressInternal：执行gainRealm进度Internal相关逻辑。
 * @param player 玩家对象。
 * @param amount 参数说明。
 * @param options 选项参数。
 * @returns 无返回值，直接更新gainRealm进度Internal相关状态。
 */

    gainRealmProgressInternal(player, amount, options) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                panelDirty: false,
                attrRecalculated: false,
                techniquesDirty: false,
                actionsDirty: false,
                notices: [],
            };
        }

        const realm = this.normalizeRealmState(player.realm);

        const gain = options.trackCombatExp === true
            ? capSingleCombatRealmExpGain(realm, normalized)
            : normalized;

        const canAdvanceRealm = realm.progressToNext > 0 && realm.realmLv < this.maxRealmLevel;

        let nextProgress = realm.progress;

        let foundationChanged = false;

        let combatExpChanged = false;
        if (canAdvanceRealm) {

            const room = Math.max(0, realm.progressToNext - nextProgress);
            const acceptedBaseGain = Math.min(room, gain);
            if (acceptedBaseGain > 0) {
                nextProgress += acceptedBaseGain;
            }
            if (options.useFoundation === true && nextProgress < realm.progressToNext && player.foundation > 0) {

                const foundationSpent = Math.min(player.foundation, gain * FOUNDATION_EXP_BONUS_MULTIPLIER, realm.progressToNext - nextProgress);
                if (foundationSpent > 0) {
                    player.foundation -= foundationSpent;
                    nextProgress += foundationSpent;
                    foundationChanged = true;
                }
            }
        }
        if (options.overflowToFoundation === true) {

            const overflow = canAdvanceRealm
                ? Math.max(0, gain - Math.max(0, nextProgress - realm.progress))
                : gain;
            if (overflow > 0) {
                const foundationGain = calculateOverflowFoundationGain(player, realm, overflow);
                if (foundationGain > 0) {
                    player.foundation += foundationGain;
                    foundationChanged = true;
                }
            }
        }
        if (options.trackCombatExp === true) {

            const combatExpGain = normalizeProgressionAmount(gain * normalizeCombatExpMultiplier(options.combatExpMultiplier));
            if (combatExpGain > 0) {
                player.combatExp += combatExpGain;
                combatExpChanged = true;
            }
        }

        const nextRealm = this.createRealmStateFromLevel(realm.realmLv, nextProgress);

        const realmChanged = nextRealm.progress !== realm.progress
            || nextRealm.breakthroughReady !== realm.breakthroughReady;

        const attrRecalculated = realmChanged
            ? this.applyResolvedRealmState(player, nextRealm, { bumpPersistentRevision: false })
            : false;

        const notices = !realm.breakthroughReady && nextRealm.breakthroughReady
            ? [{
                    text: `${nextRealm.displayName}修为已圆满，可以尝试突破。`,
                    kind: 'success',
                    structured: { key: 'notice.progression.realm-full', vars: { realmName: nextRealm.displayName }, pills: [{ key: 'realmName', style: 'target' }] },
                }]
            : [];

        const changed = realmChanged || foundationChanged || combatExpChanged;
        return {
            changed,
            panelDirty: !attrRecalculated && (foundationChanged || combatExpChanged),
            attrRecalculated,
            realmChanged,
            techniquesDirty: false,

            actionsDirty: nextRealm.breakthroughReady !== realm.breakthroughReady,
            notices,
        };
    }
    /**
 * resolveCultivatingTechnique：规范化或转换Cultivating功法。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新Cultivating功法相关状态。
 */

    resolveCultivatingTechnique(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const currentTechId = player.techniques.cultivatingTechId;
        if (!currentTechId) {
            return null;
        }
        return player.techniques.techniques.find((entry) => entry.techId === currentTechId) ?? null;
    }
    /**
 * resolveActiveCultivatingTechnique：规范化或转换激活Cultivating功法。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新激活Cultivating功法相关状态。
 */

    resolveActiveCultivatingTechnique(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const current = this.resolveCultivatingTechnique(player);
        if (!current) {
            const currentTechId = player.techniques.cultivatingTechId;
            if (currentTechId && (player.pendingTechniqueComprehensions ?? []).some((entry) => entry?.techId === currentTechId)) {
                return {
                    ...createEmptyMutation(),
                    technique: null,
                };
            }
            if (!player.techniques.cultivatingTechId) {
                return {
                    ...createEmptyMutation(),
                    technique: null,
                };
            }
            return {
                ...this.clearInvalidCultivation(player),
                technique: null,
            };
        }
        if (player.combat.autoSwitchCultivation === true && this.isTechniqueMaxed(current)) {

            const next = this.findNextCultivationTarget(player, current.techId);
            if (next) {
                player.techniques.cultivatingTechId = next.techId;
                this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
                const toName = next.name ?? next.techId;
                return {
                    changed: true,
                    panelDirty: false,
                    attrRecalculated: false,
                    techniquesDirty: true,
                    actionsDirty: true,
                    notices: [{
                            text: `${current.name ?? current.techId} 已圆满，主修已自动切换为 ${toName}。`,
                            kind: 'info',
                            structured: { key: 'notice.progression.technique-auto-switch', vars: { fromName: current.name ?? current.techId, toName }, pills: [{ key: 'fromName', style: 'skill' }, { key: 'toName', style: 'skill' }] },
                        }],
                    technique: next.kind === 'learned' ? next.technique : null,
                };
            }
        }
        return {
            ...createEmptyMutation(),
            technique: current,
        };
    }
    /**
 * clearInvalidCultivation：执行clearInvalidCultivation相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新clearInvalidCultivation相关状态。
 */

    clearInvalidCultivation(player) {
        player.techniques.cultivatingTechId = null;
        this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
        return {
            changed: true,
            panelDirty: false,
            attrRecalculated: false,
            techniquesDirty: true,
            actionsDirty: true,
            notices: [{
                    text: '当前主修功法不存在，已自动清空主修设置。',
                    kind: 'warn',
                    structured: { key: 'notice.progression.cultivation-cleared' },
                }],
        };
    }
    /**
 * findNextCultivatingTechnique：读取NextCultivating功法并返回结果。
 * @param player 玩家对象。
 * @param currentTechId currentTech ID。
 * @returns 无返回值，完成NextCultivating功法的读取/组装。
 */

    findNextCultivatingTechnique(player, currentTechId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const total = player.techniques.techniques.length;
        if (total <= 1) {
            return null;
        }

        const currentIndex = player.techniques.techniques.findIndex((entry) => entry.techId === currentTechId);
        for (let offset = 1; offset < total; offset += 1) {
            const candidate = player.techniques.techniques[(Math.max(0, currentIndex) + offset) % total];
            if (candidate && !this.isTechniqueMaxed(candidate)) {
                return candidate;
            }
        }
        return null;
    }
    findNextCultivationTarget(player, currentTechId) {
        const targets = [];
        for (const technique of player.techniques.techniques ?? []) {
            if (!technique || this.isTechniqueMaxed(technique)) {
                continue;
            }
            targets.push({
                kind: 'learned',
                techId: technique.techId,
                name: technique.name,
                technique,
            });
        }
        for (const pending of player.pendingTechniqueComprehensions ?? []) {
            if (!this.canSelfComprehendPendingTechnique(player, pending)) {
                continue;
            }
            targets.push({
                kind: 'pending',
                techId: pending.techId,
                name: pending.name,
                pending,
            });
        }
        if (targets.length === 0) {
            return null;
        }
        const currentIndex = targets.findIndex((entry) => entry.techId === currentTechId);
        const baseIndex = currentIndex >= 0 ? currentIndex : -1;
        for (let offset = 1; offset <= targets.length; offset += 1) {
            const candidate = targets[(baseIndex + offset) % targets.length];
            if (candidate?.techId !== currentTechId) {
                return candidate;
            }
        }
        return null;
    }
    /**
 * isTechniqueMaxed：判断功法Maxed是否满足条件。
 * @param technique 参数说明。
 * @returns 无返回值，完成功法Maxed的条件判断。
 */

    isTechniqueMaxed(technique) {

        const level = Math.max(1, Math.floor(technique.level ?? 1));

        const maxLevel = getTechniqueMaxLevel(technique.layers ?? undefined, level);
        return level >= maxLevel || (technique.expToNext ?? 0) <= 0;
    }
    /** 判断已学功法是否全部圆满。 */
    areAllTechniquesMaxed(player) {
        return player.techniques.techniques.length > 0
            && player.techniques.techniques.every((entry) => this.isTechniqueMaxed(entry));
    }
    /**
 * advanceTechniqueProgressInternal：执行advance功法进度Internal相关逻辑。
 * @param player 玩家对象。
 * @param amount 参数说明。
 * @returns 无返回值，直接更新advance功法进度Internal相关状态。
 */

    advanceTechniqueProgressInternal(player, amount, options: any = {}) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const pending = options.allowPendingComprehension === true
            ? this.resolveCultivatingPendingComprehension(player)
            : null;
        if (pending) {
            if (pending.selfComprehensionAllowed === false) {
                return this.clearInvalidCultivation(player);
            }
            return this.advancePendingTechniqueComprehensionInternal(player, pending, amount, options);
        }
        const resolved = this.resolveActiveCultivatingTechnique(player);
        if (!resolved.technique) {
            const switchedPending = options.allowPendingComprehension === true
                ? this.resolveCultivatingPendingComprehension(player)
                : null;
            if (switchedPending) {
                if (switchedPending.selfComprehensionAllowed === false) {
                    return mergeProgressionMutation(resolved, this.clearInvalidCultivation(player));
                }
                return mergeProgressionMutation(
                    resolved,
                    this.advancePendingTechniqueComprehensionInternal(player, switchedPending, amount, options),
                );
            }
            if (!player.techniques.cultivatingTechId && player.techniques.techniques.length > 0) {
                return this.advanceBodyTrainingProgressInternal(player, applyTechniqueRateBonus(amount, 1, options), resolved);
            }
            return resolved;
        }

        const technique = resolved.technique;
        const previousLevel = Math.max(1, Math.floor(technique.level ?? 1));

        const previousExp = Math.max(0, Math.floor(technique.exp ?? 0));

        const maxLevel = getTechniqueMaxLevel(technique.layers ?? undefined, previousLevel);
        if (previousLevel >= maxLevel || (technique.expToNext ?? 0) <= 0) {
            if (this.areAllTechniquesMaxed(player)) {
                return this.advanceBodyTrainingProgressInternal(player, applyTechniqueRateBonus(amount, 1, options), resolved);
            }
            return resolved;
        }

        const techniqueExpAdjustment = getTechniqueExpLevelAdjustment(player.realm?.realmLv, technique.realmLv);

        const normalized = applyTechniqueRateBonus(amount, techniqueExpAdjustment, options);
        if (normalized <= 0) {
            return resolved;
        }
        technique.level = previousLevel;
        technique.exp = previousExp + normalized;

        const notices = [...resolved.notices];

        let attrRecalculated = resolved.attrRecalculated;

        let actionsDirty = resolved.actionsDirty;
        while ((technique.expToNext ?? 0) > 0 && technique.exp >= (technique.expToNext ?? 0) && technique.level < maxLevel) {
            technique.exp -= technique.expToNext ?? 0;
            technique.level += 1;
            technique.expToNext = getTechniqueExpToNext(technique.level, technique.layers ?? undefined);
            technique.realm = deriveTechniqueRealm(technique.level, technique.layers ?? undefined);
            notices.push({
                text: (technique.expToNext ?? 0) > 0
                    ? `${technique.name ?? technique.techId} 提升至第 ${technique.level} 层。`
                    : `${technique.name ?? technique.techId} 已修至圆满。`,
                kind: 'success',
                structured: (technique.expToNext ?? 0) > 0
                    ? { key: 'notice.progression.technique-level-up', vars: { techName: technique.name ?? technique.techId, level: technique.level }, pills: [{ key: 'techName', style: 'skill' }, { key: 'level', style: 'damage' }] }
                    : { key: 'notice.progression.technique-perfected', vars: { techName: technique.name ?? technique.techId }, pills: [{ key: 'techName', style: 'skill' }] },
            });
            actionsDirty = true;
        }
        if (technique.level >= maxLevel && (technique.expToNext ?? 0) <= 0) {
            technique.exp = 0;
            technique.realm = TechniqueRealm.Perfection;
        }
        if (technique.level === previousLevel && technique.exp === previousExp) {
            return resolved;
        }
        this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
        if (technique.level !== previousLevel) {
            attrRecalculated = this.playerAttributesService.recalculate(player) || attrRecalculated;
        }

        let mutation = {
            changed: true,
            panelDirty: false,
            attrRecalculated,
            techniquesDirty: true,
            actionsDirty,
            notices,
        };
        if (technique.level >= maxLevel && player.combat.autoSwitchCultivation === true) {

            const switched = this.resolveActiveCultivatingTechnique(player);
            if (switched.technique?.techId !== technique.techId) {
                mutation = mergeProgressionMutation(mutation, switched);
            }
        }
        return mutation;
    }
    resolveCultivatingPendingComprehension(player) {
        const techId = player.techniques?.cultivatingTechId;
        if (!techId) {
            return null;
        }
        return (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === techId) ?? null;
    }
    canSelfComprehendPendingTechnique(player, pending) {
        if (!pending?.techId || pending.selfComprehensionAllowed === false || pending.activeTransferJob) {
            return false;
        }
        if (player?.transmissionJob?.techniqueId === pending.techId && Number(player.transmissionJob?.remainingTicks) > 0) {
            return false;
        }
        const requiredProgress = Math.max(1, Number(pending.requiredProgress) || 1);
        const progress = Math.max(0, Number(pending.progress) || 0);
        return progress < requiredProgress;
    }
    advancePendingTechniqueComprehensionInternal(player, pending, amount, options: any = {}) {
        const resolved = createEmptyMutation();
        if (pending.activeTransferJob
            || pending.selfComprehensionAllowed === false
            || (player.transmissionJob?.techniqueId === pending.techId && Number(player.transmissionJob?.remainingTicks) > 0)) {
            return resolved;
        }
        const baseProgress = Object.prototype.hasOwnProperty.call(options ?? {}, 'pendingComprehensionTicks')
            ? normalizeProgressionAmount(options.pendingComprehensionTicks)
            : normalizeProgressionAmount(amount);
        const normalized = calculateTechniqueComprehensionProgressGain({
            baseProgress,
            techniqueRealmLv: pending.realmLv,
            learnerRealmLv: player.realm?.realmLv ?? 1,
            learnerTransmissionLevel: player.transmissionSkill?.level ?? 1,
        });
        if (normalized <= 0) {
            return resolved;
        }
        const pendingTechnique = this.contentTemplateRepository.createTechniqueState(pending.techId);
        if (pendingTechnique) {
            const sourceKind = pending.sourceKind === 'created' || isCreatedTechniqueId(pending.techId) ? 'created' : 'normal';
            pending.sourceKind = sourceKind;
            pending.requiredProgress = calculateTechniqueComprehensionRequiredProgress({
                sourceKind,
                techniqueRealmLv: pendingTechnique.realmLv,
                grade: pendingTechnique.grade,
                learnerRealmLv: player.realm?.realmLv ?? 1,
            });
            pending.realmLv = Math.max(1, Math.floor(Number(pendingTechnique.realmLv) || 1));
            pending.grade = pendingTechnique.grade ?? pending.grade;
            pending.category = pendingTechnique.category ?? pending.category;
            pending.name = pendingTechnique.name ?? pending.name ?? pending.techId;
        }
        const previousProgress = Math.max(0, Number(pending.progress) || 0);
        const requiredProgress = Math.max(1, Number(pending.requiredProgress) || 1);
        pending.progress = Math.min(requiredProgress, previousProgress + normalized);
        pending.updatedAtTick = Math.max(0, Math.floor(Number(player.lifeElapsedTicks) || 0));
        const progressedTicks = Math.max(0, baseProgress);
        const transmissionSkillDirty = applyTransmissionSkillExpFromTicks(
            player,
            progressedTicks,
            pending.realmLv,
            (level) => this.getRealmRuntimeExpToNext(level),
        );
        if (pending.progress < requiredProgress) {
            return {
                changed: true,
                panelDirty: false,
                attrRecalculated: false,
                techniquesDirty: true,
                professionDirty: transmissionSkillDirty,
                actionsDirty: false,
                notices: [],
            };
        }
        const technique = this.contentTemplateRepository.createTechniqueState(pending.techId);
        if (!technique) {
            return {
                changed: true,
                panelDirty: false,
                attrRecalculated: false,
                techniquesDirty: true,
                professionDirty: transmissionSkillDirty,
                actionsDirty: false,
                notices: [{
                    text: `功法 ${pending.name ?? pending.techId} 已无法找到，领悟进度保留。`,
                    kind: 'warn',
                    structured: { key: 'notice.progression.technique-comprehension-template-missing', vars: { techName: pending.name ?? pending.techId }, pills: [{ key: 'techName', style: 'skill' }] },
                }],
            };
        }
        const learnedEntry = toTechniqueUpdateEntryLocal(technique);
        if (!player.techniques.techniques.some((entry) => entry.techId === learnedEntry.techId)) {
            player.techniques.techniques.push(learnedEntry);
            player.techniques.techniques.sort((left, right) => (left.realmLv ?? 0) - (right.realmLv ?? 0) || left.techId.localeCompare(right.techId, 'zh-Hans-CN'));
        }
        player.pendingTechniqueComprehensions = (player.pendingTechniqueComprehensions ?? []).filter((entry) => entry?.techId !== pending.techId);
        const attrRecalculated = this.playerAttributesService.recalculate(player);
        this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
        let mutation = {
            changed: true,
            panelDirty: false,
            attrRecalculated,
            techniquesDirty: true,
            professionDirty: transmissionSkillDirty,
            actionsDirty: true,
            notices: [{
                text: `${pending.name ?? pending.techId} 已领悟完成。`,
                kind: 'success',
                structured: { key: 'notice.progression.technique-comprehension-complete', vars: { techName: pending.name ?? pending.techId }, pills: [{ key: 'techName', style: 'skill' }] },
            }],
        };
        if (player.combat.autoSwitchCultivation === true) {
            const switched = this.resolveActiveCultivatingTechnique(player);
            if (switched.technique?.techId !== learnedEntry.techId || player.techniques.cultivatingTechId !== learnedEntry.techId) {
                mutation = mergeProgressionMutation(mutation, switched);
            }
        }
        return mutation;
    }
    /** 将无主修或全圆满后的功法经验转入炼体。 */
    advanceBodyTrainingProgressInternal(player, amount, resolved) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return resolved;
        }
        const bodyTraining = normalizeBodyTrainingState(player.bodyTraining);
        const previousLevel = bodyTraining.level;
        const previousExp = bodyTraining.exp;
        const notices = [...resolved.notices];
        bodyTraining.exp += normalized;
        while (bodyTraining.expToNext > 0 && bodyTraining.exp >= bodyTraining.expToNext) {
            bodyTraining.exp -= bodyTraining.expToNext;
            bodyTraining.level += 1;
            bodyTraining.expToNext = getBodyTrainingExpToNext(bodyTraining.level);
            notices.push({
                text: `炼体突破至第 ${bodyTraining.level} 层，全属性提升 1%。`,
                kind: 'success',
                structured: { key: 'notice.progression.body-training-level-up', vars: { level: bodyTraining.level }, pills: [{ key: 'level', style: 'damage' }] },
            });
        }
        player.bodyTraining = bodyTraining;
        if (bodyTraining.level === previousLevel && bodyTraining.exp === previousExp) {
            return resolved;
        }
        this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
        let attrRecalculated = resolved.attrRecalculated;
        if (bodyTraining.level !== previousLevel) {
            attrRecalculated = this.playerAttributesService.recalculate(player) || attrRecalculated;
        }
        return {
            changed: true,
            panelDirty: !attrRecalculated,
            attrRecalculated,
            techniquesDirty: true,
            bodyTrainingDirty: true,
            actionsDirty: resolved.actionsDirty || bodyTraining.level !== previousLevel,
            notices,
        };
    }

    /**
 * getRealmCombatExp：读取Realm战斗Exp。
 * @param monsterLevel 参数说明。
 * @param playerRealmLv 参数说明。
 * @param monsterTier 参数说明。
 * @param expMultiplier 参数说明。
 * @param contributionRatio 参数说明。
 * @returns 无返回值，完成Realm战斗Exp的读取/组装。
 */

    getRealmCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        const level = Math.max(1, Math.floor(monsterLevel));

        const expToNext = this.getRealmRuntimeExpToNext(level);
        if (expToNext <= 0) {
            return 0;
        }

        const levelAdjustment = getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
        const monsterLevelDecay = getMonsterLevelExpDecayMultiplier(level);
        return expToNext
            * Math.max(0, expMultiplier)
            * levelAdjustment
            * monsterLevelDecay
            * clamp(contributionRatio, 0, 1)
            / 1000;
    }
    /**
 * getTechniqueCombatExp：读取功法战斗Exp。
 * @param monsterLevel 参数说明。
 * @param playerRealmLv 参数说明。
 * @param monsterTier 参数说明。
 * @param expMultiplier 参数说明。
 * @param contributionRatio 参数说明。
 * @returns 无返回值，完成功法战斗Exp的读取/组装。
 */

    getTechniqueCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


        return this.getRealmCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier, contributionRatio);
    }
    /**
 * finalizeProgressionMutation：执行finalize修炼进度Mutation相关逻辑。
 * @param player 玩家对象。
 * @param mutation 参数说明。
 * @returns 无返回值，直接更新finalize修炼进度Mutation相关状态。
 */

    finalizeProgressionMutation(player, mutation) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!mutation.changed) {
            return;
        }
        if (mutation.panelDirty && !mutation.attrRecalculated) {
            this.playerAttributesService.markPanelDirty(player);
        }
        if (mutation.techniquesDirty) {
            player.techniques.revision += 1;
        }
        player.persistentRevision += 1;
    }
    /**
 * finalizePresentationMutation：执行finalizePresentationMutation相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新finalizePresentationMutation相关状态。
 */

    finalizePresentationMutation(player) {
        player.persistentRevision += 1;
    }
    applyHeavenGateResetState(player, realm, averageBonus, preserveUnlocked = false) {
        const heavenGate = normalizeHeavenGateState(player.heavenGate);
        player.heavenGate = {
            unlocked: (preserveUnlocked && heavenGate?.unlocked === true) || this.hasReachedHeavenGateRealm(realm.realmLv),
            severed: [],
            roots: null,
            entered: false,
            averageBonus: Math.max(0, Math.floor(Number(averageBonus) || 0)),
        };
        player.spiritualRoots = null;
        this.applyResolvedRealmState(player, realm, { forceAttrRecalculate: true });
        player.hp = Math.min(player.maxHp, Math.max(1, player.hp));
        player.qi = Math.min(Math.round(player.maxQi ?? player.qi), Math.max(0, player.qi));
        player.dead = false;
        // 复活/重置并 clamp hp/qi 后显式 bump selfRevision，确保客户端收到 hp/qi/dead 更新
        // （applyResolvedRealmState 仅在 recalculate 且 attrs 真变时 bump，复活场景可能不 bump，导致 HUD 仍显示死亡/旧值）。
        player.selfRevision += 1;
    }
};
/**
 * resolveStageForRealmLevel：规范化或转换StageForRealm等级。
 * @param realmLv 参数说明。
 * @returns 无返回值，直接更新StageForRealm等级相关状态。
 */

function resolveStageForRealmLevel(realmLv) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedRealmLv = Math.max(1, Math.floor(Number(realmLv) || 1));
    for (let index = PLAYER_REALM_ORDER.length - 1; index >= 0; index -= 1) {
        const stage = PLAYER_REALM_ORDER[index];
        const range = PLAYER_REALM_STAGE_LEVEL_RANGES[stage];
        if (range && normalizedRealmLv >= range.levelFrom) {
            return stage;
        }
    }
    return DEFAULT_PLAYER_REALM_STAGE;
}
/**
 * resolveRealmLevelFromStage：规范化或转换Realm等级FromStage。
 * @param stage 参数说明。
 * @returns 无返回值，直接更新Realm等级FromStage相关状态。
 */

function resolveRealmLevelFromStage(stage) {
    return PLAYER_REALM_STAGE_LEVEL_RANGES[stage]?.levelFrom ?? 1;
}
/**
 * formatTechniqueRealmLabel：规范化或转换功法RealmLabel。
 * @param value 参数说明。
 * @returns 无返回值，直接更新功法RealmLabel相关状态。
 */

function formatTechniqueRealmLabel(value) {
    switch (value) {
        case TechniqueRealm.Perfection:
            return '圆满';
        case TechniqueRealm.Major:
            return '大成';
        case TechniqueRealm.Minor:
            return '小成';
        case TechniqueRealm.Entry:
        default:
            return '入门';
    }
}
/**
 * createEmptyMutation：构建并返回目标对象。
 * @returns 无返回值，直接更新EmptyMutation相关状态。
 */

function createEmptyMutation() {
    return {
        changed: false,
        panelDirty: false,
        attrRecalculated: false,
        techniquesDirty: false,
        bodyTrainingDirty: false,
        professionDirty: false,
        actionsDirty: false,
        notices: [],
    };
}

function describeProgressionDirtyDomains(mutation) {
    if (!mutation?.changed) {
        return [];
    }
    const domains = ['progression'];
    // realm_payload 存储在 player_attr_state 表中，realm progress 变化时必须标记 'attr' dirty
    if (mutation.attrRecalculated || mutation.realmChanged) {
        domains.push('attr');
    }
    if (mutation.techniquesDirty) {
        domains.push('technique');
    }
    if (mutation.bodyTrainingDirty) {
        domains.push('body_training');
    }
    if (mutation.professionDirty) {
        domains.push('profession');
    }
    return domains;
}

function toProgressionMutationResult(mutation) {
    return {
        changed: mutation?.changed === true,
        notices: Array.isArray(mutation?.notices) ? mutation.notices : [],
        actionsDirty: mutation?.actionsDirty === true,
        dirtyDomains: describeProgressionDirtyDomains(mutation),
    };
}
/**
 * mergeProgressionMutation：处理修炼进度Mutation并更新相关状态。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，直接更新修炼进度Mutation相关状态。
 */

function mergeProgressionMutation(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!left.changed && left.notices.length === 0) {
        return right;
    }
    if (!right.changed && right.notices.length === 0) {
        return left;
    }
    return {
        changed: left.changed || right.changed,
        panelDirty: left.panelDirty || right.panelDirty,
        attrRecalculated: left.attrRecalculated || right.attrRecalculated,
        realmChanged: left.realmChanged || right.realmChanged,
        techniquesDirty: left.techniquesDirty || right.techniquesDirty,
        bodyTrainingDirty: left.bodyTrainingDirty || right.bodyTrainingDirty,
        professionDirty: left.professionDirty || right.professionDirty,
        actionsDirty: left.actionsDirty || right.actionsDirty,

        notices: left.notices.length === 0
            ? right.notices
            : right.notices.length === 0
                ? left.notices
                : [...left.notices, ...right.notices],
    };
}
/**
 * applyRateBonus：处理RateBonu并更新相关状态。
 * @param baseGain 参数说明。
 * @param bonusRateBp 参数说明。
 * @param minimumGain 参数说明。
 * @returns 无返回值，直接更新RateBonu相关状态。
 */

function applyRateBonus(baseGain, bonusRateBp, minimumGain = 1) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalizedBaseGain = Number(baseGain);
    if (!Number.isFinite(normalizedBaseGain) || normalizedBaseGain <= 0) {
        return 0;
    }

    const normalizedBonusRate = Number.isFinite(bonusRateBp)
        ? Math.max(0, Number(bonusRateBp)) / 10000
        : 0;

    const exactGain = Math.max(minimumGain, normalizedBaseGain * (1 + normalizedBonusRate));

    const guaranteed = Math.floor(exactGain);

    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
        return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
}

function applyTechniqueRateBonus(baseGain, levelAdjustment = 1, options: any = {}) {
    const normalizedBaseGain = Number(baseGain);
    if (!Number.isFinite(normalizedBaseGain) || normalizedBaseGain <= 0) {
        return 0;
    }
    const normalizedLevelAdjustment = Number.isFinite(levelAdjustment)
        ? Math.max(0, Number(levelAdjustment))
        : 1;
    const adjustedGain = normalizedBaseGain * normalizedLevelAdjustment;
    if (adjustedGain <= 0) {
        return 0;
    }
    if (options && Object.prototype.hasOwnProperty.call(options, 'expBonus')) {
        return applyRateBonus(adjustedGain, options.expBonus, options.minimumGain ?? 1);
    }
    return normalizeProgressionAmount(adjustedGain);
}

function applyTransmissionSkillExpFromTicks(player, elapsedTicks, targetLevel, getExpToNextByLevel) {
    const skill = player?.transmissionSkill;
    if (!skill) {
        return false;
    }
    const gain = computeCraftSkillExpGain({
        skillLevel: skill.level,
        targetLevel: Math.max(1, Math.floor(Number(targetLevel) || 1)),
        baseActionTicks: elapsedTicks,
        getExpToNextByLevel,
        successCount: 1,
        failureCount: 0,
        successMultiplier: 1,
    }).finalGain;
    return applyCraftSkillExpLocal(skill, gain, getExpToNextByLevel);
}

function applyCraftSkillExpLocal(skill, amount, getExpToNextByLevel) {
    if (!skill) {
        return false;
    }
    let changed = false;
    const resolvedExpToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
    if (skill.expToNext !== resolvedExpToNext) {
        skill.expToNext = resolvedExpToNext;
        changed = true;
    }
    const gain = Math.max(0, Math.floor(Number(amount) || 0));
    if (gain <= 0) {
        return changed;
    }
    skill.exp += gain;
    while (skill.expToNext > 0 && skill.exp >= skill.expToNext) {
        skill.exp -= skill.expToNext;
        skill.level += 1;
        skill.expToNext = Math.max(0, Math.floor(Number(getExpToNextByLevel(skill.level)) || 0));
        changed = true;
    }
    return changed || gain > 0;
}

function normalizeCultivationAuraMultiplier(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return 1;
    }
    return normalized;
}

function capSingleCombatRealmExpGain(realm, gain) {
    const normalizedGain = normalizeProgressionAmount(gain);
    const progressToNext = Math.max(0, Math.floor(realm?.progressToNext ?? 0));
    if (normalizedGain <= 0 || progressToNext <= 0) {
        return normalizedGain;
    }
    return Math.min(normalizedGain, progressToNext * SINGLE_COMBAT_REALM_EXP_CAP_MULTIPLIER);
}

function calculateOverflowFoundationGain(player, realm, amount) {
    const normalized = normalizeProgressionAmount(amount);
    if (normalized <= 0) {
        return 0;
    }
    const referenceProgress = normalizeProgressionAmount(realm?.progressToNext);
    if (referenceProgress <= 0) {
        return normalized;
    }
    const currentFoundation = normalizeProgressionAmount(player?.foundation);
    const decayRate = Math.log(2) / (referenceProgress * 10);
    const decaySeed = Math.exp(-decayRate * currentFoundation);
    return rollFractionalGain(Math.log1p(decayRate * normalized * decaySeed) / decayRate);
}

function rollFractionalGain(value) {
    if (!Number.isFinite(value) || value <= 0) {
        return 0;
    }
    const guaranteed = Math.floor(value);
    const remainder = value - guaranteed;
    if (remainder <= 0) {
        return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
}
/**
 * getMonsterKillRealmExpAdjustment：读取怪物KillRealmExpAdjustment。
 * @param playerRealmLv 参数说明。
 * @param monsterLevel 参数说明。
 * @param monsterTier 参数说明。
 * @returns 无返回值，完成怪物KillRealmExpAdjustment的读取/组装。
 */

function getMonsterKillRealmExpAdjustment(playerRealmLv, monsterLevel, monsterTier) {
    return getMonsterKillExpLevelAdjustment(playerRealmLv, monsterLevel, monsterTier);
}
/**
 * snapshotCultivatingTechnique：执行快照Cultivating功法相关逻辑。
 * @param player 玩家对象。
 * @returns 无返回值，直接更新快照Cultivating功法相关状态。
 */

function snapshotCultivatingTechnique(player) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const techId = player.techniques.cultivatingTechId;
    if (!techId) {
        return {
            techId: null,
            name: null,
            kind: 'none',
            level: 0,
            exp: 0,
        };
    }

    const technique = player.techniques.techniques.find((entry) => entry.techId === techId);
    const pending = technique ? null : (player.pendingTechniqueComprehensions ?? []).find((entry) => entry?.techId === techId);
    if (pending) {
        return {
            techId,
            name: pending.name ?? techId,
            kind: 'comprehension',
            level: 0,
            exp: Math.max(0, Number(pending.progress) || 0),
        };
    }
    return {
        techId,
        kind: 'technique',
        name: technique?.name ?? techId,
        level: Math.max(0, Math.floor(technique?.level ?? 0)),
        exp: Math.max(0, Math.floor(technique?.exp ?? 0)),
    };
}

function toTechniqueUpdateEntryLocal(technique) {
    return {
        techId: technique.techId,
        level: technique.level,
        exp: technique.exp,
        expToNext: technique.expToNext,
        realmLv: technique.realmLv,
        realm: technique.realm ?? TechniqueRealm.Entry,
        skillsEnabled: technique.skillsEnabled !== false,
        name: technique.name,
        grade: technique.grade ?? null,
        category: technique.category ?? null,
        skills: technique.skills,
        layers: technique.layers ?? null,
    };
}
/**
 * calculateRealmProgressGain：执行Realm进度Gain相关逻辑。
 * @param previousRealmLv 参数说明。
 * @param previousProgress 参数说明。
 * @param currentRealm 参数说明。
 * @returns 无返回值，直接更新Realm进度Gain相关状态。
 */

function calculateRealmProgressGain(previousRealmLv, previousProgress, currentRealm) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!currentRealm) {
        return 0;
    }
    if (currentRealm.realmLv !== previousRealmLv) {
        return Math.max(0, currentRealm.progress);
    }
    return Math.max(0, currentRealm.progress - previousProgress);
}
/**
 * calculateTechniqueGain：执行功法Gain相关逻辑。
 * @param previous 参数说明。
 * @param current 参数说明。
 * @returns 无返回值，直接更新功法Gain相关状态。
 */

function calculateTechniqueGain(previous, current) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!previous.techId || previous.techId !== current.techId) {
        return {
            name: current.name,
            gained: 0,
        };
    }
    if (current.level !== previous.level) {
        return {
            name: current.name,
            gained: 0,
        };
    }
    return {
        name: current.name,
        kind: current.kind,
        gained: Math.max(0, current.exp - previous.exp),
    };
}

function formatProgressionGainAmount(value) {
    const normalized = Number(value);
    if (!Number.isFinite(normalized) || normalized <= 0) {
        return '0';
    }
    if (Number.isInteger(normalized)) {
        return String(normalized);
    }
    return normalized.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}
/**
 * createEmptyRoots：构建并返回目标对象。
 * @returns 无返回值，直接更新Empty根容器相关状态。
 */

function createEmptyRoots() {
    return {
        metal: 0,
        wood: 0,
        water: 0,
        fire: 0,
        earth: 0,
    };
}

function createSpiritualRootSeedRoots(tier) {
    const roots = createEmptyRoots();
    if (tier === 'divine') {
        for (const element of ELEMENT_KEYS) {
            roots[element] = 100;
        }
        return roots;
    }

    let promoted = false;
    for (const element of ELEMENT_KEYS) {
        const value = Math.random() < 0.5 ? 100 : 99;
        roots[element] = value;
        promoted = promoted || value === 100;
    }
    if (!promoted) {
        roots[ELEMENT_KEYS[Math.floor(Math.random() * ELEMENT_KEYS.length)]] = 100;
    }
    return roots;
}

function getHeavenGateRerollCount(averageBonus) {
    return Math.max(0, Math.floor(Math.max(0, Number(averageBonus) || 0) / HEAVEN_GATE_REROLL_AVERAGE_BONUS));
}

function getHeavenGateAverageBonusFromRerollCount(rerollCount) {
    return Math.max(0, Math.floor(Number(rerollCount) || 0)) * HEAVEN_GATE_REROLL_AVERAGE_BONUS;
}
/**
 * cloneHeavenGateRoots：构建HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function cloneHeavenGateRoots(roots) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!roots) {
        return null;
    }
    return {
        metal: clamp(normalizePositiveInt(roots.metal, 0), 0, 100),
        wood: clamp(normalizePositiveInt(roots.wood, 0), 0, 100),
        water: clamp(normalizePositiveInt(roots.water, 0), 0, 100),
        fire: clamp(normalizePositiveInt(roots.fire, 0), 0, 100),
        earth: clamp(normalizePositiveInt(roots.earth, 0), 0, 100),
    };
}
/**
 * normalizeHeavenGateRoots：规范化或转换HeavenGate根容器。
 * @param roots 参数说明。
 * @returns 无返回值，直接更新HeavenGate根容器相关状态。
 */

function normalizeHeavenGateRoots(roots) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    const normalized = cloneHeavenGateRoots(roots);
    if (!normalized) {
        return null;
    }
    return ELEMENT_KEYS.some((element) => normalized[element] > 0) ? normalized : null;
}
/**
 * normalizeHeavenGateState：规范化或转换HeavenGate状态。
 * @param state 状态对象。
 * @returns 无返回值，直接更新HeavenGate状态相关状态。
 */

function normalizeHeavenGateState(state) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!state) {
        return null;
    }

    const severed = state.severed
        .filter((element) => ELEMENT_KEYS.includes(element))
        .slice(0, HEAVEN_GATE_MAX_SEVERED);

    const roots = normalizeHeavenGateRoots(state.roots);

    const entered = state.entered === true;

    const averageBonus = Math.max(0, Math.floor(Number(state.averageBonus) || 0));

    const unlocked = state.unlocked === true || entered || roots !== null || severed.length > 0;
    if (!unlocked && severed.length === 0 && roots === null) {
        return null;
    }
    return {
        unlocked,
        severed,
        roots,
        entered,
        averageBonus,
    };
}
/**
 * getInventoryCount：读取背包数量。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @returns 无返回值，完成背包数量的读取/组装。
 */

function getInventoryCount(player, itemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。


    let total = 0;
    for (const entry of player.inventory.items) {
        if (entry.itemId === itemId) {
            total += Math.max(0, Math.trunc(Number(entry.count ?? 0) || 0));
        }
    }
    return total;
}

function hasInventoryItemCountAtLeast(player, itemId, requiredCount) {
    return getInventoryCount(player, itemId) >= Math.max(1, Math.floor(Number(requiredCount) || 1));
}

function getMissingBreakthroughItemRequirements(player, items) {
    const requirements = new Map();
    for (const item of items ?? []) {
        const itemId = typeof item?.itemId === 'string' ? item.itemId : '';
        if (!itemId) {
            continue;
        }
        const requiredCount = Math.max(1, Math.floor(Number(item.count) || 1));
        requirements.set(itemId, (requirements.get(itemId) ?? 0) + requiredCount);
    }
    const missingItems = [];
    for (const [itemId, requiredCount] of requirements.entries()) {
        const ownedCount = getInventoryCount(player, itemId);
        const missingCount = Math.max(0, requiredCount - ownedCount);
        if (missingCount <= 0) {
            continue;
        }
        missingItems.push({
            itemId,
            count: requiredCount,
            ownedCount,
            missingCount,
        });
    }
    return missingItems;
}

function buildPathSeveredBreakthroughRequirement(realmLv) {
    return {
        id: `realm_${realmLv}_path_severed`,
        type: 'root',
        label: PATH_SEVERED_BREAKTHROUGH_LABEL,
        completed: false,
        hidden: false,
        blocksBreakthrough: true,
        detail: PATH_SEVERED_BREAKTHROUGH_REASON,
    };
}

function getBreakthroughRequirementIncreasePct(requirement) {
    if (requirement.type !== 'item' && requirement.type !== 'technique') {
        return 0;
    }
    return Math.max(0, Math.floor(Number(requirement.increasePct ?? 0) || 0));
}

function isOptionalBreakthroughRequirementIncreaser(requirement) {
    return requirement.type === 'technique' && getBreakthroughRequirementIncreasePct(requirement) > 0;
}

function doesBreakthroughRequirementBlock(requirement) {
    return !isOptionalBreakthroughRequirementIncreaser(requirement);
}

function getEffectiveAttributeRequirement(baseValue, increaseMultiplier) {
    return Math.max(1, Math.ceil(Math.max(1, Math.floor(Number(baseValue) || 1)) * Math.max(1, increaseMultiplier)));
}

function isBreakthroughRequirementCompleted(player, requirement, increaseMultiplier = 1) {
    if (requirement.type === 'item') {
        return hasInventoryItemCountAtLeast(player, requirement.itemId, requirement.count);
    }
    if (requirement.type === 'technique') {
        return isTechniqueRequirementCompleted(player, requirement);
    }
    if (requirement.type === 'attribute_total') {
        return getPlayerTotalAttributes(player) >= getEffectiveAttributeRequirement(requirement.minTotalValue, increaseMultiplier);
    }
    if (requirement.type === 'root') {
        return getMaxSpiritualRootValue(player) >= requirement.minValue;
    }
    return false;
}

function normalizeBreakthroughTransition(entry) {
    const fromRealmLv = normalizePositiveInt(entry?.fromRealmLv, 0);
    const toRealmLv = normalizePositiveInt(entry?.toRealmLv, 0);
    if (fromRealmLv <= 0 || toRealmLv <= fromRealmLv) {
        return null;
    }
    const requirements = [];
    for (const rawRequirement of entry?.requirements ?? []) {
        const requirement = normalizeBreakthroughRequirement(rawRequirement);
        if (requirement) {
            requirements.push(requirement);
        }
    }
    const rootFoundationItems = [];
    for (const rawItem of entry?.rootFoundationItems ?? []) {
        const item = normalizeBreakthroughItemRequirement(rawItem);
        if (item) {
            rootFoundationItems.push(item);
        }
    }
    return {
        fromRealmLv,
        toRealmLv,
        title: typeof entry?.title === 'string' && entry.title.trim() ? entry.title.trim() : undefined,
        rootFoundationItems,
        requirements,
    };
}

function normalizeBreakthroughItemRequirement(raw) {
    const itemId = typeof raw?.itemId === 'string' && raw.itemId.trim() ? raw.itemId.trim() : '';
    const count = normalizePositiveInt(raw?.count, 0);
    if (!itemId || count <= 0) {
        return null;
    }
    return { itemId, count };
}

function normalizeBreakthroughRequirement(raw) {
    const id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : '';
    const label = typeof raw?.label === 'string' && raw.label.trim() ? raw.label.trim() : undefined;
    const increasePct = normalizePositiveInt(raw?.increaseAttrRequirementPct, 0);
    if (!id) {
        return null;
    }
    if (raw?.type === 'item') {
        const itemId = typeof raw.itemId === 'string' && raw.itemId.trim() ? raw.itemId.trim() : '';
        const count = normalizePositiveInt(raw.count, 0);
        if (!itemId || count <= 0) {
            return null;
        }
        return { id, type: 'item', itemId, count, label, increasePct };
    }
    if (raw?.type === 'technique') {
        const minLevel = normalizePositiveInt(raw.minLevel, 0);
        const count = Math.max(1, normalizePositiveInt(raw.count, 1));
        const minGrade = normalizeTechniqueGrade(raw.minGrade);
        const minRealm = normalizeTechniqueRealm(raw.minRealm);
        return { id, type: 'technique', minGrade, minLevel, minRealm, count, label, increasePct };
    }
    if (raw?.type === 'attribute_total') {
        const minTotalValue = normalizePositiveInt(raw.minTotalValue, 0);
        return minTotalValue > 0 ? { id, type: 'attribute_total', minTotalValue, label } : null;
    }
    if (raw?.type === 'root') {
        const minValue = normalizePositiveInt(raw.minValue, 0);
        return minValue > 0 ? { id, type: 'root', minValue, label } : null;
    }
    return null;
}

function getBreakthroughItemRequirements(transition) {
    return transition.rootFoundationItems ?? [];
}

function isTechniqueRequirementCompleted(player, requirement) {
    let matchedCount = 0;
    for (const technique of player.techniques.techniques) {
        const level = Math.max(0, Math.floor(Number(technique.level ?? 0) || 0));
        if (requirement.minLevel > 0 && level < requirement.minLevel) {
            continue;
        }
        const realm = technique.realm ?? TechniqueRealm.Entry;
        if (requirement.minRealm !== undefined && realm < requirement.minRealm) {
            continue;
        }
        if (requirement.minGrade && compareTechniqueGrade(technique.grade, requirement.minGrade) < 0) {
            continue;
        }
        matchedCount += 1;
        if (matchedCount >= requirement.count) {
            return true;
        }
    }
    return false;
}

function getPlayerTotalAttributes(player) {
    const attrs = player.attrs?.finalAttrs ?? player.attrs?.baseAttrs ?? player.attrs?.rawBaseAttrs;
    if (!attrs) {
        return 0;
    }
    let total = 0;
    for (const key of ATTR_KEYS) {
        const value = Number(attrs[key]);
        if (Number.isFinite(value)) {
            total += Math.floor(value);
        }
    }
    return total;
}

function getRootFoundationCap(realmLv) {
    const normalized = Math.max(1, Math.floor(Number(realmLv) || 1));
    return Math.floor((normalized * (normalized + 1)) / 2);
}

function getMaxSpiritualRootValue(player) {
    const roots = normalizeHeavenGateRoots(player.spiritualRoots);
    if (!roots) {
        return 0;
    }
    let maxValue = 0;
    for (const element of ELEMENT_KEYS) {
        maxValue = Math.max(maxValue, roots[element]);
    }
    return maxValue;
}

function formatTechniqueRequirementLabel(requirement) {
    const parts = [];
    if (requirement.minGrade) {
        parts.push(`${formatTechniqueGradeLabel(requirement.minGrade)}功法`);
    }
    else {
        parts.push('功法');
    }
    if (requirement.minLevel > 0) {
        parts.push(`修至 ${requirement.minLevel} 级`);
    }
    if (requirement.minRealm !== undefined) {
        parts.push(`功法境界达到${formatTechniqueRealmLabel(requirement.minRealm)}`);
    }
    return `至少有 ${requirement.count} 门${parts.join('，')}`;
}

function normalizeTechniqueGrade(value) {
    if (typeof value !== 'string') {
        return undefined;
    }
    const grade = value.trim();
    return TECHNIQUE_GRADE_ORDER.includes(grade) ? grade : undefined;
}

function compareTechniqueGrade(value, minimum) {
    const grade = normalizeTechniqueGrade(value) ?? 'mortal';
    return TECHNIQUE_GRADE_ORDER.indexOf(grade) - TECHNIQUE_GRADE_ORDER.indexOf(minimum);
}

function formatTechniqueGradeLabel(value) {
    switch (value) {
        case 'yellow':
            return '黄阶';
        case 'mystic':
            return '玄阶';
        case 'earth':
            return '地阶';
        case 'heaven':
            return '天阶';
        case 'spirit':
            return '灵阶';
        case 'saint':
            return '圣阶';
        case 'emperor':
            return '帝阶';
        case 'mortal':
        default:
            return '凡阶';
    }
}

function normalizeTechniqueRealm(value) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return clamp(Math.floor(value), TechniqueRealm.Entry, TechniqueRealm.Perfection);
    }
    switch (value) {
        case 'Minor':
        case 'minor':
            return TechniqueRealm.Minor;
        case 'Major':
        case 'major':
            return TechniqueRealm.Major;
        case 'Perfection':
        case 'perfection':
            return TechniqueRealm.Perfection;
        case 'Entry':
        case 'entry':
            return TechniqueRealm.Entry;
        default:
            return undefined;
    }
}
/**
 * normalizePositiveInt：规范化或转换PositiveInt。
 * @param value 参数说明。
 * @param fallback 参数说明。
 * @returns 无返回值，直接更新PositiveInt相关状态。
 */

function normalizePositiveInt(value, fallback) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}
/**
 * normalizeProgressionAmount：规范化或转换修炼进度数量。
 * @param value 参数说明。
 * @returns 无返回值，直接更新修炼进度数量相关状态。
 */

function normalizeProgressionAmount(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}
/**
 * normalizeProgressionTicks：规范化或转换修炼进度tick。
 * @param value 参数说明。
 * @returns 无返回值，直接更新修炼进度tick相关状态。
 */

function normalizeProgressionTicks(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
/**
 * normalizeCombatExpMultiplier：规范化或转换战斗ExpMultiplier。
 * @param value 参数说明。
 * @returns 无返回值，直接更新战斗ExpMultiplier相关状态。
 */

function normalizeCombatExpMultiplier(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}

/**
 * normalizeNullablePositiveInt：规范化或转换NullablePositiveInt。
 * @param value 参数说明。
 * @returns 无返回值，直接更新NullablePositiveInt相关状态。
 */

function normalizeNullablePositiveInt(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}
/**
 * isSameHeavenGateRoots：判断SameHeavenGate根容器是否满足条件。
 * @param left 参数说明。
 * @param right 参数说明。
 * @returns 无返回值，完成SameHeavenGate根容器的条件判断。
 */

function isSameHeavenGateRoots(left, right) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!left && !right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.metal === right.metal
        && left.wood === right.wood
        && left.water === right.water
        && left.fire === right.fire
        && left.earth === right.earth;
}
/**
 * clamp：执行clamp相关逻辑。
 * @param value 参数说明。
 * @param min 参数说明。
 * @param max 参数说明。
 * @returns 无返回值，直接更新clamp相关状态。
 */

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
