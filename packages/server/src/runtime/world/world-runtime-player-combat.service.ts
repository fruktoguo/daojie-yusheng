import { Inject, Injectable, Logger } from '@nestjs/common';
import { ContentTemplateRepository } from '../../content/content-template.repository';
import { BLOOD_ESSENCE_ITEM_ID, PVP_SOUL_INJURY_BUFF_ID } from '../../constants/gameplay/pvp';
import { PlayerRuntimeService } from '../player/player-runtime.service';
import { applyDurableInventoryGrant, canUseDurableInventoryGrant } from './world-runtime-inventory-grant.helpers';
import { CombatAuditOutboxService } from '../../persistence/combat-audit-outbox.service';
import * as world_runtime_normalization_helpers_1 from './world-runtime.normalization.helpers';

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime player combat outcome：承接玩家战斗结果收口与击杀奖励分发。 */
@Injectable()
export class WorldRuntimePlayerCombatService {
    logger = new Logger(WorldRuntimePlayerCombatService.name);
/**
 * contentTemplateRepository：内容Template仓储引用。
 */

    contentTemplateRepository;    
    /**
 * playerRuntimeService：玩家运行态服务引用。
 */

    playerRuntimeService;
    combatAuditOutboxService;
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: any,
        @Inject(PlayerRuntimeService) playerRuntimeService: any,
        @Inject(CombatAuditOutboxService) combatAuditOutboxService: any = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.combatAuditOutboxService = combatAuditOutboxService;
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
        this.recordCombatSemanticAudit('kill', {
            instanceId: instance?.meta?.instanceId ?? null,
            actor: { kind: 'player', id: killerPlayerId },
            actionId: 'monster_kill',
            target: buildMonsterAuditTarget(monster),
            result: {
                defeated: true,
                monsterId: monster?.monsterId ?? null,
                monsterName: monster?.name ?? null,
                level: monster?.level ?? null,
                tier: monster?.tier ?? null,
            },
            application: {
                dirtyDomains: ['instance:monster_runtime', 'player:progression'],
                persistenceTransfer: 'dirty_domain_flush',
                writesDatabaseInTick: false,
            },
            tags: ['semantic', 'monster_defeat'],
        });
        this.distributeMonsterKillProgress(instance, monster, killerPlayerId, deps);
        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        const lootRate = killer?.attrs.numericStats.lootRate ?? 0;
        const rareLootRate = killer?.attrs.numericStats.rareLootRate ?? 0;
        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1, lootRate, rareLootRate, {
            playerRealmLv: killer?.realm?.realmLv,
            monsterLevel: monster.level,
            monsterTier: monster.tier,
        });
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
        const killerRealmLv = this.resolvePlayerRealmLv(killerPlayerId);
        let totalContribution = 0;
        for (const participant of participants) {
            totalContribution += participant.contribution;
        }
        for (const participant of participants) {
            const contributionRatio = totalContribution > 0 ? participant.contribution / totalContribution : 1;
            const expMultiplier = this.resolveMonsterExpMultiplier(monster);
            const beforeProgression = capturePlayerProgressionAuditSnapshot(this.playerRuntimeService.getPlayer(participant.playerId));
            const progressResult = this.playerRuntimeService.grantMonsterKillProgress(participant.playerId, {
                monsterLevel: monster.level,
                monsterName: monster.name,
                monsterTier: monster.tier,
                expMultiplier,
                contributionRatio,
                expAdjustmentRealmLv: Math.max(topContributionRealmLv, killerRealmLv, participant.realmLv),
                isKiller: participant.playerId === killerPlayerId,
            }, deps.resolveCurrentTickForPlayerId(participant.playerId));
            const afterProgression = capturePlayerProgressionAuditSnapshot(this.playerRuntimeService.getPlayer(participant.playerId));
            const progressionDelta = diffPlayerProgressionAuditSnapshot(beforeProgression, afterProgression);
            if (progressResult?.changed === true || hasPositiveProgressionDelta(progressionDelta)) {
                this.recordCombatSemanticAudit('exp_gain', {
                    instanceId: instance?.meta?.instanceId ?? null,
                    actor: { kind: 'player', id: participant.playerId },
                    actionId: 'monster_kill_progress',
                    target: buildMonsterAuditTarget(monster),
                    result: {
                        monsterId: monster?.monsterId ?? null,
                        monsterName: monster?.name ?? null,
                        contributionRatio,
                        expMultiplier,
                        expAdjustmentRealmLv: Math.max(topContributionRealmLv, killerRealmLv, participant.realmLv),
                        isKiller: participant.playerId === killerPlayerId,
                        before: beforeProgression,
                        after: afterProgression,
                        delta: progressionDelta,
                        notices: Array.isArray(progressResult?.notices) ? progressResult.notices : [],
                    },
                    application: {
                        dirtyDomains: Array.isArray(progressResult?.dirtyDomains) ? progressResult.dirtyDomains : ['progression'],
                        persistenceTransfer: 'dirty_domain_flush',
                        writesDatabaseInTick: false,
                    },
                    tags: ['semantic', 'monster_kill_progress'],
                });
            }
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
    resolvePlayerRealmLv(playerId) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        return Math.max(1, Math.floor(player?.realm?.realmLv ?? 1));
    }
    resolveMonsterExpMultiplier(monster) {
        if (Number.isFinite(monster?.expMultiplier)) {
            return Math.max(0, Number(monster.expMultiplier));
        }
        const profile = this.contentTemplateRepository.getMonsterCombatProfile(monster?.monsterId);
        return Number.isFinite(profile?.expMultiplier) ? Math.max(0, Number(profile.expMultiplier)) : undefined;
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
            if (!player) {
                throw new Error(`inventory_grant_player_missing:${playerId}`);
            }
            if (!this.canUseDurableInventoryGrant(player, deps)) {
                throw new Error(`durable_inventory_grant_required:monster_loot:${playerId}:${item.itemId}`);
            }
            const committed = await this.grantInventoryItemDurably({
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
            if (committed) {
                this.recordCombatSemanticAudit('loot_grant', {
                    instanceId: instance?.meta?.instanceId ?? player.instanceId ?? null,
                    actor: { kind: 'player', id: playerId },
                    actionId: 'monster_loot',
                    target: buildItemAuditTarget(item),
                    result: {
                        item: buildItemAuditSnapshot(item),
                        sourceType: 'monster_loot',
                        sourceRefId: sourceRefId || `monster-loot:${instance?.meta?.instanceId ?? player.instanceId}:${x}:${y}:${item.itemId}`,
                        granted: true,
                    },
                    application: {
                        dirtyDomains: ['player:inventory'],
                        persistenceTransfer: 'durable_operation',
                        writesDatabaseInTick: false,
                    },
                    tags: ['semantic', 'loot', 'monster_loot'],
                });
            }
            return;
        }
        deps.spawnGroundItem(instance, x, y, item);
        deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, 'loot');
        this.recordCombatSemanticAudit('loot_drop', {
            instanceId: instance?.meta?.instanceId ?? null,
            actor: { kind: 'player', id: playerId },
            actionId: 'monster_loot',
            target: buildItemAuditTarget(item),
            result: {
                item: buildItemAuditSnapshot(item),
                sourceType: 'monster_loot',
                sourceRefId: sourceRefId || `monster-loot:${instance?.meta?.instanceId ?? ''}:${x}:${y}:${item.itemId}`,
                dropped: true,
                reason: 'inventory_full',
                x,
                y,
            },
            application: {
                dirtyDomains: ['instance:ground_items'],
                persistenceTransfer: 'dirty_domain_flush',
                writesDatabaseInTick: false,
            },
            tags: ['semantic', 'loot', 'monster_loot'],
        });
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
        const deathActor = killer
            ? { kind: 'player', id: killer.playerId }
            : typeof killerPlayerId === 'string' && killerPlayerId.trim()
                ? { kind: 'monster', id: killerPlayerId.trim() }
                : { kind: 'system', id: null };
        this.recordCombatSemanticAudit('death', {
            instanceId: victim.instanceId ?? deathSite?.instance?.meta?.instanceId ?? null,
            actor: deathActor,
            actionId: 'player_death',
            target: buildPlayerAuditTarget(victim),
            result: {
                defeated: true,
                deathPenalty,
                x: deathSite.x,
                y: deathSite.y,
            },
            application: {
                dirtyDomains: ['player:vitals', 'player:death', 'player:progression'],
                persistenceTransfer: 'dirty_domain_flush',
                writesDatabaseInTick: false,
            },
            tags: ['semantic', 'player_death'],
        });
        if (killer && killer.playerId !== victim.playerId) {
            this.recordCombatSemanticAudit('kill', {
                instanceId: victim.instanceId ?? deathSite?.instance?.meta?.instanceId ?? null,
                actor: { kind: 'player', id: killer.playerId },
                actionId: 'pvp_kill',
                target: buildPlayerAuditTarget(victim),
                result: {
                    defeated: true,
                    victimPlayerId: victim.playerId,
                    victimName: victim.name ?? null,
                    x: deathSite.x,
                    y: deathSite.y,
                },
                application: {
                    dirtyDomains: ['player:vitals', 'player:death'],
                    persistenceTransfer: 'dirty_domain_flush',
                    writesDatabaseInTick: false,
                },
                tags: ['semantic', 'pvp_kill'],
            });
            if (typeof this.playerRuntimeService.clearRetaliatePlayerTargetIfMatches === 'function') {
                this.playerRuntimeService.clearRetaliatePlayerTargetIfMatches(
                    killer.playerId,
                    victim.playerId,
                    typeof deps.resolveCurrentTickForPlayerId === 'function'
                        ? deps.resolveCurrentTickForPlayerId(killer.playerId)
                        : 0,
                );
            }
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
        if (!this.playerRuntimeService.hasActiveBuff(victim.playerId, PVP_SOUL_INJURY_BUFF_ID)) {
            this.playerRuntimeService.applyPvPSoulInjury(victim.playerId);
            deps.queuePlayerNotice(victim.playerId, '神魂受损；身死与遁返都不会清除，需静养一时辰。', 'combat');
        }
        const bloodEssenceCount = Math.max(1, Math.floor((victim.realm?.realmLv ?? 1) ** 2));
        const reward = this.contentTemplateRepository.createItem(BLOOD_ESSENCE_ITEM_ID, bloodEssenceCount);
        if (reward && deathSite.instance) {
            if (this.playerRuntimeService.canReceiveInventoryItem(killer.playerId, reward.itemId)) {
                if (!this.canUseDurableInventoryGrant(killer, deps)) {
                    throw new Error(`durable_inventory_grant_required:pvp_loot:${killer.playerId}:${reward.itemId}`);
                }
                const committed = await this.grantInventoryItemDurably({
                    playerId: killer.playerId,
                    player: killer,
                    item: reward,
                    deps,
                    instance: deathSite.instance,
                    sourceType: 'pvp_loot',
                    sourceRefId: `pvp:${killer.playerId}:${victim.playerId}:${reward.itemId}`,
                    successNotice: `你从 ${victim.name} 体内掠得 ${reward.name} x${bloodEssenceCount}。`,
                    fallbackNotice: `${reward.name} x${bloodEssenceCount} 掉在了 ${victim.name} 倒下之处，但本次奖励落盘失败。`,
                    fallbackPosition: { x: deathSite.x, y: deathSite.y },
                });
                if (committed) {
                    this.recordCombatSemanticAudit('loot_grant', {
                        instanceId: deathSite.instance?.meta?.instanceId ?? killer.instanceId ?? null,
                        actor: { kind: 'player', id: killer.playerId },
                        actionId: 'pvp_loot',
                        target: buildItemAuditTarget(reward),
                        result: {
                            item: buildItemAuditSnapshot(reward),
                            sourceType: 'pvp_loot',
                            sourceRefId: `pvp:${killer.playerId}:${victim.playerId}:${reward.itemId}`,
                            victimPlayerId: victim.playerId,
                            granted: true,
                        },
                        application: {
                            dirtyDomains: ['player:inventory'],
                            persistenceTransfer: 'durable_operation',
                            writesDatabaseInTick: false,
                        },
                        tags: ['semantic', 'loot', 'pvp_loot'],
                    });
                }
            }
            else {
                deps.spawnGroundItem(deathSite.instance, deathSite.x, deathSite.y, reward);
                deps.queuePlayerNotice(killer.playerId, `你的背包已满，${reward.name} x${bloodEssenceCount} 掉在了 ${victim.name} 倒下之处。`, 'loot');
                this.recordCombatSemanticAudit('loot_drop', {
                    instanceId: deathSite.instance?.meta?.instanceId ?? killer.instanceId ?? null,
                    actor: { kind: 'player', id: killer.playerId },
                    actionId: 'pvp_loot',
                    target: buildItemAuditTarget(reward),
                    result: {
                        item: buildItemAuditSnapshot(reward),
                        sourceType: 'pvp_loot',
                        sourceRefId: `pvp:${killer.playerId}:${victim.playerId}:${reward.itemId}`,
                        victimPlayerId: victim.playerId,
                        dropped: true,
                        reason: 'inventory_full',
                        x: deathSite.x,
                        y: deathSite.y,
                    },
                    application: {
                        dirtyDomains: ['instance:ground_items'],
                        persistenceTransfer: 'dirty_domain_flush',
                        writesDatabaseInTick: false,
                    },
                    tags: ['semantic', 'loot', 'pvp_loot'],
                });
            }
        }
    }

    canUseDurableInventoryGrant(player, deps) {
        return canUseDurableInventoryGrant(player, deps?.durableOperationService ?? null);
    }

    async grantInventoryItemDurably(input) {
        const committed = await applyDurableInventoryGrant({
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
            onFailure: async (error) => {
                this.logger.warn(`背包奖励 durable 提交失败，已改为地面掉落：playerId=${input.playerId} sourceType=${input.sourceType} sourceRefId=${input.sourceRefId} reason=${error instanceof Error ? error.message : String(error)}`);
                this.dropInventoryGrantFallback(input);
            },
            swallowFailure: true,
        });
        if (committed) {
            input.deps.queuePlayerNotice(input.playerId, input.successNotice, 'loot');
        }
        return committed === true;
    }
    dropInventoryGrantFallback(input) {
        input.deps.spawnGroundItem(input.instance, input.fallbackPosition.x, input.fallbackPosition.y, input.item);
        input.deps.queuePlayerNotice(input.playerId, input.fallbackNotice, 'loot');
        this.recordCombatSemanticAudit('loot_drop', {
            instanceId: input.instance?.meta?.instanceId ?? input.player?.instanceId ?? null,
            actor: { kind: 'player', id: input.playerId },
            actionId: input.sourceType,
            target: buildItemAuditTarget(input.item),
            result: {
                item: buildItemAuditSnapshot(input.item),
                sourceType: input.sourceType,
                sourceRefId: input.sourceRefId,
                dropped: true,
                reason: 'durable_grant_failed',
                x: input.fallbackPosition?.x ?? null,
                y: input.fallbackPosition?.y ?? null,
            },
            application: {
                dirtyDomains: ['instance:ground_items'],
                persistenceTransfer: 'dirty_domain_flush',
                writesDatabaseInTick: false,
            },
            tags: ['semantic', 'loot', input.sourceType],
        });
    }
    recordCombatSemanticAudit(action, input: any = {}) {
        if (typeof this.combatAuditOutboxService?.enqueue !== 'function') {
            return false;
        }
        return this.combatAuditOutboxService.enqueue({
            type: 'combat_audit',
            action,
            instanceId: input.instanceId ?? null,
            phase: input.phase ?? 'settlement',
            actor: input.actor ?? null,
            actionId: input.actionId ?? action,
            target: input.target ?? null,
            result: input.result ?? {},
            application: input.application ?? null,
            createdAt: input.createdAt ?? new Date().toISOString(),
            tags: Array.isArray(input.tags) ? input.tags : ['semantic'],
        });
    }
};

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

