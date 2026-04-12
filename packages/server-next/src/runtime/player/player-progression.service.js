"use strict";
/** __createBinding：定义该变量以承载业务值。 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
/** desc：定义该变量以承载业务值。 */
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
/** __setModuleDefault：定义该变量以承载业务值。 */
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
/** __decorate：定义该变量以承载业务值。 */
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
/** c：定义该变量以承载业务值。 */
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
/** __importStar：定义该变量以承载业务值。 */
var __importStar = (this && this.__importStar) || (function () {
/** ownKeys：执行对应的业务逻辑。 */
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
/** ar：定义该变量以承载业务值。 */
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
/** result：定义该变量以承载业务值。 */
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
/** __metadata：定义该变量以承载业务值。 */
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
/** PlayerProgressionService_1：定义该变量以承载业务值。 */
var PlayerProgressionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlayerProgressionService = void 0;
/** common_1：定义该变量以承载业务值。 */
const common_1 = require("@nestjs/common");
/** fs：定义该变量以承载业务值。 */
const fs = __importStar(require("fs"));
/** shared_1：定义该变量以承载业务值。 */
const shared_1 = require("@mud/shared-next");
/** project_path_1：定义该变量以承载业务值。 */
const project_path_1 = require("../../common/project-path");
/** content_template_repository_1：定义该变量以承载业务值。 */
const content_template_repository_1 = require("../../content/content-template.repository");
/** player_attributes_service_1：定义该变量以承载业务值。 */
const player_attributes_service_1 = require("./player-attributes.service");
/** REALM_LEVELS_PATH：定义该变量以承载业务值。 */
const REALM_LEVELS_PATH = ['packages', 'server', 'data', 'content', 'realm-levels.json'];
/** ELEMENT_KEYS：定义该变量以承载业务值。 */
const ELEMENT_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'];
/** ELEMENT_KEY_LABELS：定义该变量以承载业务值。 */
const ELEMENT_KEY_LABELS = {
    metal: '金',
    wood: '木',
    water: '水',
    fire: '火',
    earth: '土',
};
/** HEAVEN_GATE_REALM_LEVEL：定义该变量以承载业务值。 */
const HEAVEN_GATE_REALM_LEVEL = 18;
/** HEAVEN_GATE_MAX_SEVERED：定义该变量以承载业务值。 */
const HEAVEN_GATE_MAX_SEVERED = 4;
/** HEAVEN_GATE_REROLL_AVERAGE_BONUS：定义该变量以承载业务值。 */
const HEAVEN_GATE_REROLL_AVERAGE_BONUS = 2;
/** HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP：定义该变量以承载业务值。 */
const HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP = 174;
/** HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS：定义该变量以承载业务值。 */
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
/** HEAVEN_GATE_DISTRIBUTION_SPREAD：定义该变量以承载业务值。 */
const HEAVEN_GATE_DISTRIBUTION_SPREAD = {
    5: 0.18,
    4: 0.28,
    3: 0.4,
    2: 0.58,
    1: 0,
};
/** PlayerProgressionService：定义该变量以承载业务值。 */
let PlayerProgressionService = PlayerProgressionService_1 = class PlayerProgressionService {
    contentTemplateRepository;
    playerAttributesService;
    logger = new common_1.Logger(PlayerProgressionService_1.name);
    realmLevels = new Map();
    maxRealmLevel = 1;
/** 构造函数：执行实例初始化流程。 */
    constructor(contentTemplateRepository, playerAttributesService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerAttributesService = playerAttributesService;
    }
/** onModuleInit：执行对应的业务逻辑。 */
    onModuleInit() {
        this.loadRealmLevels();
    }
/** initializePlayer：执行对应的业务逻辑。 */
    initializePlayer(player) {
/** resolved：定义该变量以承载业务值。 */
        const resolved = this.resolveInitialRealmState(player);
        this.applyRealmPresentation(player, resolved);
        this.playerAttributesService.recalculate(player);
        player.hp = clamp(player.hp, 0, player.maxHp);
        player.qi = clamp(player.qi, 0, player.maxQi);
    }
/** refreshPreview：执行对应的业务逻辑。 */
    refreshPreview(player) {
/** resolved：定义该变量以承载业务值。 */
        const resolved = this.normalizeRealmState(player.realm);
        this.applyRealmPresentation(player, resolved);
    }
/** gainRealmProgress：执行对应的业务逻辑。 */
    gainRealmProgress(player, amount, options = {}) {
/** result：定义该变量以承载业务值。 */
        const result = this.gainRealmProgressInternal(player, amount, options);
        this.finalizeProgressionMutation(player, result);
        return {
            changed: result.changed,
            notices: result.notices,
            actionsDirty: result.actionsDirty,
        };
    }
/** gainFoundation：执行对应的业务逻辑。 */
    gainFoundation(player, amount) {
/** normalized：定义该变量以承载业务值。 */
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
/** gainCombatExp：执行对应的业务逻辑。 */
    gainCombatExp(player, amount) {
/** normalized：定义该变量以承载业务值。 */
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
/** advanceProgressionTick：执行对应的业务逻辑。 */
    advanceProgressionTick(player, elapsedTicks = 1, options = {}) {
/** normalizedTicks：定义该变量以承载业务值。 */
        const normalizedTicks = normalizeProgressionTicks(elapsedTicks);
/** changed：定义该变量以承载业务值。 */
        let changed = false;
/** panelDirty：定义该变量以承载业务值。 */
        let panelDirty = false;
/** attrRecalculated：定义该变量以承载业务值。 */
        let attrRecalculated = false;
/** techniquesDirty：定义该变量以承载业务值。 */
        let techniquesDirty = false;
/** actionsDirty：定义该变量以承载业务值。 */
        let actionsDirty = false;
/** notices：定义该变量以承载业务值。 */
        const notices = [];
        if (normalizedTicks > 0) {
            player.lifeElapsedTicks += normalizedTicks;
            changed = true;
            panelDirty = true;
        }
/** foundationGain：定义该变量以承载业务值。 */
        const foundationGain = normalizeProgressionAmount(options.foundation);
        if (foundationGain > 0) {
            player.foundation += foundationGain;
            changed = true;
            panelDirty = true;
        }
/** combatExpGain：定义该变量以承载业务值。 */
        const combatExpGain = normalizeProgressionAmount(options.combatExp);
        if (combatExpGain > 0) {
            player.combatExp += combatExpGain;
            changed = true;
            panelDirty = true;
        }
/** realmProgressGain：定义该变量以承载业务值。 */
        const realmProgressGain = normalizeProgressionAmount(options.realmProgress);
        if (realmProgressGain > 0) {
/** realmResult：定义该变量以承载业务值。 */
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
/** advanceCultivation：执行对应的业务逻辑。 */
    advanceCultivation(player, elapsedTicks = 1) {
/** ticks：定义该变量以承载业务值。 */
        const ticks = Math.max(0, Math.floor(normalizeProgressionTicks(elapsedTicks)));
        if (ticks <= 0) {
            return {
                changed: false,
                notices: [],
                actionsDirty: false,
            };
        }
/** resolved：定义该变量以承载业务值。 */
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
/** mutation：定义该变量以承载业务值。 */
        let mutation = resolved;
/** realmBasePerTick：定义该变量以承载业务值。 */
        const realmBasePerTick = Math.max(0, shared_1.CULTIVATION_REALM_EXP_PER_TICK + Math.round(player.attrs.numericStats.realmExpPerTick));
/** techniqueBasePerTick：定义该变量以承载业务值。 */
        const techniqueBasePerTick = Math.max(0, shared_1.CULTIVATE_EXP_PER_TICK + Math.round(player.attrs.numericStats.techniqueExpPerTick));
/** realmGain：定义该变量以承载业务值。 */
        const realmGain = applyRateBonus(realmBasePerTick * ticks, player.attrs.numericStats.playerExpRate, 1);
/** techniqueGain：定义该变量以承载业务值。 */
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
/** grantMonsterKillProgress：执行对应的业务逻辑。 */
    grantMonsterKillProgress(player, input = {}) {
/** monsterLevel：定义该变量以承载业务值。 */
        const monsterLevel = Math.max(1, Math.floor(Number(input.monsterLevel) || 1));
/** expAdjustmentRealmLv：定义该变量以承载业务值。 */
        const expAdjustmentRealmLv = Math.max(1, Math.floor(Number(input.expAdjustmentRealmLv) || player.realm?.realmLv || 1));
/** contributionRatio：定义该变量以承载业务值。 */
        const contributionRatio = clamp(Number(input.contributionRatio) || 1, 0, 1);
/** expMultiplier：定义该变量以承载业务值。 */
        const expMultiplier = Number.isFinite(input.expMultiplier) ? Math.max(0, Number(input.expMultiplier)) : 1;
/** monsterTier：定义该变量以承载业务值。 */
        const monsterTier = input.monsterTier;
/** beforeFoundation：定义该变量以承载业务值。 */
        const beforeFoundation = player.foundation;
/** beforeCombatExp：定义该变量以承载业务值。 */
        const beforeCombatExp = player.combatExp;
/** beforeRealmLv：定义该变量以承载业务值。 */
        const beforeRealmLv = player.realm?.realmLv ?? 1;
/** beforeRealmProgress：定义该变量以承载业务值。 */
        const beforeRealmProgress = player.realm?.progress ?? 0;
/** beforeTechnique：定义该变量以承载业务值。 */
        const beforeTechnique = snapshotCultivatingTechnique(player);
/** realmGain：定义该变量以承载业务值。 */
        const realmGain = applyRateBonus(this.getRealmCombatExp(monsterLevel, expAdjustmentRealmLv, monsterTier, expMultiplier, contributionRatio), player.attrs.numericStats.playerExpRate, 0);
/** techniqueGain：定义该变量以承载业务值。 */
        const techniqueGain = applyRateBonus(this.getTechniqueCombatExp(monsterLevel, expAdjustmentRealmLv, monsterTier, expMultiplier, contributionRatio), player.attrs.numericStats.techniqueExpRate, 0);
/** mutation：定义该变量以承载业务值。 */
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
/** actualRealmGain：定义该变量以承载业务值。 */
        const actualRealmGain = calculateRealmProgressGain(beforeRealmLv, beforeRealmProgress, player.realm);
/** actualFoundationGain：定义该变量以承载业务值。 */
        const actualFoundationGain = Math.max(0, player.foundation - beforeFoundation);
/** actualCombatExpGain：定义该变量以承载业务值。 */
        const actualCombatExpGain = Math.max(0, player.combatExp - beforeCombatExp);
/** actualTechniqueGain：定义该变量以承载业务值。 */
        const actualTechniqueGain = calculateTechniqueGain(beforeTechnique, snapshotCultivatingTechnique(player));
        if (actualRealmGain > 0 || actualFoundationGain > 0 || actualCombatExpGain > 0 || actualTechniqueGain.gained > 0) {
/** segments：定义该变量以承载业务值。 */
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
/** text：定义该变量以承载业务值。 */
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
/** handleHeavenGateAction：执行对应的业务逻辑。 */
    handleHeavenGateAction(player, action, element) {
/** realm：定义该变量以承载业务值。 */
        const realm = this.normalizeRealmState(player.realm);
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            return {
                changed: false,
                notices: [{ text: '当前境界不可开天门', kind: 'warn' }],
            };
        }
/** heavenGate：定义该变量以承载业务值。 */
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
/** cost：定义该变量以承载业务值。 */
            const cost = this.getHeavenGateSeverCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足', kind: 'warn' }],
                };
            }
/** severed：定义该变量以承载业务值。 */
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
/** text：定义该变量以承载业务值。 */
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
/** roots：定义该变量以承载业务值。 */
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
/** total：定义该变量以承载业务值。 */
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
/** cost：定义该变量以承载业务值。 */
            const cost = this.getHeavenGateRerollCost(realm);
            if (realm.progress < cost) {
                return {
                    changed: false,
                    notices: [{ text: '当前境界修为不足，无法逆天改命', kind: 'warn' }],
                };
            }
/** nextAverageBonus：定义该变量以承载业务值。 */
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
/** resolvedRoots：定义该变量以承载业务值。 */
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
/** attemptBreakthrough：执行对应的业务逻辑。 */
    attemptBreakthrough(player) {
/** realm：定义该变量以承载业务值。 */
        const realm = this.normalizeRealmState(player.realm);
        if (!realm.breakthroughReady || !realm.breakthrough) {
            return {
                changed: false,
                notices: [{ text: '你的境界火候未到，尚不能突破', kind: 'warn' }],
            };
        }
/** preview：定义该变量以承载业务值。 */
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
/** targetRealm：定义该变量以承载业务值。 */
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
/** loadRealmLevels：执行对应的业务逻辑。 */
    loadRealmLevels() {
/** filePath：定义该变量以承载业务值。 */
        const filePath = (0, project_path_1.resolveProjectPath)(...REALM_LEVELS_PATH);
/** raw：定义该变量以承载业务值。 */
        const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        this.realmLevels.clear();
        for (const entry of raw.levels ?? []) {
            const realmLv = normalizePositiveInt(entry.realmLv, 0);
            if (realmLv <= 0) {
                continue;
            }
            this.realmLevels.set(realmLv, {
                realmLv,
/** displayName：定义该变量以承载业务值。 */
                displayName: typeof entry.displayName === 'string' && entry.displayName.trim() ? entry.displayName.trim() : `realmLv ${realmLv}`,
/** name：定义该变量以承载业务值。 */
                name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : `realmLv ${realmLv}`,
/** phaseName：定义该变量以承载业务值。 */
                phaseName: typeof entry.phaseName === 'string' && entry.phaseName.trim() ? entry.phaseName.trim() : null,
/** path：定义该变量以承载业务值。 */
                path: entry.path === 'immortal' || entry.path === 'ascended' ? entry.path : 'martial',
/** review：定义该变量以承载业务值。 */
                review: typeof entry.review === 'string' && entry.review.trim() ? entry.review.trim() : undefined,
                lifespanYears: normalizeNullablePositiveInt(entry.lifespanYears),
                expToNext: normalizePositiveInt(entry.expToNext, 0),
            });
        }
/** configuredMaxRealmLevel：定义该变量以承载业务值。 */
        const configuredMaxRealmLevel = shared_1.PLAYER_REALM_STAGE_LEVEL_RANGES[shared_1.PlayerRealmStage.QiRefining]?.levelTo ?? 30;
        this.maxRealmLevel = Math.min(Math.max(1, ...this.realmLevels.keys()), configuredMaxRealmLevel);
        this.logger.log(`Loaded ${this.realmLevels.size} realm levels from ${filePath}`);
    }
/** listRealmLevels：执行对应的业务逻辑。 */
    listRealmLevels() {
        return Array.from(this.realmLevels.values(), (entry) => ({
            realmLv: entry.realmLv,
            displayName: entry.displayName,
            name: entry.name,
            phaseName: entry.phaseName ?? undefined,
            review: entry.review,
        })).sort((left, right) => left.realmLv - right.realmLv);
    }
/** resolveInitialRealmState：执行对应的业务逻辑。 */
    resolveInitialRealmState(player) {
/** rawRealmLv：定义该变量以承载业务值。 */
        const rawRealmLv = player.realm?.realmLv;
/** rawProgress：定义该变量以承载业务值。 */
        const rawProgress = player.realm?.progress ?? 0;
        if (typeof rawRealmLv === 'number' && Number.isFinite(rawRealmLv) && rawRealmLv > 0) {
            return this.createRealmStateFromLevel(rawRealmLv, rawProgress);
        }
/** stage：定义该变量以承载业务值。 */
        const stage = player.realm?.stage ?? shared_1.PLAYER_REALM_ORDER[0];
        return this.createRealmStateFromLevel(resolveRealmLevelFromStage(stage), rawProgress);
    }
/** normalizeRealmState：执行对应的业务逻辑。 */
    normalizeRealmState(value) {
        if (!value) {
            return this.createRealmStateFromLevel(1, 0);
        }
        return this.createRealmStateFromLevel(value.realmLv, value.progress);
    }
/** createRealmStateFromLevel：执行对应的业务逻辑。 */
    createRealmStateFromLevel(realmLvInput, progressInput = 0) {
/** realmLv：定义该变量以承载业务值。 */
        const realmLv = clamp(normalizePositiveInt(realmLvInput, 1), 1, this.maxRealmLevel);
/** entry：定义该变量以承载业务值。 */
        const entry = this.realmLevels.get(realmLv) ?? this.realmLevels.get(1);
/** stage：定义该变量以承载业务值。 */
        const stage = resolveStageForRealmLevel(realmLv);
/** config：定义该变量以承载业务值。 */
        const config = shared_1.PLAYER_REALM_CONFIG[stage];
/** progressToNext：定义该变量以承载业务值。 */
        const progressToNext = Math.max(0, entry.expToNext);
/** progress：定义该变量以承载业务值。 */
        const progress = progressToNext > 0
            ? clamp(Math.floor(Math.max(0, Number(progressInput) || 0)), 0, progressToNext)
            : 0;
/** breakthroughReady：定义该变量以承载业务值。 */
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
/** applyResolvedRealmState：执行对应的业务逻辑。 */
    applyResolvedRealmState(player, realm, options) {
/** previousStage：定义该变量以承载业务值。 */
        const previousStage = player.realm?.stage ?? null;
/** previousRoots：定义该变量以承载业务值。 */
        const previousRoots = cloneHeavenGateRoots(player.spiritualRoots);
        this.applyRealmPresentation(player, realm);
/** attrRecalculated：定义该变量以承载业务值。 */
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
/** applyRealmPresentation：执行对应的业务逻辑。 */
    applyRealmPresentation(player, realm) {
/** heavenGate：定义该变量以承载业务值。 */
        const heavenGate = this.syncHeavenGateState(player, realm);
/** nextRealm：定义该变量以承载业务值。 */
        const nextRealm = {
            ...realm,
            heavenGate,
            breakthrough: this.buildBreakthroughPreview(player, realm),
        };
        player.realm = nextRealm;
        player.heavenGate = heavenGate;
        player.lifespanYears = nextRealm.lifespanYears;
    }
/** buildBreakthroughPreview：执行对应的业务逻辑。 */
    buildBreakthroughPreview(player, realm) {
        if (!realm.breakthroughReady || realm.realmLv >= this.maxRealmLevel) {
            return undefined;
        }
/** requirements：定义该变量以承载业务值。 */
        const requirements = [];
        for (const item of realm.breakthroughItems) {
            const currentCount = getInventoryCount(player, item.itemId);
            const itemName = this.contentTemplateRepository.getItemName(item.itemId) ?? item.itemId;
            requirements.push({
                id: `item:${item.itemId}`,
                type: 'item',
                label: `${itemName} x${item.count}`,
/** completed：定义该变量以承载业务值。 */
                completed: currentCount >= item.count,
                hidden: false,
                blocksBreakthrough: true,
                detail: `当前持有 ${currentCount} / ${item.count}`,
            });
        }
        if (realm.minTechniqueLevel > 0) {
/** techniqueCompleted：定义该变量以承载业务值。 */
            const techniqueCompleted = player.techniques.techniques.some((technique) => ((technique.level ?? 0) >= realm.minTechniqueLevel
                && ((technique.realm ?? shared_1.TechniqueRealm.Entry) >= (realm.minTechniqueRealm ?? shared_1.TechniqueRealm.Entry))));
            requirements.push({
                id: `technique:min:${realm.minTechniqueLevel}:${realm.minTechniqueRealm ?? shared_1.TechniqueRealm.Entry}`,
                type: 'technique',
/** label：定义该变量以承载业务值。 */
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
/** heavenGateCompleted：定义该变量以承载业务值。 */
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
/** blockingRequirements：定义该变量以承载业务值。 */
        const blockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false).length;
/** completedBlockingRequirements：定义该变量以承载业务值。 */
        const completedBlockingRequirements = requirements.filter((entry) => entry.blocksBreakthrough !== false && entry.completed).length;
/** targetRealmLv：定义该变量以承载业务值。 */
        const targetRealmLv = Math.min(this.maxRealmLevel, realm.realmLv + 1);
/** targetRealm：定义该变量以承载业务值。 */
        const targetRealm = this.realmLevels.get(targetRealmLv);
/** blockedReason：定义该变量以承载业务值。 */
        const blockedReason = requirements.some((entry) => entry.id === 'root:heaven_gate' && !entry.completed)
            ? '请先完成开天门并确认入天门'
            : undefined;
/** canBreakthrough：定义该变量以承载业务值。 */
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
/** syncHeavenGateState：执行对应的业务逻辑。 */
    syncHeavenGateState(player, realm) {
        if (!this.hasReachedHeavenGateRealm(realm.realmLv)) {
            player.heavenGate = null;
            player.spiritualRoots = null;
            return null;
        }
/** persisted：定义该变量以承载业务值。 */
        const persisted = normalizeHeavenGateState(player.heavenGate);
/** resolvedRoots：定义该变量以承载业务值。 */
        const resolvedRoots = persisted?.roots
            ? cloneHeavenGateRoots(persisted.roots)
            : normalizeHeavenGateRoots(player.spiritualRoots);
/** entered：定义该变量以承载业务值。 */
        const entered = persisted?.entered === true || (resolvedRoots !== null && player.spiritualRoots !== null);
/** unlocked：定义该变量以承载业务值。 */
        const unlocked = persisted?.unlocked === true || entered || this.hasReachedHeavenGateRealm(realm.realmLv);
/** nextState：定义该变量以承载业务值。 */
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
/** hasCompletedHeavenGate：执行对应的业务逻辑。 */
    hasCompletedHeavenGate(player) {
/** heavenGate：定义该变量以承载业务值。 */
        const heavenGate = normalizeHeavenGateState(player.heavenGate);
        return heavenGate?.entered === true || normalizeHeavenGateRoots(player.spiritualRoots) !== null;
    }
/** hasReachedHeavenGateRealm：执行对应的业务逻辑。 */
    hasReachedHeavenGateRealm(realmLv) {
        return realmLv >= HEAVEN_GATE_REALM_LEVEL;
    }
/** getHeavenGateSeverCost：执行对应的业务逻辑。 */
    getHeavenGateSeverCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.1));
    }
/** getHeavenGateRerollCost：执行对应的业务逻辑。 */
    getHeavenGateRerollCost(realm) {
        return Math.max(1, Math.round(realm.progressToNext * 0.25));
    }
/** weightedPickHeavenGateSegment：执行对应的业务逻辑。 */
    weightedPickHeavenGateSegment(segments) {
/** totalWeight：定义该变量以承载业务值。 */
        const totalWeight = segments.reduce((sum, segment) => sum + segment.weight, 0);
/** cursor：定义该变量以承载业务值。 */
        let cursor = Math.random() * totalWeight;
        for (const segment of segments) {
            cursor -= segment.weight;
            if (cursor <= 0) {
                return segment;
            }
        }
        return segments[segments.length - 1];
    }
/** randomHeavenGateInt：执行对应的业务逻辑。 */
    randomHeavenGateInt(min, max) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
/** getHeavenGateExtraPerfectRootKeepChance：执行对应的业务逻辑。 */
    getHeavenGateExtraPerfectRootKeepChance(averageBonus) {
/** bonus：定义该变量以承载业务值。 */
        const bonus = Math.max(0, averageBonus);
        if (bonus <= 0) {
            return 1;
        }
/** squaredBonus：定义该变量以承载业务值。 */
        const squaredBonus = bonus * bonus;
/** squaredSoftCap：定义该变量以承载业务值。 */
        const squaredSoftCap = HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP * HEAVEN_GATE_EXTRA_PERFECT_ROOT_SOFT_CAP;
        return squaredBonus / (squaredBonus + squaredSoftCap);
    }
/** distributeHeavenGateRoots：执行对应的业务逻辑。 */
    distributeHeavenGateRoots(total, remaining) {
/** result：定义该变量以承载业务值。 */
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
/** spread：定义该变量以承载业务值。 */
        const spread = HEAVEN_GATE_DISTRIBUTION_SPREAD[remaining.length] ?? 0.18;
/** scores：定义该变量以承载业务值。 */
        const scores = remaining.map(() => Math.max(0.08, 1 + (Math.random() * 2 - 1) * spread));
/** scoreSum：定义该变量以承载业务值。 */
        const scoreSum = scores.reduce((sum, score) => sum + score, 0);
/** remainder：定义该变量以承载业务值。 */
        const remainder = Math.max(0, total - remaining.length);
/** allocations：定义该变量以承载业务值。 */
        const allocations = remaining.map((element, index) => ({
            element,
            extra: Math.min(99, Math.floor((remainder * scores[index]) / scoreSum)),
            fraction: (remainder * scores[index]) / scoreSum,
        }));
/** allocated：定义该变量以承载业务值。 */
        let allocated = allocations.reduce((sum, entry) => sum + entry.extra, 0);
/** sorted：定义该变量以承载业务值。 */
        const sorted = [...allocations].sort((left, right) => right.fraction - left.fraction);
/** cursor：定义该变量以承载业务值。 */
        let cursor = 0;
        while (allocated < remainder) {
/** target：定义该变量以承载业务值。 */
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
/** softenHeavenGatePerfectRoots：执行对应的业务逻辑。 */
    softenHeavenGatePerfectRoots(roots, averageBonus) {
/** keepChance：定义该变量以承载业务值。 */
        const keepChance = this.getHeavenGateExtraPerfectRootKeepChance(averageBonus);
/** preservedPerfectCount：定义该变量以承载业务值。 */
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
/** rollHeavenGateRoots：执行对应的业务逻辑。 */
    rollHeavenGateRoots(severed, averageBonus) {
/** remaining：定义该变量以承载业务值。 */
        const remaining = ELEMENT_KEYS.filter((element) => !severed.includes(element));
/** segments：定义该变量以承载业务值。 */
        const segments = HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[remaining.length] ?? HEAVEN_GATE_AVERAGE_QUALITY_SEGMENTS[1];
/** segment：定义该变量以承载业务值。 */
        const segment = this.weightedPickHeavenGateSegment(segments);
/** average：定义该变量以承载业务值。 */
        const average = Math.min(100, this.randomHeavenGateInt(segment.min, segment.max) + Math.max(0, averageBonus));
/** roots：定义该变量以承载业务值。 */
        const roots = this.distributeHeavenGateRoots(average * remaining.length, [...remaining]);
        return this.softenHeavenGatePerfectRoots(roots, averageBonus);
    }
/** consumeInventoryItemById：执行对应的业务逻辑。 */
    consumeInventoryItemById(player, itemId, count) {
/** remaining：定义该变量以承载业务值。 */
        let remaining = count;
        for (let index = player.inventory.items.length - 1; index >= 0 && remaining > 0; index -= 1) {
            const item = player.inventory.items[index];
            if (!item || item.itemId !== itemId) {
                continue;
            }
/** consumed：定义该变量以承载业务值。 */
            const consumed = Math.min(item.count, remaining);
            item.count -= consumed;
            remaining -= consumed;
            if (item.count <= 0) {
                player.inventory.items.splice(index, 1);
            }
        }
    }
/** gainRealmProgressInternal：执行对应的业务逻辑。 */
    gainRealmProgressInternal(player, amount, options) {
/** normalized：定义该变量以承载业务值。 */
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
/** realm：定义该变量以承载业务值。 */
        const realm = this.normalizeRealmState(player.realm);
/** canAdvanceRealm：定义该变量以承载业务值。 */
        const canAdvanceRealm = realm.progressToNext > 0 && realm.realmLv < this.maxRealmLevel;
/** nextProgress：定义该变量以承载业务值。 */
        let nextProgress = realm.progress;
/** foundationChanged：定义该变量以承载业务值。 */
        let foundationChanged = false;
/** combatExpChanged：定义该变量以承载业务值。 */
        let combatExpChanged = false;
        if (canAdvanceRealm) {
/** room：定义该变量以承载业务值。 */
            const room = Math.max(0, realm.progressToNext - nextProgress);
            if (room > 0) {
                nextProgress += Math.min(room, normalized);
            }
            if (options.useFoundation === true && nextProgress < realm.progressToNext && player.foundation > 0) {
/** foundationSpent：定义该变量以承载业务值。 */
                const foundationSpent = Math.min(player.foundation, realm.progressToNext - nextProgress);
                if (foundationSpent > 0) {
                    player.foundation -= foundationSpent;
                    nextProgress += foundationSpent;
                    foundationChanged = true;
                }
            }
        }
        if (options.overflowToFoundation === true) {
/** overflow：定义该变量以承载业务值。 */
            const overflow = canAdvanceRealm
                ? Math.max(0, normalized - Math.max(0, nextProgress - realm.progress))
                : normalized;
            if (overflow > 0) {
                player.foundation += overflow;
                foundationChanged = true;
            }
        }
        if (options.trackCombatExp === true) {
/** combatExpGain：定义该变量以承载业务值。 */
            const combatExpGain = normalizeProgressionAmount(normalized * normalizeCombatExpMultiplier(options.combatExpMultiplier));
            if (combatExpGain > 0) {
                player.combatExp += combatExpGain;
                combatExpChanged = true;
            }
        }
/** nextRealm：定义该变量以承载业务值。 */
        const nextRealm = this.createRealmStateFromLevel(realm.realmLv, nextProgress);
/** realmChanged：定义该变量以承载业务值。 */
        const realmChanged = nextRealm.progress !== realm.progress
            || nextRealm.breakthroughReady !== realm.breakthroughReady;
/** attrRecalculated：定义该变量以承载业务值。 */
        const attrRecalculated = realmChanged
            ? this.applyResolvedRealmState(player, nextRealm, { bumpPersistentRevision: false })
            : false;
/** notices：定义该变量以承载业务值。 */
        const notices = !realm.breakthroughReady && nextRealm.breakthroughReady
            ? [{
                    text: `${nextRealm.displayName}修为已圆满，可以尝试突破。`,
                    kind: 'success',
                }]
            : [];
/** changed：定义该变量以承载业务值。 */
        const changed = realmChanged || foundationChanged || combatExpChanged;
        return {
            changed,
            panelDirty: !attrRecalculated && (foundationChanged || combatExpChanged),
            attrRecalculated,
            techniquesDirty: false,
/** actionsDirty：定义该变量以承载业务值。 */
            actionsDirty: nextRealm.breakthroughReady !== realm.breakthroughReady,
            notices,
        };
    }
/** resolveCultivatingTechnique：执行对应的业务逻辑。 */
    resolveCultivatingTechnique(player) {
/** currentTechId：定义该变量以承载业务值。 */
        const currentTechId = player.techniques.cultivatingTechId;
        if (!currentTechId) {
            return null;
        }
        return player.techniques.techniques.find((entry) => entry.techId === currentTechId) ?? null;
    }
/** resolveActiveCultivatingTechnique：执行对应的业务逻辑。 */
    resolveActiveCultivatingTechnique(player) {
/** current：定义该变量以承载业务值。 */
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
/** next：定义该变量以承载业务值。 */
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
/** clearInvalidCultivation：执行对应的业务逻辑。 */
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
/** findNextCultivatingTechnique：执行对应的业务逻辑。 */
    findNextCultivatingTechnique(player, currentTechId) {
/** total：定义该变量以承载业务值。 */
        const total = player.techniques.techniques.length;
        if (total <= 1) {
            return null;
        }
/** currentIndex：定义该变量以承载业务值。 */
        const currentIndex = player.techniques.techniques.findIndex((entry) => entry.techId === currentTechId);
        for (let offset = 1; offset < total; offset += 1) {
            const candidate = player.techniques.techniques[(Math.max(0, currentIndex) + offset) % total];
            if (candidate && !this.isTechniqueMaxed(candidate)) {
                return candidate;
            }
        }
        return null;
    }
/** isTechniqueMaxed：执行对应的业务逻辑。 */
    isTechniqueMaxed(technique) {
/** level：定义该变量以承载业务值。 */
        const level = Math.max(1, Math.floor(technique.level ?? 1));
/** maxLevel：定义该变量以承载业务值。 */
        const maxLevel = (0, shared_1.getTechniqueMaxLevel)(technique.layers ?? undefined, level, technique.attrCurves ?? undefined);
        return level >= maxLevel || (technique.expToNext ?? 0) <= 0;
    }
/** advanceTechniqueProgressInternal：执行对应的业务逻辑。 */
    advanceTechniqueProgressInternal(player, amount) {
/** resolved：定义该变量以承载业务值。 */
        const resolved = this.resolveActiveCultivatingTechnique(player);
        if (!resolved.technique) {
            return resolved;
        }
/** technique：定义该变量以承载业务值。 */
        const technique = resolved.technique;
/** techniqueExpAdjustment：定义该变量以承载业务值。 */
        const techniqueExpAdjustment = (0, shared_1.getTechniqueExpLevelAdjustment)(player.realm?.realmLv, technique.realmLv);
/** normalized：定义该变量以承载业务值。 */
        const normalized = normalizeProgressionAmount(amount * techniqueExpAdjustment);
        if (normalized <= 0) {
            return resolved;
        }
/** previousLevel：定义该变量以承载业务值。 */
        const previousLevel = Math.max(1, Math.floor(technique.level ?? 1));
/** previousExp：定义该变量以承载业务值。 */
        const previousExp = Math.max(0, Math.floor(technique.exp ?? 0));
/** maxLevel：定义该变量以承载业务值。 */
        const maxLevel = (0, shared_1.getTechniqueMaxLevel)(technique.layers ?? undefined, previousLevel, technique.attrCurves ?? undefined);
        if (previousLevel >= maxLevel || (technique.expToNext ?? 0) <= 0) {
            return resolved;
        }
        technique.level = previousLevel;
        technique.exp = previousExp + normalized;
/** notices：定义该变量以承载业务值。 */
        const notices = [...resolved.notices];
/** attrRecalculated：定义该变量以承载业务值。 */
        let attrRecalculated = resolved.attrRecalculated;
/** actionsDirty：定义该变量以承载业务值。 */
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
/** mutation：定义该变量以承载业务值。 */
        let mutation = {
            changed: true,
            panelDirty: false,
            attrRecalculated,
            techniquesDirty: true,
            actionsDirty,
            notices,
        };
        if (technique.level >= maxLevel && player.combat.autoSwitchCultivation === true) {
/** switched：定义该变量以承载业务值。 */
            const switched = this.resolveActiveCultivatingTechnique(player);
            if (switched.technique?.techId !== technique.techId) {
                mutation = mergeProgressionMutation(mutation, switched);
            }
        }
        return mutation;
    }
/** getRealmCombatExp：执行对应的业务逻辑。 */
    getRealmCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {
/** level：定义该变量以承载业务值。 */
        const level = Math.max(1, Math.floor(monsterLevel));
/** expToNext：定义该变量以承载业务值。 */
        const expToNext = Math.max(0, this.realmLevels.get(level)?.expToNext ?? 0);
        if (expToNext <= 0) {
            return 0;
        }
/** levelAdjustment：定义该变量以承载业务值。 */
        const levelAdjustment = getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
        return expToNext
            * Math.max(0, expMultiplier)
            * levelAdjustment
            * clamp(contributionRatio, 0, 1)
            / 1000;
    }
/** getTechniqueCombatExp：执行对应的业务逻辑。 */
    getTechniqueCombatExp(monsterLevel, playerRealmLv, monsterTier, expMultiplier = 1, contributionRatio = 1) {
/** level：定义该变量以承载业务值。 */
        const level = Math.max(1, Math.floor(monsterLevel));
/** expToNext：定义该变量以承载业务值。 */
        const expToNext = Math.max(0, this.realmLevels.get(level)?.expToNext ?? 0);
        if (expToNext <= 0) {
            return 0;
        }
/** levelAdjustment：定义该变量以承载业务值。 */
        const levelAdjustment = getMonsterKillRealmExpAdjustment(playerRealmLv, level, monsterTier);
        return expToNext
            * Math.max(0, expMultiplier)
            * levelAdjustment
            * clamp(contributionRatio, 0, 1)
            / 200;
    }
/** finalizeProgressionMutation：执行对应的业务逻辑。 */
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
/** finalizePresentationMutation：执行对应的业务逻辑。 */
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
/** resolveStageForRealmLevel：执行对应的业务逻辑。 */
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
/** resolveRealmLevelFromStage：执行对应的业务逻辑。 */
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
/** formatTechniqueRealmLabel：执行对应的业务逻辑。 */
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
/** createEmptyMutation：执行对应的业务逻辑。 */
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
/** mergeProgressionMutation：执行对应的业务逻辑。 */
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
/** notices：定义该变量以承载业务值。 */
        notices: left.notices.length === 0
            ? right.notices
            : right.notices.length === 0
                ? left.notices
                : [...left.notices, ...right.notices],
    };
}
/** applyRateBonus：执行对应的业务逻辑。 */
function applyRateBonus(baseGain, bonusRateBp, minimumGain = 1) {
/** normalizedBaseGain：定义该变量以承载业务值。 */
    const normalizedBaseGain = Number(baseGain);
    if (!Number.isFinite(normalizedBaseGain) || normalizedBaseGain <= 0) {
        return 0;
    }
/** normalizedBonusRate：定义该变量以承载业务值。 */
    const normalizedBonusRate = Number.isFinite(bonusRateBp)
        ? Math.max(0, Number(bonusRateBp)) / 10000
        : 0;
/** exactGain：定义该变量以承载业务值。 */
    const exactGain = Math.max(minimumGain, normalizedBaseGain * (1 + normalizedBonusRate));
/** guaranteed：定义该变量以承载业务值。 */
    const guaranteed = Math.floor(exactGain);
/** remainder：定义该变量以承载业务值。 */
    const remainder = exactGain - guaranteed;
    if (remainder <= 0) {
        return guaranteed;
    }
    return guaranteed + (Math.random() < remainder ? 1 : 0);
}
/** getMonsterKillRealmExpAdjustment：执行对应的业务逻辑。 */
function getMonsterKillRealmExpAdjustment(playerRealmLv, monsterLevel, monsterTier) {
    return (0, shared_1.getMonsterKillExpLevelAdjustment)(playerRealmLv, monsterLevel, monsterTier);
}
/** snapshotCultivatingTechnique：执行对应的业务逻辑。 */
function snapshotCultivatingTechnique(player) {
/** techId：定义该变量以承载业务值。 */
    const techId = player.techniques.cultivatingTechId;
    if (!techId) {
        return {
            techId: null,
            name: null,
            level: 0,
            exp: 0,
        };
    }
/** technique：定义该变量以承载业务值。 */
    const technique = player.techniques.techniques.find((entry) => entry.techId === techId);
    return {
        techId,
        name: technique?.name ?? techId,
        level: Math.max(0, Math.floor(technique?.level ?? 0)),
        exp: Math.max(0, Math.floor(technique?.exp ?? 0)),
    };
}
/** calculateRealmProgressGain：执行对应的业务逻辑。 */
function calculateRealmProgressGain(previousRealmLv, previousProgress, currentRealm) {
    if (!currentRealm) {
        return 0;
    }
    if (currentRealm.realmLv !== previousRealmLv) {
        return Math.max(0, currentRealm.progress);
    }
    return Math.max(0, currentRealm.progress - previousProgress);
}
/** calculateTechniqueGain：执行对应的业务逻辑。 */
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
/** createEmptyRoots：执行对应的业务逻辑。 */
function createEmptyRoots() {
    return {
        metal: 0,
        wood: 0,
        water: 0,
        fire: 0,
        earth: 0,
    };
}
/** cloneHeavenGateRoots：执行对应的业务逻辑。 */
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
/** normalizeHeavenGateRoots：执行对应的业务逻辑。 */
function normalizeHeavenGateRoots(roots) {
/** normalized：定义该变量以承载业务值。 */
    const normalized = cloneHeavenGateRoots(roots);
    if (!normalized) {
        return null;
    }
    return ELEMENT_KEYS.some((element) => normalized[element] > 0) ? normalized : null;
}
/** normalizeHeavenGateState：执行对应的业务逻辑。 */
function normalizeHeavenGateState(state) {
    if (!state) {
        return null;
    }
/** severed：定义该变量以承载业务值。 */
    const severed = state.severed
        .filter((element) => ELEMENT_KEYS.includes(element))
        .slice(0, HEAVEN_GATE_MAX_SEVERED);
/** roots：定义该变量以承载业务值。 */
    const roots = normalizeHeavenGateRoots(state.roots);
/** entered：定义该变量以承载业务值。 */
    const entered = state.entered === true;
/** averageBonus：定义该变量以承载业务值。 */
    const averageBonus = Math.max(0, Math.floor(Number(state.averageBonus) || 0));
/** unlocked：定义该变量以承载业务值。 */
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
/** getInventoryCount：执行对应的业务逻辑。 */
function getInventoryCount(player, itemId) {
/** total：定义该变量以承载业务值。 */
    let total = 0;
    for (const entry of player.inventory.items) {
        if (entry.itemId === itemId) {
            total += entry.count;
        }
    }
    return total;
}
/** normalizePositiveInt：执行对应的业务逻辑。 */
function normalizePositiveInt(value, fallback) {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : fallback;
}
/** normalizeProgressionAmount：执行对应的业务逻辑。 */
function normalizeProgressionAmount(value) {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
}
/** normalizeProgressionTicks：执行对应的业务逻辑。 */
function normalizeProgressionTicks(value) {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}
/** normalizeCombatExpMultiplier：执行对应的业务逻辑。 */
function normalizeCombatExpMultiplier(value) {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 1;
}
/** normalizeNullablePositiveInt：执行对应的业务逻辑。 */
function normalizeNullablePositiveInt(value) {
/** numeric：定义该变量以承载业务值。 */
    const numeric = Number(value);
    return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}
/** isSameHeavenGateRoots：执行对应的业务逻辑。 */
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
/** clamp：执行对应的业务逻辑。 */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=player-progression.service.js.map
