/**
 * 强化面板只读查询服务。
 * 负责构造强化面板状态、候选列表、成功率和材料需求，
 * 不修改玩家运行态，仅做只读投影。
 */
import { Injectable } from '@nestjs/common';
import { EQUIP_SLOTS, ENHANCEMENT_HAMMER_TAG, MAX_ENHANCE_LEVEL, applyEquipmentAttributeEffectivenessToItemStack, computeEnhancementAdjustedSuccessRate, computeEnhancementJobTicks, computeEnhancementToolSpeedRate } from '@mud/shared';
import { ContentTemplateRepository } from '../../content/content-template.repository';

/** 强化面板只读查询服务：负责强化面板状态与候选列表构造。 */
@Injectable()
export class CraftPanelEnhancementQueryService {
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository: ContentTemplateRepository) {
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
        };
    }    
    /**
 * buildEnhancementPanelPatchPayload：构建强化面板运行态增量。
 * @param player 玩家对象。
 * @returns 只包含高频刷新需要的任务状态。
 */

    buildEnhancementPanelPatchPayload(player) {
        const activeRecord = player.enhancementJob
            ? (player.enhancementRecords ?? []).find((entry) => entry.itemId === player.enhancementJob.targetItemId)
            : null;
        return {
            statePatch: {
                enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
                job: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob, player) : null,
                queue: clonePlayerCraftQueue(player),
                ...(activeRecord ? { records: [cloneEnhancementRecord(activeRecord)] } : {}),
            },
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
        return {
            hammerItemId,
            enhancementSkillLevel: Math.max(1, Math.floor(Number(player.enhancementSkill?.level ?? player.enhancementSkillLevel) || 1)),
            candidates: this.collectEnhancementCandidates(player, enhancementConfigs),
            records: (player.enhancementRecords ?? []).map((entry) => cloneEnhancementRecord(entry)),
            job: player.enhancementJob ? cloneEnhancementJob(player.enhancementJob, player) : null,
            queue: clonePlayerCraftQueue(player),
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
        for (const slot of EQUIP_SLOTS) {
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
            item: summarizeEnhancementItem(item),
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

function cloneCraftQueue(queue) {
    return Array.isArray(queue)
        ? queue.map((entry) => ({ ...entry }))
        : [];
}

function clonePlayerCraftQueue(player) {
    return cloneCraftQueue(player.enhancementJob?.queuedJobs ?? player.forgingJob?.queuedJobs ?? player.alchemyJob?.queuedJobs ?? []);
}
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
    const weapon = getEquippedItem(player, 'weapon');
    return weapon
        ? applyEquipmentAttributeEffectivenessToItemStack(weapon, player?.realm?.realmLv ?? player?.realmLv)
        : null;
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
            const entryCount = Math.max(0, Math.floor(Number(entry.count) || 0));
            if (entryCount < 2) {
                return;
            }
            const summary = summarizeEnhancementItem(entry);
            summary.count = entryCount - 1;
            candidates.push({ ref: { source: 'inventory', slotIndex }, item: summary });
            return;
        }
        candidates.push({
            ref: { source: 'inventory', slotIndex },
            item: summarizeEnhancementItem(entry),
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
    if (!item || typeof item !== 'object') {
        return undefined;
    }
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
 * summarizeEnhancementItem：强化面板只同步可见摘要，完整详情由背包/装备详情链路负责。
 * @param item 道具。
 * @returns 强化面板道具摘要。
 */

function summarizeEnhancementItem(item) {
    return {
        itemId: item.itemId,
        name: item.name,
        type: item.type,
        count: Math.max(0, Math.floor(Number(item.count) || 0)),
        grade: item.grade,
        level: Math.max(1, Math.floor(Number(item.level) || 1)),
        equipSlot: item.equipSlot,
        enhanceLevel: normalizeEnhanceLevel(item.enhanceLevel),
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

function cloneEnhancementJob(entry, player = null) {
    // 强化工件真源在 player.inventory.lockedItems；面板摘要按 itemInstanceId 查表，
    // 若找不到则回落到旧版 entry.item（迁移期残留），再回落到 targetItemId 等基础字段
    let summarySource = null;
    const instanceId = typeof entry?.itemInstanceId === 'string' ? entry.itemInstanceId : '';
    if (instanceId && player?.inventory?.lockedItems) {
        summarySource = player.inventory.lockedItems.find((locked) => locked.itemInstanceId === instanceId) ?? null;
    }
    if (!summarySource && entry?.item && typeof entry.item === 'object') {
        summarySource = entry.item;
    }
    if (!summarySource) {
        summarySource = {
            itemId: entry?.targetItemId,
            name: entry?.targetItemName,
            type: 'equipment',
            count: 1,
            level: entry?.targetItemLevel,
            enhanceLevel: entry?.currentLevel ?? 0,
        };
    }
    return {
        ...entry,
        target: entry.target ? { ...entry.target } : entry.target,
        item: summarizeEnhancementItem(summarySource),
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
    // 灵石（spirit_stone）的 wallet.balances 由 syncWalletCacheFromInventory 全量
    // 镜像自 inventory.items，不是独立账户；craft 实际消费走 debitWallet →
    // consumeInventoryItemCount，从 inventory 扣减。这里统一只读 inventory，
    // 让"持有量计数"与"可消费量"对齐，避免显示翻倍并误判材料充足。
    return player.inventory.items.reduce((total, entry) => entry.itemId === itemId ? total + entry.count : total, 0);
}
/**
 * normalizeEnhanceLevel：规范化或转换Enhance等级。
 * @param level 参数说明。
 * @returns 无返回值，直接更新Enhance等级相关状态。
 */

function normalizeEnhanceLevel(level) {
    return Math.max(0, Math.min(MAX_ENHANCE_LEVEL, Math.floor(Number(level) || 0)));
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