function buildMonsterAuditTarget(monster) {
    return {
        kind: 'monster',
        id: typeof monster?.runtimeId === 'string' ? monster.runtimeId : null,
        monsterId: typeof monster?.monsterId === 'string' ? monster.monsterId : null,
        name: typeof monster?.name === 'string' ? monster.name : null,
        x: Number.isFinite(Number(monster?.x)) ? Math.trunc(Number(monster.x)) : null,
        y: Number.isFinite(Number(monster?.y)) ? Math.trunc(Number(monster.y)) : null,
    };
}

function buildPlayerAuditTarget(player) {
    return {
        kind: 'player',
        id: typeof player?.playerId === 'string' ? player.playerId : null,
        name: typeof player?.name === 'string' ? player.name : null,
        x: Number.isFinite(Number(player?.x)) ? Math.trunc(Number(player.x)) : null,
        y: Number.isFinite(Number(player?.y)) ? Math.trunc(Number(player.y)) : null,
    };
}

function buildItemAuditTarget(item) {
    return {
        kind: 'item',
        id: typeof item?.itemId === 'string' ? item.itemId : null,
    };
}

function buildItemAuditSnapshot(item) {
    return {
        itemId: typeof item?.itemId === 'string' ? item.itemId : null,
        name: typeof item?.name === 'string' ? item.name : null,
        count: Math.max(1, Math.trunc(Number(item?.count ?? 1))),
        type: typeof item?.type === 'string' ? item.type : null,
    };
}

