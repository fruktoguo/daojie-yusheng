// @ts-nocheck
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
exports.CraftPanelEnhancementQueryService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const content_template_repository_1 = require("../../content/content-template.repository");

const ENHANCEMENT_HAMMER_TAG = 'enhancement_hammer';
const MAX_ENHANCE_LEVEL = 20;
const ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL = 0.002;
const ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL = 0.02;
const ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY = 0.1;
const ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL = [
    0.5, 0.45, 0.45, 0.4, 0.4, 0.4, 0.35, 0.35, 0.35, 0.35,
    0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3,
];

/** 强化面板只读查询服务：负责强化面板状态与候选列表构造。 */
let CraftPanelEnhancementQueryService = class CraftPanelEnhancementQueryService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository) {
        this.contentTemplateRepository = contentTemplateRepository;
    }    
    /**
 * buildEnhancementPanelPayload：构建并返回目标对象。
 * @param player 玩家对象。
 * @param enhancementConfigs 参数说明。
 * @returns 无返回值，直接更新强化面板载荷相关状态。
 */

    buildEnhancementPanelPayload(player, enhancementConfigs) {
        const state = this.buildEnhancementPanelState(player, enhancementConfigs);
        return {
            state,
            error: state ? undefined : '尚未装备强化锤。',
        };
    }    
    /**
 * buildEnhancementPanelState：构建并返回目标对象。
 * @param player 玩家对象。
 * @param enhancementConfigs 参数说明。
 * @returns 无返回值，直接更新强化面板状态相关状态。
 */

    buildEnhancementPanelState(player, enhancementConfigs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const hammer = getWeapon(player);
        const hammerItemId = hammer?.tags?.includes(ENHANCEMENT_HAMMER_TAG) ? hammer.itemId : undefined;
        if (!hammerItemId && !player.enhancementJob) {
            return null;
        }
        return {
            hammerItemId,
            enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
            candidates: this.collectEnhancementCandidates(player, enhancementConfigs),
            records: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
            job: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob) : null,
        };
    }    
    /**
 * collectEnhancementCandidates：判断强化Candidate是否满足条件。
 * @param player 玩家对象。
 * @param enhancementConfigs 参数说明。
 * @returns 无返回值，直接更新强化Candidate相关状态。
 */

    collectEnhancementCandidates(player, enhancementConfigs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const candidates = [];
        player.inventory.items.forEach((item, slotIndex) => {
            const candidate = this.buildEnhancementCandidate(player, { source: 'inventory', slotIndex }, item, enhancementConfigs);
            if (candidate) {
                candidates.push(candidate);
            }
        });
        for (const slot of shared_1.EQUIP_SLOTS) {
            const item = getEquippedItem(player, slot);
            if (!item) {
                continue;
            }
            const candidate = this.buildEnhancementCandidate(player, { source: 'equipment', slot }, item, enhancementConfigs);
            if (candidate) {
                candidates.push(candidate);
            }
        }
        candidates.sort((left, right) => {
            if (left.item.level !== right.item.level) {
                return left.item.level - right.item.level;
            }
            if (left.currentLevel !== right.currentLevel) {
                return left.currentLevel - right.currentLevel;
            }
            return left.item.itemId.localeCompare(right.item.itemId, 'zh-Hans-CN');
        });
        return candidates;
    }    
    /**
 * buildEnhancementCandidate：构建并返回目标对象。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param item 道具。
 * @param enhancementConfigs 参数说明。
 * @returns 无返回值，直接更新强化Candidate相关状态。
 */

    buildEnhancementCandidate(player, ref, item, enhancementConfigs) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (!item || item.type !== 'equipment') {
            return null;
        }
        const currentLevel = normalizeEnhanceLevel(item.enhanceLevel);
        if (currentLevel >= MAX_ENHANCE_LEVEL) {
            return null;
        }
        const nextLevel = currentLevel + 1;
        const hammer = getWeapon(player);
        const enhancementSkillLevel = Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1));
        const config = enhancementConfigs.get(item.itemId);
        const requirements = getEnhancementRequirements(config, nextLevel);
        const totalSpeedRate = computeEnhancementToolSpeedRate(hammer?.enhancementSpeedRate, enhancementSkillLevel, item.level);
        return {
            ref,
            item: cloneItem(item),
            currentLevel,
            nextLevel,
            spiritStoneCost: getEnhancementSpiritStoneCost(item.level, requirements.length > 0),
            successRate: computeEnhancementAdjustedSuccessRate(nextLevel, enhancementSkillLevel, item.level, hammer?.enhancementSuccessRate),
            durationTicks: computeEnhancementJobTicks(item.level, totalSpeedRate),
            materials: requirements.map((entry) => ({
                itemId: entry.itemId,
                name: this.contentTemplateRepository.getItemName(entry.itemId) ?? entry.itemId,
                count: entry.count,
                ownedCount: countInventoryItem(player, entry.itemId),
            })),
            protectionItemId: config?.protectionItemId,
            protectionItemName: config?.protectionItemId
                ? (this.contentTemplateRepository.getItemName(config.protectionItemId) ?? config.protectionItemId)
                : undefined,
            allowSelfProtection: !config?.protectionItemId,
            protectionCandidates: buildProtectionCandidates(player, ref, item, config),
        };
    }
};
exports.CraftPanelEnhancementQueryService = CraftPanelEnhancementQueryService;
exports.CraftPanelEnhancementQueryService = CraftPanelEnhancementQueryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository])
], CraftPanelEnhancementQueryService);
export { CraftPanelEnhancementQueryService };
/**
 * getEnhancementRequirements：读取强化Requirement。
 * @param config 参数说明。
 * @param targetLevel 参数说明。
 * @returns 无返回值，完成强化Requirement的读取/组装。
 */


