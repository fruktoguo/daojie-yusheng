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
exports.WorldRuntimePlayerCombatService = void 0;

const common_1 = require("@nestjs/common");

const content_template_repository_1 = require("../../content/content-template.repository");
const pvp_1 = require("../../constants/gameplay/pvp");

const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_inventory_grant_helpers_1 = require("./world-runtime-inventory-grant.helpers");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime player combat outcome：承接玩家战斗结果收口与击杀奖励分发。 */
let WorldRuntimePlayerCombatService = class WorldRuntimePlayerCombatService {
    logger = new common_1.Logger(WorldRuntimePlayerCombatService.name);
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;    
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }    
    /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

    async handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.queuePlayerNotice(killerPlayerId, `${monster.name} 被你斩杀`, 'combat');
        deps.advanceKillQuestProgress(killerPlayerId, monster.monsterId, monster.name);
        this.distributeMonsterKillProgress(instance, monster, killerPlayerId, deps);
        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        const lootRate = killer?.attrs.numericStats.lootRate ?? 0;
        const rareLootRate = killer?.attrs.numericStats.rareLootRate ?? 0;
        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1, lootRate, rareLootRate);
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            await this.deliverMonsterLoot(killerPlayerId, instance, monster.x, monster.y, item, deps, `monster:${monster.runtimeId}:${index}`);
        }
    }    
    /**
 * distributeMonsterKillProgress：判断distribute怪物Kill进度是否满足条件。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新distribute怪物Kill进度相关状态。
 */

    distributeMonsterKillProgress(instance, monster, killerPlayerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const participants = this.resolveMonsterExpParticipants(instance, monster.runtimeId, killerPlayerId);
        const topContributionRealmLv = this.resolveMonsterTopContributionRealmLv(participants);
        let totalContribution = 0;
        for (const participant of participants) {
            totalContribution += participant.contribution;
        }
        for (const participant of participants) {
            const contributionRatio = totalContribution > 0 ? participant.contribution / totalContribution : 1;
            this.playerRuntimeService.grantMonsterKillProgress(participant.playerId, {
                monsterLevel: monster.level,
                monsterName: monster.name,
                monsterTier: monster.tier,
                contributionRatio,
                expAdjustmentRealmLv: Math.max(topContributionRealmLv, participant.realmLv),
                isKiller: participant.playerId === killerPlayerId,
            }, deps.resolveCurrentTickForPlayerId(participant.playerId));
        }
    }    
    /**
 * resolveMonsterExpParticipants：规范化或转换怪物ExpParticipant。
 * @param instance 地图实例。
 * @param runtimeId runtime ID。
 * @param killerPlayerId killerPlayer ID。
 * @returns 无返回值，直接更新怪物ExpParticipant相关状态。
 */

    resolveMonsterExpParticipants(instance, runtimeId, killerPlayerId) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const contributions = instance.getMonsterDamageContributionEntries(runtimeId);
        const participants = [];
        let hasKiller = false;
        for (const entry of contributions) {
            if (entry.damage <= 0) {
                continue;
            }
            const player = this.playerRuntimeService.getPlayer(entry.playerId);
            if (!player || player.instanceId !== instance.meta.instanceId) {
                continue;
            }
            participants.push({
                playerId: player.playerId,
                contribution: entry.damage,
                realmLv: Math.max(1, Math.floor(player.realm?.realmLv ?? 1)),
            });
            if (player.playerId === killerPlayerId) {
                hasKiller = true;
            }
        }
        if (participants.length > 0 && hasKiller) {
            return participants;
        }
        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        if (!killer) {
            return participants;
        }
        participants.push({
            playerId: killerPlayerId,
            contribution: 1,
            realmLv: Math.max(1, Math.floor(killer.realm?.realmLv ?? 1)),
        });
        return participants;
    }    
    /**
 * resolveMonsterTopContributionRealmLv：规范化或转换怪物TopContributionRealmLv。
 * @param participants 参数说明。
 * @returns 无返回值，直接更新怪物TopContributionRealmLv相关状态。
 */

    resolveMonsterTopContributionRealmLv(participants) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let topContribution = 0;
        let topRealmLv = 1;
        for (const participant of participants) {
            if (participant.contribution <= topContribution) {
                continue;
            }
            topContribution = participant.contribution;
            topRealmLv = Math.max(1, participant.realmLv);
        }
        return topRealmLv;
    }    
    /**
 * deliverMonsterLoot：执行deliver怪物掉落相关逻辑。
 * @param playerId 玩家 ID。
 * @param instance 地图实例。
 * @param x X 坐标。
 * @param y Y 坐标。
 * @param item 道具。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新deliver怪物掉落相关状态。
 */

    async deliverMonsterLoot(playerId, instance, x, y, item, deps, sourceRefId = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (player && this.canUseDurableInventoryGrant(player, deps)) {
                await this.grantInventoryItemDurably({
                    playerId,
                    player,
                    item,
                    deps,
                    instance,
                    sourceType: 'monster_loot',
                    sourceRefId: sourceRefId || `monster-loot:${instance?.meta?.instanceId ?? player.instanceId}:${x}:${y}:${item.itemId}`,
                    successNotice: `获得 ${formatItemStackLabel(item)}`,
                    fallbackNotice: `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但本次奖励落盘失败。`,
                    fallbackPosition: { x, y },
                });
                return;
            }
            throw new common_1.ServiceUnavailableException('monster_loot_durable_context_required');
        }
        deps.spawnGroundItem(instance, x, y, item);
        deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, 'loot');
    }    
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    async dispatchDamagePlayer(playerId, amount, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.hp <= 0) {
            await this.handlePlayerDefeat(playerId, deps);
            return;
        }
        const updated = this.playerRuntimeService.applyDamage(playerId, amount);
        this.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            await this.handlePlayerDefeat(playerId, deps);
        }
    }    
    /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

    async handlePlayerDefeat(playerId, deps, killerPlayerId = null) {
        const victim = this.playerRuntimeService.getPlayer(playerId);
        if (!victim || victim.hp > 0) {
            deps.clearPendingCommand(playerId);
            deps.worldRuntimeGmQueueService.markPendingRespawn(playerId);
            return;
        }
        const deathSite = resolvePlayerDeathSite(victim, deps);
        const deathPenalty = this.playerRuntimeService.applyShaInfusionDeathPenalty(playerId);
        pushShaDeathPenaltyMessages(deps, playerId, deathPenalty);
        const killer = typeof killerPlayerId === 'string' && killerPlayerId.trim()
            ? this.playerRuntimeService.getPlayer(killerPlayerId)
            : null;
        if (killer && killer.playerId !== victim.playerId) {
            await this.applyPvPKillRewards(killer, victim, deathSite, deps);
        }
        deps.clearPendingCommand(playerId);
        deps.worldRuntimeGmQueueService.markPendingRespawn(playerId);
    }
    /** 处理玩家互杀奖励与惩罚。 */
    async applyPvPKillRewards(killer, victim, deathSite, deps) {
        if (killer.isBot || victim.isBot || killer.playerId === victim.playerId) {
            return;
        }
        if (killer.combat?.allowAoePlayerHit === true) {
            const nextStacks = this.playerRuntimeService.addPvPShaInfusionStack(killer.playerId);
            deps.queuePlayerNotice(killer.playerId, `杀念入体，煞气入体加深至 ${nextStacks} 层。`, 'combat');
        }
        if (!this.playerRuntimeService.hasActiveBuff(victim.playerId, pvp_1.PVP_SOUL_INJURY_BUFF_ID)) {
            this.playerRuntimeService.applyPvPSoulInjury(victim.playerId);
            deps.queuePlayerNotice(victim.playerId, '神魂受损；身死与遁返都不会清除，需静养一时辰。', 'combat');
        }
        const bloodEssenceCount = Math.max(1, Math.floor((victim.realm?.realmLv ?? 1) ** 2));
        const reward = this.contentTemplateRepository.createItem(pvp_1.BLOOD_ESSENCE_ITEM_ID, bloodEssenceCount);
        if (reward && deathSite.instance) {
            if (this.playerRuntimeService.canReceiveInventoryItem(killer.playerId, reward.itemId)) {
                if (this.canUseDurableInventoryGrant(killer, deps)) {
                    await this.grantInventoryItemDurably({
                        playerId: killer.playerId,
                        player: killer,
                        item: reward,
                        deps,
                        instance: deathSite.instance,
                        sourceType: 'pvp_loot',
                        sourceRefId: `pvp:${killer.playerId}:${victim.playerId}:${reward.itemId}`,
                        successNotice: `你从 ${victim.name} 体内掠得 ${reward.name} x${bloodEssenceCount}。`,
                        fallbackNotice: `你的背包已满，${reward.name} x${bloodEssenceCount} 掉在了 ${victim.name} 倒下之处。`,
                        fallbackPosition: { x: deathSite.x, y: deathSite.y },
                    });
                }
                else {
                    throw new common_1.ServiceUnavailableException('pvp_loot_durable_context_required');
                }
            }
            else {
                deps.spawnGroundItem(deathSite.instance, deathSite.x, deathSite.y, reward);
                deps.queuePlayerNotice(killer.playerId, `你的背包已满，${reward.name} x${bloodEssenceCount} 掉在了 ${victim.name} 倒下之处。`, 'loot');
            }
        }
    }

    canUseDurableInventoryGrant(player, deps) {
        return (0, world_runtime_inventory_grant_helpers_1.canUseDurableInventoryGrant)(player, deps?.durableOperationService ?? null);
    }

    async grantInventoryItemDurably(input) {
        const committed = await (0, world_runtime_inventory_grant_helpers_1.applyDurableInventoryGrant)({
            playerId: input.playerId,
            player: input.player,
            playerRuntimeService: this.playerRuntimeService,
            durableOperationService: input.deps.durableOperationService,
            instanceCatalogService: input.deps.instanceCatalogService,
            operationId: buildInventoryGrantOperationId(input.playerId, input.sourceType, input.sourceRefId, input.item),
            sourceType: input.sourceType,
            sourceRefId: input.sourceRefId,
            grantedItems: [input.item],
            mutateRuntime: async () => {
                this.playerRuntimeService.receiveInventoryItem(input.playerId, input.item);
            },
            swallowFailure: false,
        });
        if (committed) {
            input.deps.queuePlayerNotice(input.playerId, input.successNotice, 'loot');
        }
    }
};
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService;
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimePlayerCombatService);