function capturePlayerProgressionAuditSnapshot(player) {
    return {
        realmLv: Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? 1))),
        realmProgress: Math.max(0, Number(player?.realm?.progress ?? 0)),
        foundation: Math.max(0, Number(player?.foundation ?? 0)),
        combatExp: Math.max(0, Number(player?.combatExp ?? 0)),
        techniqueId: typeof player?.cultivatingTechniqueId === 'string' ? player.cultivatingTechniqueId : null,
        techniqueExp: Math.max(0, Number(resolveCultivatingTechniqueExp(player) ?? 0)),
    };
}

function diffPlayerProgressionAuditSnapshot(before, after) {
    return {
        realmProgress: Math.max(0, Number(after?.realmProgress ?? 0) - Number(before?.realmProgress ?? 0)),
        foundation: Math.max(0, Number(after?.foundation ?? 0) - Number(before?.foundation ?? 0)),
        combatExp: Math.max(0, Number(after?.combatExp ?? 0) - Number(before?.combatExp ?? 0)),
        techniqueExp: Math.max(0, Number(after?.techniqueExp ?? 0) - Number(before?.techniqueExp ?? 0)),
    };
}

function hasPositiveProgressionDelta(delta) {
    return Number(delta?.realmProgress ?? 0) > 0
        || Number(delta?.foundation ?? 0) > 0
        || Number(delta?.combatExp ?? 0) > 0
        || Number(delta?.techniqueExp ?? 0) > 0;
}

function resolveCultivatingTechniqueExp(player) {
    const techniqueId = typeof player?.cultivatingTechniqueId === 'string' ? player.cultivatingTechniqueId : '';
    if (!techniqueId) {
        return 0;
    }
    const techniques = player?.techniques;
    if (techniques instanceof Map) {
        return techniques.get(techniqueId)?.exp ?? 0;
    }
    if (Array.isArray(techniques)) {
        return techniques.find((entry) => entry?.id === techniqueId || entry?.techniqueId === techniqueId)?.exp ?? 0;
    }
    if (techniques && typeof techniques === 'object') {
        return techniques[techniqueId]?.exp ?? 0;
    }
    return 0;
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