function getEnhancementRequirements(config, targetLevel) {
    const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetLevel);
    return (step?.materials ?? []).map((entry) => ({ ...entry }));
}
/**
 * getWeapon：读取Weapon。
 * @param player 玩家对象。
 * @returns 无返回值，完成Weapon的读取/组装。
 */

function getWeapon(player) {
    return getEquippedItem(player, 'weapon');
}
/**
 * getEquippedItem：读取Equipped道具。
 * @param player 玩家对象。
 * @param slot 参数说明。
 * @returns 无返回值，完成Equipped道具的读取/组装。
 */

function getEquippedItem(player, slot) {
    return player.equipment?.slots?.find((entry) => entry.slot === slot)?.item ?? null;
}
/**
 * buildProtectionCandidates：构建并返回目标对象。
 * @param player 玩家对象。
 * @param ref 参数说明。
 * @param item 道具。
 * @param config 参数说明。
 * @returns 无返回值，直接更新ProtectionCandidate相关状态。
 */

function buildProtectionCandidates(player, ref, item, config) {
    const candidates = [];
    const targetProtectionItemId = config?.protectionItemId ?? item.itemId;
    player.inventory.items.forEach((entry, slotIndex) => {
        if (!entry || !isEligibleProtectionItem(entry, targetProtectionItemId, item.itemId)) {
            return;
        }
        if (ref.source === 'inventory' && ref.slotIndex === slotIndex) {
            return;
        }
        candidates.push({
            ref: { source: 'inventory', slotIndex },
            item: cloneItem(entry),
        });
    });
    return candidates;
}
/**
 * isEligibleProtectionItem：判断EligibleProtection道具是否满足条件。
 * @param item 道具。
 * @param protectionItemId protectionItem ID。
 * @param targetItemId targetItem ID。
 * @returns 无返回值，完成EligibleProtection道具的条件判断。
 */

function isEligibleProtectionItem(item, protectionItemId, targetItemId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!item || item.itemId !== protectionItemId) {
        return false;
    }
    if (protectionItemId !== targetItemId) {
        return true;
    }
    return item.type === 'equipment' && normalizeEnhanceLevel(item.enhanceLevel) === 0;
}
/**
 * cloneItem：构建道具。
 * @param item 道具。
 * @returns 无返回值，直接更新道具相关状态。
 */