export { WorldRuntimePlayerCombatService };

function buildNextInventorySnapshots(items) {
    return Array.isArray(items)
        ? items.map((entry) => ({
            itemId: typeof entry?.itemId === 'string' ? entry.itemId : '',
            count: Math.max(1, Math.trunc(Number(entry?.count ?? 1))),
            rawPayload: entry ? { ...entry } : {},
        })).filter((entry) => entry.itemId)
        : [];
}

function buildGrantedInventorySnapshot(item) {
    return {
        itemId: typeof item?.itemId === 'string' ? item.itemId : '',
        count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
        rawPayload: item ? { ...item } : {},
    };
}

function captureInventoryGrantRollbackState(player) {
    return {
        suppressImmediateDomainPersistence: player?.suppressImmediateDomainPersistence === true,
        inventoryItems: buildNextInventorySnapshots(player.inventory?.items ?? []),
        inventoryRevision: Math.max(0, Math.trunc(Number(player.inventory?.revision ?? 0))),
        persistentRevision: Math.max(0, Math.trunc(Number(player?.persistentRevision ?? 0))),
        selfRevision: Math.max(0, Math.trunc(Number(player?.selfRevision ?? 0))),
        dirtyDomains: player?.dirtyDomains instanceof Set ? Array.from(player.dirtyDomains) : [],
    };
}

