"use strict";

var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;

    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));

var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {

    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {

            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;

        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();

var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};

var PlayerProgressionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerProgressionService = void 0;

const common_1 = require("@nestjs/common");

const fs = __importStar(require("fs"));

const shared_1 = require("@mud/shared-next");

const project_path_1 = require("../../common/project-path");

const content_template_repository_1 = require("../../content/content-template.repository");

const player_attributes_service_1 = require("./player-attributes.service");

/** 境界配置文件路径，启动时从这里加载所有境界参数。 */
const REALM_LEVELS_PATH = ['packages', 'server', 'data', 'content', 'realm-levels.json'];

/** 元素类型顺序，用于天门、灵根和面板展示。 */
const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];

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

/** 每次天门斩根允许切掉的最大条目数。 */
const HEAVEN_GATE_MAX_SEVERED = 4;

/** 默认天门重掷时使用的平均加成。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;

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
let PlayerProgressionService = PlayerProgressionService_1 = class PlayerProgressionService {
    /** 内容仓库，用于境界描述、奖励和外部模板查询。 */
    contentTemplateRepository;
    /** 属性结算器，用于境界变化后重算最终面板。 */
    playerAttributesService;
    /** 运行时日志器，记录境界加载和结算异常。 */
    logger = new common_1.Logger(PlayerProgressionService_1.name);
    /** 已加载的境界表，按 realmLv 索引。 */
    realmLevels = new Map();
    /** 当前读取到的最大境界等级。 */
    maxRealmLevel = 1;
    /** 注入内容仓库和属性结算器。 */
    constructor(contentTemplateRepository, playerAttributesService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerAttributesService = playerAttributesService;
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
        player.hp = clamp(player.hp, 0, player.maxHp);
        player.qi = clamp(player.qi, 0, player.maxQi);
    }
    /** 只刷新境界展示态，不修改实际推进结果。 */
    refreshPreview(player) {

        const resolved = this.normalizeRealmState(player.realm);
        this.applyRealmPresentation(player, resolved);
    }
    /** 增加境界经验并返回本次是否真的发生变化。 */
    gainRealmProgress(player, amount, options = {}) {

        const result = this.gainRealmProgressInternal(player, amount, options);
        this.finalizeProgressionMutation(player, result);
        return {
            changed: result.changed,
            notices: result.notices,
            actionsDirty: result.actionsDirty,
        };
    }
    /** 增加基础修为值。 */
    gainFoundation(player, amount) {

        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }
        player.foundation += normalized;
        this.finalizeProgressionMutation(player, {
            changed: true,
            panelDirty: true,
            attrRecalculated: false,
            techniquesDirty: false,
            actionsDirty: false,
            notices: [],
        });
        return {
            changed: true,
            notices: [],
            actionsDirty: false,
        };
    }
    /** 增加战斗经验。 */
    gainCombatExp(player, amount) {

        const normalized = normalizeProgressionAmount(amount);
        if (normalized <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }
        player.combatExp += normalized;
        this.finalizeProgressionMutation(player, {
            changed: true,
            panelDirty: true,
            attrRecalculated: false,
            techniquesDirty: false,
            actionsDirty: false,
            notices: [],
        });
        return {
            changed: true,
            notices: [],
            actionsDirty: false,
        };
    }
    /** 推进修炼 tick，处理境界经验、战斗经验和功法经验。 */
    advanceProgressionTick(player, elapsedTicks = 1, options = {}) {

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
        return {
            changed: true,
            notices,
            actionsDirty,
        };
    }
    /** 推进闭关修炼 tick。 */
    advanceCultivation(player, elapsedTicks = 1) {

        const ticks = Math.max(0, Math.floor(normalizeProgressionTicks(elapsedTicks)));
        if (ticks <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }

        const resolved = this.resolveActiveCultivatingTechnique(player);
        if (!resolved.technique) {
            if (resolved.changed) {
                this.finalizeProgressionMutation(player, resolved);
            }
            return {
                changed: resolved.changed,
                notices: resolved.notices,
                actionsDirty: resolved.actionsDirty,
            };
        }

        let mutation = resolved;

        const realmBasePerTick = Math.max(0, shared_1.CULTIVATION_REALM_EXP_PER_TICK + Math.round(player.attrs.numericStats.realmExpPerTick));

        const techniqueBasePerTick = Math.max(0, shared_1.CULTIVATE_EXP_PER_TICK + Math.round(player.attrs.numericStats.techniqueExpPerTick));

        const realmGain = applyRateBonus(realmBasePerTick * ticks, player.attrs.numericStats.playerExpRate, 1);

        const techniqueGain = applyRateBonus(techniqueBasePerTick * ticks, player.attrs.numericStats.techniqueExpRate, 1);
        if (realmGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.gainRealmProgressInternal(player, realmGain, {
                useFoundation: true,
                overflowToFoundation: true,
            }));
        }
        if (techniqueGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.advanceTechniqueProgressInternal(player, techniqueGain));
        }
        if (!mutation.changed) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }
        this.finalizeProgressionMutation(player, mutation);
        return {
            changed: true,
            notices: mutation.notices,
            actionsDirty: mutation.actionsDirty,
        };
    }
    /** 统计击杀妖兽后获得的境界和功法经验。 */
    grantMonsterKillProgress(player, input = {}) {

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

        const techniqueGain = applyRateBonus(this.getTechniqueCombatExp(monsterLevel, expAdjustmentRealmLv, monsterTier, expMultiplier, contributionRatio), player.attrs.numericStats.techniqueExpRate, 0);

        let mutation = createEmptyMutation();
        if (realmGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.gainRealmProgressInternal(player, realmGain, {
                useFoundation: true,
                overflowToFoundation: true,
                trackCombatExp: true,
            }));
        }
        if (techniqueGain > 0) {
            mutation = mergeProgressionMutation(mutation, this.advanceTechniqueProgressInternal(player, techniqueGain));
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
                segments.push(`${actualTechniqueGain.name} 经验 +${actualTechniqueGain.gained}`);
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
                    }],
            });
        }
        if (!mutation.changed) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }
        this.finalizeProgressionMutation(player, mutation);
        return {
            changed: true,
            notices: mutation.notices,
            actionsDirty: mutation.actionsDirty,
        };
    }
    /** 处理天门界面的斩根、重掷和抽灵根操作。 */
    handleHeavenGateAction(player, action, element) {

        const realm = this.normalizeRealmState(player.realm);
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            return {
                changed: false,
                notices: [{ text: '当前境界不可开天门', kind: 'warn' }],
            };
        }

        const heavenGate = this.syncHeavenGateState(player, realm);
        if (!heavenGate?.unlocked) {
            return {
                changed: false,
                notices: [{ text: '当前尚未叩开仙门，暂时不能开天门', kind: 'warn' }],
            };
        }
        if (action === 'sever' || action === 'restore') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再改动灵根', kind: 'warn' }],
                };
            }
            if (!element || !ELEMENT_KEYS.includes(element)) {
                return {
                    changed: false,
                    notices: [{ text: '灵根目标无效', kind: 'warn' }],
                };
            }

            const cost = this.getHeavenGateSeverCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足', kind: 'warn' }],
                };
            }

            const severed = new Set(heavenGate.severed);
            if (action === 'sever') {
                if (severed.has(element)) {
                    return {
                        changed: false,
                        notices: [{ text: `${ELEMENT_KEY_LABELS[element]}灵根已被斩断`, kind: 'warn' }],
                    };
                }
                if (severed.size >= HEAVEN_GATE_MAX_SEVERED) {
                    return {
                        changed: false,
                        notices: [{ text: '最多只能斩断四条灵根', kind: 'warn' }],
                    };
                }
                severed.add(element);
            }
            else if (!severed.has(element)) {
                return {
                    changed: false,
                    notices: [{ text: `${ELEMENT_KEY_LABELS[element]}灵根尚未斩断`, kind: 'warn' }],
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
                    }],
            };
        }
        if (action === 'open') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再重开天门', kind: 'warn' }],
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
                    }],
            };
        }
        if (action === 'reroll') {
            if (heavenGate.entered) {
                return {
                    changed: false,
                    notices: [{ text: '当前已入天门，无法再逆天改命', kind: 'warn' }],
                };
            }
            if (!heavenGate.roots) {
                return {
                    changed: false,
                    notices: [{ text: '当前尚未开天门，无法逆天改命', kind: 'warn' }],
                };
            }

            const cost = this.getHeavenGateRerollCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足，无法逆天改命', kind: 'warn' }],
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
            this.applyResolvedRealmState(player, this.createRealmStateFromLevel(realm.realmLv, Math.max(0, realm.progress - cost)));
            return {
                changed: true,
                notices: [{
                        text: `逆天改命消耗 ${cost} 点境界修为，后续开天门平均品质加成提升至 +${nextAverageBonus}。`,
                        kind: 'success',
                    }],
            };
        }
        if (!heavenGate.roots) {
            return {
                changed: false,
                notices: [{ text: '尚未开天门，无法入天门', kind: 'warn' }],
            };
        }
        if (heavenGate.entered) {
            return {
                changed: false,
                notices: [{ text: '当前已入天门，无需重复确认', kind: 'warn' }],
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
        this.applyResolvedRealmState(player, realm);
        return {
            changed: true,
            notices: [{
                    text: '你已入天门，灵根结果已定。后续仍需按原本条件突破至练气。',
                    kind: 'success',
                }],
        };
    }
    /** 尝试完成一次境界突破。 */
    attemptBreakthrough(player) {

        const realm = this.normalizeRealmState(player.realm);
        if (!realm.breakthroughReady || !realm.breakthrough) {
            return {
                changed: false,
                notices: [{ text: '你的境界火候未到，尚不能突破', kind: 'warn' }],
            };
        }

        const preview = realm.breakthrough;
        if (!preview.canBreakthrough) {
            return {
                changed: false,
                notices: [{ text: preview.blockedReason ?? '突破条件尚未满足', kind: 'warn' }],
            };
        }
        if (realm.breakthroughItems.length > 0) {
            for (const item of realm.breakthroughItems) {
                this.consumeInventoryItemById(player, item.itemId, item.count);
            }
            player.inventory.revision += 1;
        }

        const targetRealm = this.createRealmStateFromLevel(realm.breakthrough.targetRealmLv, 0);
        this.applyResolvedRealmState(player, targetRealm);
        player.hp = player.maxHp;
        player.qi = player.maxQi;
        return {
            changed: true,
            notices: [{
                    text: `你已成功突破至 ${targetRealm.displayName}。`,
                    kind: 'success',
                }],
        };
    }
    /** 读取并缓存境界配置文件。 */
    loadRealmLevels() {

        const filePath = (0, project_path_1.resolveProjectPath)(...REALM_LEVELS_PATH);

        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.realmLevels.clear();
        for (const entry of raw.levels ?? []) {
            const realmLv = normalizePositiveInt(entry.realmLv, 0);
            if (realmLv <= 0) {
                continue;
            }
            this.realmLevels.set(realmLv, {
                realmLv,

                displayName: typeof entry.displayName === 'string' && entry.displayName.trim() ? entry.displayName.trim() : `realmLv ${realmLv}`,

                name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `realmLv ${realmLv}`,

                phaseName: typeof entry.phaseName === 'string' && entry.phaseName.trim() ? entry.phaseName.trim() : null,

                path: entry.path === 'immortal' || entry.path === 'ascended' ? entry.path : 'martial',

                review: typeof entry.review === 'string' && entry.review.trim() ? entry.review.trim() : undefined,
                lifespanYears: normalizeNullablePositiveInt(entry.lifespanYears),
                expToNext: normalizePositiveInt(entry.expToNext, 0),
            });
        }

        const configuredMaxRealmLevel = shared_1.PLAYER_REALM_STAGE_LEVEL_RANGES[shared_1.PlayerRealmStage.QiRefining]?.levelTo ?? 30;
        this.maxRealmLevel = Math.min(Math.max(1, ...this.realmLevels.keys()), configuredMaxRealmLevel);
        this.logger.log(`已从 ${filePath} 加载 ${this.realmLevels.size} 个境界等级`);
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
    resolveInitialRealmState(player) {

        const rawRealmLv = player.realm?.realmLv;

        const rawProgress = player.realm?.progress ?? 0;
        if (typeof rawRealmLv === 'number' && Number.isFinite(rawRealmLv) && rawRealmLv > 0) {
            return this.createRealmStateFromLevel(rawRealmLv, rawProgress);
        }

        const stage = player.realm?.stage ?? shared_1.PLAYER_REALM_ORDER[0];
        return this.createRealmStateFromLevel(resolveRealmLevelFromStage(stage), rawProgress);
    }
    normalizeRealmState(value) {
        if (!value) {
            return this.createRealmStateFromLevel(1, 0);
        }
        return this.createRealmStateFromLevel(value.realmLv, value.progress);
    }
    createRealmStateFromLevel(realmLvInput, progressInput = 0) {

        const realmLv = clamp(normalizePositiveInt(realmLvInput, 1), 1, this.maxRealmLevel);

        const entry = this.realmLevels.get(realmLv) ?? this.realmLevels.get(1);

        const stage = resolveStageForRealmLevel(realmLv);

        const config = shared_1.PLAYER_REALM_CONFIG[stage];

        const progressToNext = Math.max(0, entry.expToNext);

        const progress = progressToNext > 0
            ? clamp(Math.floor(Math.max(0, Number(progressInput) || 0)), 0, progressToNext)
            : 0;

        const breakthroughReady = progressToNext > 0 && progress >= progressToNext && realmLv < this.maxRealmLevel;
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
            breakthroughItems: breakthroughReady ? config.breakthroughItems.map((item) => ({ ...item })) : [],
            minTechniqueLevel: config.minTechniqueLevel,
            minTechniqueRealm: config.minTechniqueRealm,
        };
    }
    applyResolvedRealmState(player, realm, options) {

        const previousStage = player.realm?.stage ?? null;

        const previousRoots = cloneHeavenGateRoots(player.spiritualRoots);
        this.applyRealmPresentation(player, realm);

        const attrRecalculated = previousStage !== player.realm?.stage
            || !isSameHeavenGateRoots(previousRoots, player.spiritualRoots);
        if (attrRecalculated) {
            this.playerAttributesService.recalculate(player);
        }
        if (options?.bumpPersistentRevision !== false) {
            player.persistentRevision += 1;
        }
        return attrRecalculated;
    }
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
    buildBreakthroughPreview(player, realm) {
        if (!realm.breakthroughReady || realm.realmLv >= this.maxRealmLevel) {
            return undefined;
        }

        const requirements = [];
        for (const item of realm.breakthroughItems) {
            const currentCount = getInventoryCount(player, item.itemId);
            const itemName = this.contentTemplateRepository.getItemName(item.itemId) ?? item.itemId;
            requirements.push({
                id: `item:${item.itemId}`,
                type: 'item',
                label: `${itemName} x${item.count}`,

                completed: currentCount >= item.count,
                hidden: false,
                blocksBreakthrough: true,
                detail: `当前持有 ${currentCount} / ${item.count}`,
            });
        }
        if (realm.minTechniqueLevel > 0) {

            const techniqueCompleted = player.techniques.techniques.some((technique) => ((technique.level ?? 0) >= realm.minTechniqueLevel
                && ((technique.realm ?? shared_1.TechniqueRealm.Entry) >= (realm.minTechniqueRealm ?? shared_1.TechniqueRealm.Entry))));
            requirements.push({
                id: `technique:min:${realm.minTechniqueLevel}:${realm.minTechniqueRealm ?? shared_1.TechniqueRealm.Entry}`,
                type: 'technique',

                label: realm.minTechniqueRealm !== undefined
                    ? `至少掌握 1 门功法，达到 ${realm.minTechniqueLevel} 级且功法境界达到${formatTechniqueRealmLabel(realm.minTechniqueRealm)}`
                    : `至少掌握 1 门功法，达到 ${realm.minTechniqueLevel} 级`,
                completed: techniqueCompleted,
                hidden: false,
                blocksBreakthrough: true,
                detail: techniqueCompleted
                    ? '当前已满足功法火候要求。'
                    : '当前尚未满足功法火候要求。',
            });
        }
        if (this.hasReachedHeavenGateRealm(realm.realmLv)) {

            const heavenGateCompleted = this.hasCompletedHeavenGate(player);
            requirements.push({
                id: 'root:heaven_gate',
                type: 'root',
                label: '完成开天门并确认入天门',
                completed: heavenGateCompleted,
                hidden: false,
                blocksBreakthrough: true,
                detail: heavenGateCompleted
                    ? '当前已完成开天门。'
                    : '当前仍需先完成开天门并确认入天门。',
            });
        }

        const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false).length;

        const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false && entry.completed).length;

        const targetRealmLv = Math.min(this.maxRealmLevel, realm.realmLv + 1);

        const targetRealm = this.realmLevels.get(targetRealmLv);

        const blockedReason = requirements.some((entry) => entry.id === 'root:heaven_gate' && !entry.completed)
            ? '请先完成开天门并确认入天门'
            : undefined;

        const canBreakthrough = blockingRequirements === completedBlockingRequirements && !blockedReason;
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
            blockedReason,
        };
    }
    syncHeavenGateState(player, realm) {
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            player.heavenGate = null;
            player.spiritualRoots = null;
            return null;
        }

        const persisted = normalizeHeavenGateState(player.heavenGate);

        const resolvedRoots = persisted?.roots
            ? cloneHeavenGateRoots(persisted.roots)
            : normalizeHeavenGateRoots(player.spiritualRoots);

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
    hasCompletedHeavenGate(player) {

        const heavenGate = normalizeHeavenGateState(player.heavenGate);
        return heavenGate?.entered === true || normalizeHeavenGateRoots(player.spiritualRoots) !== null;
    }
    hasReachedHeavenGateRealm(realmLv) {
        return realmLv >= HEAVEN_GATE_REALM_LEVEL;
    }
    getHeavenGateSeverCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.1));
    }
    getHeavenGateRerollCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.25));
    }
    weightedPickHeavenGateSegment(segments) {

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
    randomHeavenGateInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
    getHeavenGateExtraPerfectRootKeepChance(averageBonus) {

        const bonus = Math.max(0, averageBonus);
        if (bonus <= 0) {
            return 1;
        }

        const squaredBonus = bonus * bonus;

        const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
        return squaredBonus / (squaredBonus + squaredSoftCap);
    }
    distributeHeavenGateRoots(total, remaining) {

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
    softenHeavenGatePerfectRoots(roots, averageBonus) {

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
    rollHeavenGateRoots(severed, averageBonus) {

        const remaining = ELEMENT_KEYS.filter((element) => !severed.includes(element));

        const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remaining.length] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];

        const segment = this.weightedPickHeavenGateSegment(segments);

        const average = Math.min(100, this.randomHeavenGateInt(segment.min, segment.max) + Math.max(0, averageBonus));

        const roots = this.distributeHeavenGateRoots(average * remaining.length, [...remaining]);
        return this.softenHeavenGatePerfectRoots(roots, averageBonus);
    }
    consumeInventoryItemById(player, itemId, count) {

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
    gainRealmProgressInternal(player, amount, options) {

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

        const canAdvanceRealm = realm.progressToNext > 0 && realm.realmLv < this.maxRealmLevel;

        let nextProgress = realm.progress;

        let foundationChanged = false;

        let combatExpChanged = false;
        if (canAdvanceRealm) {

            const room = Math.max(0, realm.progressToNext - nextProgress);
            if (room > 0) {
                nextProgress += Math.min(room, normalized);
            }
            if (options.useFoundation === true && nextProgress < realm.progressToNext && player.foundation > 0) {

                const foundationSpent = Math.min(player.foundation, realm.progressToNext - nextProgress);
                if (foundationSpent > 0) {
                    player.foundation -= foundationSpent;
                    nextProgress += foundationSpent;
                    foundationChanged = true;
                }
            }
        }
        if (options.overflowToFoundation === true) {

            const overflow = canAdvanceRealm
                ? Math.max(0, normalized - Math.max(0, nextProgress - realm.progress))
                : normalized;
            if (overflow > 0) {
                player.foundation += overflow;
                foundationChanged = true;
            }
        }
        if (options.trackCombatExp === true) {

            const combatExpGain = normalizeProgressionAmount(normalized * normalizeCombatExpMultiplier(options.combatExpMultiplier));
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
                }]
            : [];

        const changed = realmChanged || foundationChanged || combatExpChanged;
        return {
            changed,
            panelDirty: !attrRecalculated && (foundationChanged || combatExpChanged),
            attrRecalculated,
            techniquesDirty: false,

            actionsDirty: nextRealm.breakthroughReady !== realm.breakthroughReady,
            notices,
        };
    }
    resolveCultivatingTechnique(player) {

        const currentTechId = player.techniques.cultivatingTechId;
        if (!currentTechId) {
            return null;
        }
        return player.techniques.techniques.find((entry) => entry.techId === currentTechId) ?? null;
    }
    resolveActiveCultivatingTechnique(player) {

        const current = this.resolveCultivatingTechnique(player);
        if (!current) {
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

            const next = this.findNextCultivatingTechnique(player, current.techId);
            if (next) {
                player.techniques.cultivatingTechId = next.techId;
                this.applyRealmPresentation(player, this.normalizeRealmState(player.realm));
                return {
                    changed: true,
                    panelDirty: false,
                    attrRecalculated: false,
                    techniquesDirty: true,
                    actionsDirty: true,
                    notices: [{
                            text: `${current.name ?? current.techId} 已圆满，主修已自动切换为 ${next.name ?? next.techId}。`,
                            kind: 'info',
                        }],
                    technique: next,
                };
            }
        }
        return {
            ...createEmptyMutation(),
            technique: current,
        };
    }
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
                }],
        };
    }
    findNextCultivatingTechnique(player, currentTechId) {

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
    isTechniqueMaxed(technique) {

        const level = Math.max(1, Math.floor(technique.level ?? 1));

        const maxLevel = (0, shared_1.getTechniqueMaxLevel)(technique.layers ?? undefined, level, technique.attrCurves ?? undefined);
        return level >= maxLevel || (technique.expToNext ?? 0) <= 0;
    }
    advanceTechniqueProgressInternal(player, amount) {

        const resolved = this.resolveActiveCultivatingTechnique(player);
        if (!resolved.technique) {
            return resolved;
        }

        const technique = resolved.technique;

        const techniqueExpAdjustment = (0, shared_1.getTechniqueExpLevelAdjustment)(player.realm?.realmLv, technique.realmLv);

        const normalized = normalizeProgressionAmount(amount * techniqueExpAdjustment);
        if (normalized <= 0) {
            return resolved;
        }

        const previousLevel = Math.max(1, Math.floor(technique.level ?? 1));

        const previousExp = Math.max(0, Math.floor(technique.exp ?? 0));

        const maxLevel = (0, shared_1.getTechniqueMaxLevel)(technique.layers ?? undefined, previousLevel, technique.attrCurves ?? undefined);
        if (previousLevel >= maxLevel || (technique.expToNext ?? 0) <= 0) {
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
            technique.expToNext = (0, shared_1.getTechniqueExpToNext)(technique.level, technique.layers ?? undefined);
            technique.realm = (0, shared_1.deriveTechniqueRealm)(technique.level, technique.layers ?? undefined, technique.attrCurves ?? undefined);
            notices.push({
                text: (technique.expToNext ?? 0) > 0
                    ? `${technique.name ?? technique.techId} 提升至第 ${technique.level} 层。`
                    : `${technique.name ?? technique.techId} 已修至圆满。`,
                kind: 'success',
            });
            actionsDirty = true;
        }
        if (technique.level >= maxLevel && (technique.expToNext ?? 0) <= 0) {
            technique.exp = 0;
            technique.realm = shared_1.TechniqueRealm.Perfection;
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
    getRealmCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {

        const level = Math.max(1, Math.floor(monsterLevel));

        const expToNext = Math.max(0, this.realmLevels.get(level)?.expToNext ?? 0);
        if (expToNext <= 0) {
            return 0;
        }

        const levelAdjustment = getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
        return expToNext
            * Math.max(0, expMultiplier)
            * levelAdjustment
            * clamp(contributionRatio, 0, 1)
            / 1000;
    }
    getTechniqueCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {

        const level = Math.max(1, Math.floor(monsterLevel));

        const expToNext = Math.max(0, this.realmLevels.get(level)?.expToNext ?? 0);
        if (expToNext <= 0) {
            return 0;
        }

        const levelAdjustment = getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
        return expToNext
            * Math.max(0, expMultiplier)
            * levelAdjustment
            * clamp(contributionRatio, 0, 1)
            / 200;
    }
    finalizeProgressionMutation(player, mutation) {
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
    finalizePresentationMutation(player) {
        player.persistentRevision += 1;
    }
};
exports.PlayerProgressionService = PlayerProgressionService;
exports.PlayerProgressionService = PlayerProgressionService = PlayerProgressionService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_attributes_service_1.PlayerAttributesService])
], PlayerProgressionService);
function resolveStageForRealmLevel(realmLv) {
    if (realmLv >= 31)
        return shared_1.PLAYER_REALM_ORDER[6];
    if (realmLv >= 19)
        return shared_1.PLAYER_REALM_ORDER[5];
    if (realmLv >= 16)
        return shared_1.PLAYER_REALM_ORDER[4];
    if (realmLv >= 13)
        return shared_1.PLAYER_REALM_ORDER[3];
    if (realmLv >= 9)
        return shared_1.PLAYER_REALM_ORDER[2];
    if (realmLv >= 6)
        return shared_1.PLAYER_REALM_ORDER[1];
    return shared_1.PLAYER_REALM_ORDER[0];
}
function resolveRealmLevelFromStage(stage) {
    switch (stage) {
        case shared_1.PLAYER_REALM_ORDER[1]:
            return 6;
        case shared_1.PLAYER_REALM_ORDER[2]:
            return 9;
        case shared_1.PLAYER_REALM_ORDER[3]:
            return 13;
        case shared_1.PLAYER_REALM_ORDER[4]:
            return 16;
        case shared_1.PLAYER_REALM_ORDER[5]:
            return 19;
        case shared_1.PLAYER_REALM_ORDER[6]:
            return 31;
        default:
            return 1;
    }
}
function formatTechniqueRealmLabel(value) {
    switch (value) {
        case shared_1.TechniqueRealm.Perfection:
            return '圆满';
        case shared_1.TechniqueRealm.Major:
            return '大成';
        case shared_1.TechniqueRealm.Minor:
            return '小成';
        case shared_1.TechniqueRealm.Entry:
        default:
            return '入门';
    }
}
function createEmptyMutation() {
    return {
        changed: false,
        panelDirty: false,
        attrRecalculated: false,
        techniquesDirty: false,
        actionsDirty: false,
        notices: [],
    };
}
function mergeProgressionMutation(left, right) {
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
        techniquesDirty: left.techniquesDirty || right.techniquesDirty,
        actionsDirty: left.actionsDirty || right.actionsDirty,

        notices: left.notices.length === 0
            ? right.notices
            : right.notices.length === 0
                ? left.notices
                : [...left.notices, ...right.notices],
    };
}
function applyRateBonus(baseGain, bonusRateBp, minimumGain = 1) {

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
function getMonsterKillRealmExpAdjustment(playerRealmLv, monsterLevel, monsterTier) {
    return (0, shared_1.getMonsterKillExpLevelAdjustment)(playerRealmLv, monsterLevel, monsterTier);
}
function snapshotCultivatingTechnique(player) {

    const techId = player.techniques.cultivatingTechId;
    if (!techId) {
        return {
            techId: null,
            name: null,
            level: 0,
            exp: 0,
        };
    }

    const technique = player.techniques.techniques.find((entry) => entry.techId === techId);
    return {
        techId,
        name: technique?.name ?? techId,
        level: Math.max(0, Math.floor(technique?.level ?? 0)),
        exp: Math.max(0, Math.floor(technique?.exp ?? 0)),
    };
}
function calculateRealmProgressGain(previousRealmLv, previousProgress, currentRealm) {
    if (!currentRealm) {
        return 0;
    }
    if (currentRealm.realmLv !== previousRealmLv) {
        return Math.max(0, currentRealm.progress);
    }
    return Math.max(0, currentRealm.progress - previousProgress);
}
function calculateTechniqueGain(previous, current) {
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
        gained: Math.max(0, current.exp - previous.exp),
    };
}
function createEmptyRoots() {
    return {
        metal: 0,
        wood: 0,
        water: 0,
        fire: 0,
        earth: 0,
    };
}
function cloneHeavenGateRoots(roots) {
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
function normalizeHeavenGateRoots(roots) {

    const normalized = cloneHeavenGateRoots(roots);
    if (!normalized) {
        return null;
    }
    return ELEMENT_KEYS.some((element) => normalized[element] > 0) ? normalized : null;
}
function normalizeHeavenGateState(state) {
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
function getInventoryCount(player, itemId) {

    let total = 0;
    for (const entry of player.inventory.items) {
        if (entry.itemId === itemId) {
            total += entry.count;
        }
    }
    return total;
}
function normalizePositiveInt(value, fallback) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}
function normalizeProgressionAmount(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}
function normalizeProgressionTicks(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
function normalizeCombatExpMultiplier(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}
function normalizeNullablePositiveInt(value) {

    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}
function isSameHeavenGateRoots(left, right) {
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
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=player-progression.service.js.map