function cloneItem(item) {
    return {
        ...item,
        equipAttrs: item.equipAttrs ? { ...item.equipAttrs } : undefined,
        equipStats: item.equipStats ? clonePartialNumericStats(item.equipStats) : undefined,
        equipValueStats: item.equipValueStats ? { ...item.equipValueStats } : undefined,
        consumeBuffs: Array.isArray(item.consumeBuffs) ? item.consumeBuffs.map((entry) => ({ ...entry })) : undefined,
        effects: Array.isArray(item.effects) ? item.effects.map((entry) => ({ ...entry })) : undefined,
        tags: Array.isArray(item.tags) ? item.tags.slice() : undefined,
    };
}
/**
 * clonePartialNumericStats：构建PartialNumericStat。
 * @param stats 参数说明。
 * @returns 无返回值，直接更新PartialNumericStat相关状态。
 */

function clonePartialNumericStats(stats) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    if (!stats) {
        return undefined;
    }
    const clone = { ...stats };
    if (stats.elementDamageBonus) {
        clone.elementDamageBonus = { ...stats.elementDamageBonus };
    }
    if (stats.elementDamageReduce) {
        clone.elementDamageReduce = { ...stats.elementDamageReduce };
    }
    return clone;
}
/**
 * cloneEnhancementRecord：构建强化Record。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Record相关状态。
 */

function cloneEnhancementRecord(entry) {
    return {
        ...entry,
        levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
    };
}
/**
 * cloneEnhancementJob：构建强化Job。
 * @param entry 参数说明。
 * @returns 无返回值，直接更新强化Job相关状态。
 */

function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        item: cloneItem(entry.item),
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}
/**
 * countInventoryItem：执行数量背包道具相关逻辑。
 * @param player 玩家对象。
 * @param itemId 道具 ID。
 * @returns 无返回值，直接更新数量背包道具相关状态。
 */

function countInventoryItem(player, itemId) {
    return player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
}
/**
 * normalizeEnhanceLevel：规范化或转换Enhance等级。
 * @param level 参数说明。
 * @returns 无返回值，直接更新Enhance等级相关状态。
 */

function normalizeEnhanceLevel(level) {
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
}
/**
 * getEnhancementSpiritStoneCost：读取强化SpiritStone消耗。
 * @param itemLevel 参数说明。
 * @param hasMaterialCost 参数说明。
 * @returns 无返回值，完成强化SpiritStone消耗的读取/组装。
 */

function getEnhancementSpiritStoneCost(itemLevel, hasMaterialCost = false) {
    const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
    return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}
/**
 * computeEnhancementToolSpeedRate：执行强化ToolSpeedRate相关逻辑。
 * @param toolBaseSpeedRate 参数说明。
 * @param roleEnhancementLevel 参数说明。
 * @param targetItemLevel 参数说明。
 * @returns 无返回值，直接更新强化ToolSpeedRate相关状态。
 */

function computeEnhancementToolSpeedRate(toolBaseSpeedRate, roleEnhancementLevel, targetItemLevel) {
    const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
    const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
    const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
    return baseSpeedRate + levelBonus;
}
/**
 * computeEnhancementAdjustedSuccessRate：执行强化AdjustedSuccessRate相关逻辑。
 * @param targetEnhanceLevel 参数说明。
 * @param roleEnhancementLevel 参数说明。
 * @param targetItemLevel 参数说明。
 * @param toolSuccessRateModifier 参数说明。
 * @returns 无返回值，直接更新强化AdjustedSuccessRate相关状态。
 */

