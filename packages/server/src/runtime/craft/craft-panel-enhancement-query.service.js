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
    contentTemplateRepository;
    constructor(contentTemplateRepository) {
        this.contentTemplateRepository = contentTemplateRepository;
    }
    buildEnhancementPanelPayload(player, enhancementConfigs) {
        const state = this.buildEnhancementPanelState(player, enhancementConfigs);
        return {
            state,
            error: state ? undefined : '尚未装备强化锤。',
        };
    }
    buildEnhancementPanelState(player, enhancementConfigs) {
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
    collectEnhancementCandidates(player, enhancementConfigs) {
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
    buildEnhancementCandidate(player, ref, item, enhancementConfigs) {
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

function getEnhancementRequirements(config, targetLevel) {
    const step = config?.steps.find((entry) => entry.targetEnhanceLevel === targetLevel);
    return (step?.materials ?? []).map((entry) => ({ ...entry }));
}
function getWeapon(player) {
    return getEquippedItem(player, 'weapon');
}
function getEquippedItem(player, slot) {
    return player.equipment?.slots?.find((entry) => entry.slot === slot)?.item ?? null;
}
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
function isEligibleProtectionItem(item, protectionItemId, targetItemId) {
    if (!item || item.itemId !== protectionItemId) {
        return false;
    }
    if (protectionItemId !== targetItemId) {
        return true;
    }
    return item.type === 'equipment' && normalizeEnhanceLevel(item.enhanceLevel) === 0;
}
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
function clonePartialNumericStats(stats) {
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
function cloneEnhancementRecord(entry) {
    return {
        ...entry,
        levels: Array.isArray(entry.levels) ? entry.levels.map((level) => ({ ...level })) : [],
    };
}
function cloneEnhancementJob(entry) {
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        item: cloneItem(entry.item),
        materials: Array.isArray(entry.materials) ? entry.materials.map((material) => ({ ...material })) : [],
    };
}
function countInventoryItem(player, itemId) {
    return player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
}
function normalizeEnhanceLevel(level) {
    return Math.min(MAX_ENHANCE_LEVEL, Math.max(0, Math.floor(Number(level) || 0)));
}
function getEnhancementSpiritStoneCost(itemLevel, hasMaterialCost = false) {
    const level = Number.isFinite(itemLevel) ? Number(itemLevel) : 1;
    return Math.max(1, hasMaterialCost ? Math.floor(level / 10) : Math.ceil(level / 10));
}
function computeEnhancementToolSpeedRate(toolBaseSpeedRate, roleEnhancementLevel, targetItemLevel) {
    const baseSpeedRate = Number.isFinite(toolBaseSpeedRate) ? Number(toolBaseSpeedRate) : 0;
    const targetLevel = Math.max(1, Math.floor(Number(targetItemLevel) || 1));
    const levelBonus = Math.max(0, normalizeEnhanceLevel(roleEnhancementLevel) - targetLevel) * ENHANCEMENT_EXTRA_SPEED_RATE_PER_LEVEL;
    return baseSpeedRate + levelBonus;
}
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
function computeEnhancementJobTicks(itemLevel, totalSpeedRate) {
    return computeAdjustedCraftTicks(computeEnhancementJobBaseTicks(itemLevel), totalSpeedRate);
}
function getEnhancementTargetSuccessRate(targetEnhanceLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(targetEnhanceLevel) || 1));
    const index = Math.min(normalizedLevel, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL.length) - 1;
    return Math.max(0, ENHANCEMENT_TARGET_SUCCESS_RATE_BY_LEVEL[index] ?? 0);
}
function computeEnhancementJobBaseTicks(itemLevel) {
    const normalizedLevel = Math.max(1, Math.floor(Number(itemLevel) || 1));
    return 5 + Math.max(0, normalizedLevel - 1) * 1;
}
function computeAdjustedCraftTicks(baseTicks, speedRate) {
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
function applyEnhancementSuccessModifier(baseRate, modifier) {
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