function restoreInventoryGrantRollbackState(player, rollbackState, playerRuntimeService) {
    player.inventory.items = Array.isArray(rollbackState.inventoryItems)
        ? rollbackState.inventoryItems.map((entry) => ({ ...(entry.rawPayload ?? entry), itemId: entry.itemId, count: entry.count }))
        : [];
    player.inventory.revision = rollbackState.inventoryRevision;
    player.persistentRevision = rollbackState.persistentRevision;
    player.selfRevision = rollbackState.selfRevision;
    player.suppressImmediateDomainPersistence = rollbackState.suppressImmediateDomainPersistence === true;
    player.dirtyDomains = new Set(Array.isArray(rollbackState.dirtyDomains) ? rollbackState.dirtyDomains : []);
    playerRuntimeService.playerProgressionService.refreshPreview(player);
}

async function resolveCombatInstanceLeaseContext(instanceId, deps) {
    const normalizedInstanceId = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (!normalizedInstanceId || !deps?.instanceCatalogService?.isEnabled?.()) {
        return null;
    }
    const row = await deps.instanceCatalogService.loadInstanceCatalog(normalizedInstanceId);
    if (!row) {
        return null;
    }
    const assignedNodeId = typeof row.assigned_node_id === 'string' ? row.assigned_node_id.trim() : '';
    const ownershipEpoch = Number.isFinite(Number(row.ownership_epoch)) ? Math.max(1, Math.trunc(Number(row.ownership_epoch))) : 0;
    if (!assignedNodeId || ownershipEpoch <= 0) {
        return null;
    }
    return {
        assignedNodeId,
        ownershipEpoch,
    };
}

function buildInventoryGrantOperationId(playerId, sourceType, sourceRefId, item) {
    const normalizedPlayerId = typeof playerId === 'string' && playerId.trim() ? playerId.trim() : 'player';
    const normalizedSourceType = typeof sourceType === 'string' && sourceType.trim() ? sourceType.trim() : 'inventory';
    const normalizedSourceRefId = typeof sourceRefId === 'string' && sourceRefId.trim() ? sourceRefId.trim() : 'source';
    const normalizedItemId = typeof item?.itemId === 'string' && item.itemId.trim() ? item.itemId.trim() : 'item';
    const normalizedCount = Math.max(1, Math.trunc(Number(item?.count ?? 1)));
    return `op:${normalizedPlayerId}:${normalizedSourceType}:${normalizedSourceRefId}:${normalizedItemId}:x${normalizedCount}`;
}

function resolvePlayerDeathSite(victim, deps) {
    const instance = victim.instanceId ? deps.getInstanceRuntime(victim.instanceId) : null;
    return {
        instance,
        x: victim.x,
        y: victim.y,
    };
}

function pushShaDeathPenaltyMessages(deps, playerId, deathPenalty) {
    if ((deathPenalty.consumedProgress ?? 0) > 0 || (deathPenalty.consumedFoundation ?? 0) > 0) {
        deps.queuePlayerNotice(playerId, `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`, 'combat');
    }
    if ((deathPenalty.backlashAddedStacks ?? 0) > 0) {
        deps.queuePlayerNotice(playerId, `身死之后，${deathPenalty.backlashAddedStacks} 层煞气入体转为煞气反噬；当前煞气反噬 ${deathPenalty.backlashTotalStacks} 层，煞气入体余 ${deathPenalty.remainingInfusionStacks} 层。`, 'combat');
    }
}