function computeEnhancementAdjustedSuccessRate(targetEnhanceLevel, roleEnhancementLevel, targetItemLevel, toolSuccessRateModifier = 0) {
    const base = getEnhancementTargetSuccessRate(targetEnhanceLevel);
    const normalizedRoleLevel = Math.max(1, normalizeEnhanceLevel(roleEnhancementLevel));
    const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
    const lowerLevelGap = Math.max(0, targetLevel - normalizedRoleLevel);
    const upperLevelGap = Math.max(0, normalizedRoleLevel - targetLevel);
    const adjustedBaseRate = base * ((1 - ENHANCEMENT_LOWER_LEVEL_SUCCESS_PENALTY) ** lowerLevelGap);
    const totalSuccessModifier = (Number.isFinite(toolSuccessRateModifier) ? Number(toolSuccessRateModifier) : 0)
        + (upperLevelGap * ENHANCEMENT_EXTRA_SUCCESS_RATE_PER_LEVEL);
    return applyEnhancementSuccessModifier(adjustedBaseRate, totalSuccessModifier);
}
/**
 * computeEnhancementJobTicks：执行强化Jobtick相关逻辑。
 * @param itemLevel 参数说明。
 * @param totalSpeedRate 参数说明。
 * @returns 无返回值，直接更新强化Jobtick相关状态。
 */

function computeEnhancementJobTicks(itemLevel, totalSpeedRate) {
    return computeAdjustedCraftTicks(computeEnhancementJobBaseTicks(itemLevel), totalSpeedRate);
}
/**
 * getEnhancementTargetSuccessRate：读取强化目标SuccessRate。
 * @param targetEnhanceLevel 参数说明。
 * @returns 无返回值，完成强化目标SuccessRate的读取/组装。
 */

function getEnhancementTargetSuccessRate(targetEnhanceLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
    const index = Math.min(normalizedLevel, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
    return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}
/**
 * computeEnhancementJobBaseTicks：执行强化JobBasetick相关逻辑。
 * @param itemLevel 参数说明。
 * @returns 无返回值，直接更新强化JobBasetick相关状态。
 */

function computeEnhancementJobBaseTicks(itemLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
    return 5 + Math.max(0, normalizedLevel - 1) * 1;
}
/**
 * computeAdjustedCraftTicks：执行Adjusted炼制tick相关逻辑。
 * @param baseTicks 参数说明。
 * @param speedRate 参数说明。
 * @returns 无返回值，直接更新Adjusted炼制tick相关状态。
 */

function computeAdjustedCraftTicks(baseTicks, speedRate) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedBaseTicks = Math.max(1, Math.floor(Number(baseTicks) || 1));
    const normalizedSpeedRate = Number.isFinite(speedRate) ? Number(speedRate) : 0;
    if (normalizedSpeedRate === 0) {
        return normalizedBaseTicks;
    }
    if (normalizedSpeedRate > 0) {
        return Math.max(1, Math.ceil(normalizedBaseTicks / (1 + normalizedSpeedRate)));
    }
    return Math.max(1, Math.ceil(normalizedBaseTicks * (1 + Math.abs(normalizedSpeedRate))));
}
/**
 * applyEnhancementSuccessModifier：处理强化SuccessModifier并更新相关状态。
 * @param baseRate 参数说明。
 * @param modifier 参数说明。
 * @returns 无返回值，直接更新强化SuccessModifier相关状态。
 */

function applyEnhancementSuccessModifier(baseRate, modifier) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

    const normalizedBaseRate = Math.max(0, Math.min(1, Number.isFinite(baseRate) ? Number(baseRate) : 0));
    if (normalizedBaseRate <= 0 || normalizedBaseRate >= 1) {
        return normalizedBaseRate;
    }
    const normalizedModifier = Number.isFinite(modifier) ? Number(modifier) : 0;
    if (normalizedModifier === 0) {
        return normalizedBaseRate;
    }
    if (normalizedModifier < 0) {
        return normalizedBaseRate / (1 + Math.abs(normalizedModifier));
    }
    const factor = 1 + normalizedModifier;
    if (normalizedBaseRate <= 0.5) {
        const scaledSuccess = normalizedBaseRate * factor;
        if (scaledSuccess <= 0.5) {
            return scaledSuccess;
        }
        return 1 - (0.25 / scaledSuccess);
    }
    return 1 - ((1 - normalizedBaseRate) / factor);
}
