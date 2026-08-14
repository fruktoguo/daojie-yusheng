/**
 * 本文件属于服务端战斗运行时，负责战斗指令、结算辅助、表现投影或掉落处理。
 *
 * 维护时要保证结算仍由服务端权威执行，客户端只接收结构化结果和必要表现字段。
 */
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { resolvePlayerFacingContentName } from '@mud/shared';
import { ContentTemplateRepository } from '../../../content/content-template.repository';
import { BLOOD_ESSENCE_ITEM_ID } from '../../../constants/gameplay/pvp';
import {
    REAL_WORLD_MONSTER_KILL_DROP_RATE_BONUS_BP,
    REAL_WORLD_MONSTER_KILL_EXP_MULTIPLIER,
} from '../../../constants/gameplay/real-world';
import { resolveHeavenlyDaoSuppressionStacksForKill } from '../../../constants/gameplay/virtual-world';
import { PlayerRuntimeService } from '../../player/player-runtime.service';
import {
    clearPartyMonsterSupport,
    resolvePartyExperienceParticipants,
    resolvePartyLootRecipients,
} from '../../party/party-reward-runtime';
import { resolvePlayerDisplayName } from '../../player/player-display-name';
import { PlayerCountersPersistenceService } from '../../../persistence/player-counters-persistence.service';
import { buildStructuredNotice } from '../structured-notice.helpers';
import { resolveFormationMonsterExpMultiplier } from './formation-combat-effect.helpers';
import * as world_runtime_normalization_helpers_1 from '../world-runtime.normalization.helpers';

const { formatItemStackLabel, isRealPublicWorldInstance, isVirtualPublicWorldInstance } = world_runtime_normalization_helpers_1;

type CombatSectionRecorder = (key: string, durationMs: number, count?: number) => void;

function beginPlayerMonsterKillPerf(deps: any): number | null {
    return typeof deps?.recordPendingCommandSectionDuration === 'function'
        ? performance.now()
        : null;
}

function recordPlayerMonsterKillPerf(
    deps: any,
    key: string,
    startedAt: number | null,
    count = 1,
): number | null {
    const recorder = deps?.recordPendingCommandSectionDuration as CombatSectionRecorder | undefined;
    if (typeof recorder !== 'function' || startedAt === null) {
        return null;
    }
    const endedAt = performance.now();
    const durationMs = endedAt - startedAt;
    if (Number.isFinite(durationMs) && durationMs >= 0) {
        recorder(key, durationMs, count);
    }
    return endedAt;
}

function recordPlayerMonsterKillCount(deps: any, key: string, count: number): void {
    const recorder = deps?.recordPendingCommandSectionDuration as CombatSectionRecorder | undefined;
    if (typeof recorder !== 'function' || count <= 0) {
        return;
    }
    recorder(key, 0, count);
}

export function buildMonsterLootDeliverySourceRef(instance: any, monster: any, index: number): string {
    const instanceId = instance?.meta?.instanceId ?? 'unknown';
    const killTick = Math.max(0, Math.trunc(Number(instance?.tick) || 0));
    return `monster:${instanceId}:${monster.runtimeId}:${killTick}:${index}`;
}

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
    playerCountersPersistenceService;
    private readonly deliveredMonsterLootSources = new Map<string, true>();
    /**
 * 构造器：初始化 当前 实例并建立基础状态。
 * @param contentTemplateRepository 参数说明。
 * @param playerRuntimeService 参数说明。
 * @returns 无返回值，完成实例初始化。
 */

    constructor(
        @Inject(ContentTemplateRepository) contentTemplateRepository: ContentTemplateRepository,
        @Inject(PlayerRuntimeService) playerRuntimeService: PlayerRuntimeService,
        @Optional() playerCountersPersistenceServiceOrLegacyAudit: PlayerCountersPersistenceService | null = null,
        @Optional() legacyPlayerCountersPersistenceService: PlayerCountersPersistenceService | null = null,
    ) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
        this.playerCountersPersistenceService = legacyPlayerCountersPersistenceService ?? playerCountersPersistenceServiceOrLegacyAudit;
    }    
    /**
 * handlePlayerMonsterKill：处理玩家怪物Kill并更新相关状态。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家怪物Kill相关状态。
 */

    async handlePlayerMonsterKill(instance: any, monster: any, killerPlayerId: string, deps: any) {
        this.handlePlayerMonsterKillSynchronously(instance, monster, killerPlayerId, deps);
    }

    /** 击杀奖励链仅修改内存态，热路径直接同步结算，避免每只妖兽产生空 Promise 边界。 */
    handlePlayerMonsterKillSynchronously(instance: any, monster: any, killerPlayerId: string, deps: any): void {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let sectionStartedAt = beginPlayerMonsterKillPerf(deps);
        const killNotice = buildStructuredNotice('combat', 'notice.combat.killed', `${monster.name} 被你斩杀`, {
            vars: { monsterName: monster.name },
            pills: [{ key: 'monsterName', style: 'target' }],
            badges: ['击杀'],
        });
        deps.queuePlayerNotice(killerPlayerId, killNotice.text, killNotice.kind, undefined, undefined, killNotice.structured);
        deps.advanceKillQuestProgress(killerPlayerId, monster.monsterId, monster.name);
        if (this.isCombatSemanticAuditEnabled()) {
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
        }
        this.incrementMonsterKillCounter(killerPlayerId, monster.tier);
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.preparationMs',
            sectionStartedAt,
        );
        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        const heavenlyDaoSuppressionStacks = isVirtualPublicWorldInstance(instance)
            ? resolveHeavenlyDaoSuppressionStacksForKill(killer?.realm?.realmLv, monster?.level)
            : 0;
        if (heavenlyDaoSuppressionStacks > 0) {
            this.playerRuntimeService.addHeavenlyDaoSuppressionStacks(killerPlayerId, heavenlyDaoSuppressionStacks);
        }
        this.distributeMonsterKillProgress(instance, monster, killerPlayerId, deps);
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.progressMs',
            sectionStartedAt,
        );
        const realWorldDropRateBonus = isRealPublicWorldInstance(instance)
            ? REAL_WORLD_MONSTER_KILL_DROP_RATE_BONUS_BP
            : 0;
        const lootRate = (killer?.attrs.numericStats.lootRate ?? 0) + realWorldDropRateBonus;
        const rareLootRate = killer?.attrs.numericStats.rareLootRate ?? 0;
        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1, lootRate, rareLootRate, {
            playerRealmLv: killer?.realm?.realmLv,
            monsterLevel: monster.level,
            monsterTier: monster.tier,
        });
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.dropRollMs',
            sectionStartedAt,
        );
        recordPlayerMonsterKillCount(deps, 'combat.playerMonsterKill.lootItems', items.length);
        const rawLootParticipants = this.resolveMonsterExpParticipants(instance, monster.runtimeId, killerPlayerId);
        const lootRecipients = resolvePartyLootRecipients(
            killerPlayerId,
            items.length,
            rawLootParticipants,
            instance,
            monster,
            (playerId) => this.playerRuntimeService.getPlayer(playerId),
        );
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            this.deliverMonsterLootSynchronously(
                lootRecipients[index] ?? killerPlayerId,
                instance,
                monster.x,
                monster.y,
                item,
                deps,
                buildMonsterLootDeliverySourceRef(instance, monster, index),
            );
        }
        clearPartyMonsterSupport(instance?.meta?.instanceId ?? '', monster.runtimeId);
        recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.lootDeliveryMs',
            sectionStartedAt,
        );
    }    
    /**
 * distributeMonsterKillProgress：判断distribute怪物Kill进度是否满足条件。
 * @param instance 地图实例。
 * @param monster 参数说明。
 * @param killerPlayerId killerPlayer ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新distribute怪物Kill进度相关状态。
 */

    distributeMonsterKillProgress(instance: any, monster: any, killerPlayerId: string, deps: any) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        let sectionStartedAt = beginPlayerMonsterKillPerf(deps);
        const rawParticipants = this.resolveMonsterExpParticipants(instance, monster.runtimeId, killerPlayerId);
        const participants = resolvePartyExperienceParticipants(
            rawParticipants,
            instance,
            monster,
            (playerId) => this.playerRuntimeService.getPlayer(playerId),
        );
        const topContributionRealmLv = this.resolveMonsterTopContributionRealmLv(participants);
        const killerRealmLv = this.resolvePlayerRealmLv(killerPlayerId);
        let totalContribution = 0;
        for (const participant of participants) {
            totalContribution += participant.contribution;
        }
        const monsterExpMultiplier = this.resolveMonsterExpMultiplier(monster);
        const expMultiplier = (Number.isFinite(monsterExpMultiplier) ? monsterExpMultiplier : 1)
            * resolveFormationMonsterExpMultiplier(
                deps.worldRuntimeFormationService,
                instance?.meta?.instanceId,
                monster?.x,
                monster?.y,
            )
            * (isRealPublicWorldInstance(instance) ? REAL_WORLD_MONSTER_KILL_EXP_MULTIPLIER : 1);
        const auditEnabled = this.isCombatSemanticAuditEnabled();
        const recordProgressSectionDuration = typeof deps?.recordPendingCommandSectionDuration === 'function'
            ? (key: string, durationMs: number, count = 1) => deps.recordPendingCommandSectionDuration(key, durationMs, count)
            : undefined;
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.participantPlanMs',
            sectionStartedAt,
        );
        recordPlayerMonsterKillCount(deps, 'combat.playerMonsterKill.participants', participants.length);
        for (const participant of participants) {
            const contributionRatio = totalContribution > 0 ? participant.contribution / totalContribution : 1;
            const beforeProgression = auditEnabled
                ? capturePlayerProgressionAuditSnapshot(this.playerRuntimeService.getPlayer(participant.playerId))
                : null;
            const progressResult = this.playerRuntimeService.grantMonsterKillProgress(participant.playerId, {
                monsterLevel: monster.level,
                monsterName: monster.name,
                monsterTier: monster.tier,
                expMultiplier,
                contributionRatio,
                expAdjustmentRealmLv: Math.max(topContributionRealmLv, killerRealmLv, participant.realmLv),
                isKiller: participant.playerId === killerPlayerId,
                getInstanceRuntime: (instanceId) => deps.getInstanceRuntime?.(instanceId) ?? null,
                recordTickSectionDuration: recordProgressSectionDuration,
            }, deps.resolveCurrentTickForPlayerId(participant.playerId));
            if (auditEnabled) {
                const afterProgression = capturePlayerProgressionAuditSnapshot(this.playerRuntimeService.getPlayer(participant.playerId));
                const progressionDelta = diffPlayerProgressionAuditSnapshot(beforeProgression, afterProgression);
                if (progressResult?.changed !== true && !hasPositiveProgressionDelta(progressionDelta)) {
                    continue;
                }
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
        recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.progressApplyMs',
            sectionStartedAt,
            participants.length,
        );
    }    
    /**
 * resolveMonsterExpParticipants：规范化或转换怪物ExpParticipant。
 * @param instance 地图实例。
 * @param runtimeId runtime ID。
 * @param killerPlayerId killerPlayer ID。
 * @returns 无返回值，直接更新怪物ExpParticipant相关状态。
 */

    resolveMonsterExpParticipants(instance: any, runtimeId: string, killerPlayerId: string) {
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

    resolveMonsterTopContributionRealmLv(participants: any[]) {
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
    resolvePlayerRealmLv(playerId: string) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        return Math.max(1, Math.floor(player?.realm?.realmLv ?? 1));
    }
    resolveMonsterExpMultiplier(monster: any) {
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

    async deliverMonsterLoot(playerId: string, instance: any, x: number, y: number, item: any, deps: any, sourceRefId = '') {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        this.deliverMonsterLootSynchronously(playerId, instance, x, y, item, deps, sourceRefId);
    }

    /** 击杀热路径直接同步交付，避免为每件掉落创建空 Promise 切换。 */
    private deliverMonsterLootSynchronously(
        playerId: string,
        instance: any,
        x: number,
        y: number,
        item: any,
        deps: any,
        sourceRefId = '',
    ): void {
        if (sourceRefId && this.deliveredMonsterLootSources.has(sourceRefId)) return;
        let sectionStartedAt = beginPlayerMonsterKillPerf(deps);
        const received = this.playerRuntimeService.tryReceiveInventoryItem(playerId, item, {
            inventoryOnlyStatistics: true,
            normalizedItemOwnershipTransfer: true,
            recordTickSectionDuration: deps.recordPendingCommandSectionDuration,
        });
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.lootReceiptMs',
            sectionStartedAt,
        );
        if (received) {
            this.rememberDeliveredMonsterLootSource(sourceRefId);
            const itemLabel = formatItemStackLabel(item);
            const lootNotice = buildStructuredNotice('loot', 'notice.loot.obtained', `获得 ${itemLabel}`, {
                vars: { itemName: itemLabel },
                pills: [{ key: 'itemName', style: 'target' }],
            });
            deps.queuePlayerNotice(playerId, lootNotice.text, lootNotice.kind, undefined, undefined, lootNotice.structured);
            recordPlayerMonsterKillPerf(
                deps,
                'combat.playerMonsterKill.lootNoticeMs',
                sectionStartedAt,
            );
            return;
        }
        deps.spawnGroundItem(instance, x, y, item);
        this.rememberDeliveredMonsterLootSource(sourceRefId);
        sectionStartedAt = recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.lootGroundSpawnMs',
            sectionStartedAt,
        );
        const dropNotice = buildStructuredNotice('loot', 'notice.loot.bag-full-ground', `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, {
            vars: { itemLabel: formatItemStackLabel(item), x, y },
            pills: [{ key: 'itemLabel', style: 'target' }],
        });
        deps.queuePlayerNotice(playerId, dropNotice.text, dropNotice.kind, undefined, undefined, dropNotice.structured);
        recordPlayerMonsterKillPerf(
            deps,
            'combat.playerMonsterKill.lootNoticeMs',
            sectionStartedAt,
        );
    }

    private rememberDeliveredMonsterLootSource(sourceRefId: string): void {
        if (!sourceRefId) return;
        this.deliveredMonsterLootSources.set(sourceRefId, true);
        while (this.deliveredMonsterLootSources.size > 65_536) {
            const oldest = this.deliveredMonsterLootSources.keys().next().value;
            if (typeof oldest !== 'string') break;
            this.deliveredMonsterLootSources.delete(oldest);
        }
    }
    /**
 * dispatchDamagePlayer：判断Damage玩家是否满足条件。
 * @param playerId 玩家 ID。
 * @param amount 参数说明。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新Damage玩家相关状态。
 */

    async dispatchDamagePlayer(playerId: string, amount: number, deps: any) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        if (player.hp <= 0) {
            await this.handlePlayerDefeat(playerId, deps);
            return;
        }
        const updated = this.playerRuntimeService.applyDamage(playerId, amount);
        this.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
            reason: 'attack',
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

    async handlePlayerDefeat(playerId: string, deps: any, killerPlayerId: string | null = null) {
        const victim = this.playerRuntimeService.getPlayer(playerId);
        if (!victim) {
            deps.clearPendingCommand?.(playerId);
            return;
        }
        if (victim.hp > 0) {
            deps.clearPendingCommand?.(playerId);
            deps.worldRuntimeGmQueueService?.clearPendingRespawn?.(playerId);
            return;
        }
        if (deps.worldRuntimeGmQueueService?.hasPendingRespawn?.(playerId) === true) {
            deps.clearPendingCommand?.(playerId);
            return;
        }
        const deathSite = resolvePlayerDeathSite(victim, deps);
        deps.worldRuntimeGmQueueService?.markPendingRespawn?.(playerId);
        interruptTechniqueActivitiesForDefeat(playerId, victim, deps);
        // 玩家死亡时立即清除所有以该玩家为仇恨目标的妖兽仇恨，
        // 避免下一个 tick 产生无效攻击 intent。
        if (deathSite.instance && typeof deathSite.instance.clearMonsterAggroForPlayer === 'function') {
            deathSite.instance.clearMonsterAggroForPlayer(playerId);
        }
        if (typeof deps.worldRuntimeThreatService?.clearOwner === 'function') {
            const ownerId = deps.worldRuntimeThreatService.buildPlayerOwnerId?.(playerId) ?? `player:${playerId}`;
            deps.worldRuntimeThreatService.clearOwner(ownerId);
            deps.worldRuntimeThreatService.clearTargetEverywhere?.(ownerId);
        }
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
        if (this.isCombatSemanticAuditEnabled()) {
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
        }
        if (killer && killer.playerId !== victim.playerId) {
            if (this.isCombatSemanticAuditEnabled()) {
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
            }
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
        if (isOfflineRuntimePlayer(victim)
            && typeof deps.worldRuntimePlayerCombatOutcomeService?.removeOfflineDefeatedPlayer === 'function') {
            this.queueOfflineDefeatLogbookMessage(victim, killerPlayerId, killer, deathSite);
            deps.worldRuntimePlayerCombatOutcomeService.removeOfflineDefeatedPlayer(playerId, deps);
            return;
        }
        deps.clearPendingCommand?.(playerId);
    }
    /** 离线挂机战败必须先进入待确认持久化队列，再允许运行态回收。 */
    queueOfflineDefeatLogbookMessage(victim: any, killerPlayerId: string | null, killer: any, deathSite: any) {
        const killerName = resolveOfflineDefeatSourceName(killerPlayerId, killer, deathSite?.instance);
        const instance = deathSite?.instance;
        const locationName = resolvePlayerFacingContentName(
            instance?.template?.id ?? victim?.templateId ?? victim?.instanceId,
            '未知地域',
            instance?.template?.displayName,
            instance?.template?.name,
            instance?.meta?.displayName,
            instance?.meta?.name,
        );
        const notice = buildStructuredNotice(
            'system',
            'notice.combat.offline-defeat',
            `你在离线挂机期间于${locationName}被${killerName}击败，离线挂机已结束。`,
            {
                vars: { killerName, locationName },
                pills: [
                    { key: 'killerName', style: 'target' },
                    { key: 'locationName', style: 'target' },
                ],
            },
        );
        this.playerRuntimeService.queuePendingLogbookMessage(victim.playerId, {
            id: `offline-defeat:${Date.now()}:${randomUUID()}`,
            kind: notice.kind,
            text: notice.text,
            at: Date.now(),
            structured: notice.structured,
        });
    }
    /** 处理玩家互杀奖励与惩罚。 */
    async applyPvPKillRewards(killer: any, victim: any, deathSite: any, deps: any) {
        if (killer.isBot || victim.isBot || killer.playerId === victim.playerId) {
            return;
        }
        this.playerCountersPersistenceService?.increment?.(killer.playerId, 'playerKillCount');
        this.playerCountersPersistenceService?.increment?.(victim.playerId, 'deathCount');
        if (killer.combat?.allowAoePlayerHit === true) {
            const nextStacks = this.playerRuntimeService.addPvPShaInfusionStack(killer.playerId);
            const shaNotice = buildStructuredNotice('combat', 'notice.combat.sha-infusion', `杀念入体，煞气入体加深至 ${nextStacks} 层。`, {
                vars: { stacks: nextStacks },
                pills: [{ key: 'stacks', style: 'damage', color: '#a855f7' }],
            });
            deps.queuePlayerNotice(killer.playerId, shaNotice.text, shaNotice.kind, undefined, undefined, shaNotice.structured);
        }
        const soulInjuryStacks = this.playerRuntimeService.applyPvPSoulInjury(victim.playerId);
        const soulNotice = buildStructuredNotice(
            'combat',
            'notice.combat.soul-injury',
            '神魂受损加深；身死与遁返都不会清除，需静养一时辰。',
            {
                vars: { stacks: soulInjuryStacks },
                pills: [{ key: 'stacks', style: 'damage' }],
            },
        );
        deps.queuePlayerNotice(victim.playerId, soulNotice.text, soulNotice.kind, undefined, undefined, soulNotice.structured);
        const victimName = resolvePlayerDisplayName(victim, { playerId: victim?.playerId, fallback: '未知玩家' });
        const bloodEssenceCount = Math.max(1, Math.floor((victim.realm?.realmLv ?? 1) ** 2));
        const reward = this.contentTemplateRepository.createItem(BLOOD_ESSENCE_ITEM_ID, bloodEssenceCount);
        if (reward && deathSite.instance) {
            if (this.playerRuntimeService.canReceiveInventoryItem(killer.playerId, reward)) {
                this.playerRuntimeService.receiveInventoryItem(killer.playerId, reward);
                const rewardLabel = `${reward.name} x${bloodEssenceCount}`;
                const rewardNotice = buildStructuredNotice('loot', 'notice.loot.obtained', `获得 ${rewardLabel}`, {
                    vars: { itemName: rewardLabel },
                    pills: [{ key: 'itemName', style: 'target' }],
                });
                deps.queuePlayerNotice(killer.playerId, rewardNotice.text, rewardNotice.kind, undefined, undefined, rewardNotice.structured);
            }
            else {
                deps.spawnGroundItem(deathSite.instance, deathSite.x, deathSite.y, reward);
                const pvpDropNotice = buildStructuredNotice('loot', 'notice.loot.pvp-bag-full', `你的背包已满，${reward.name} x${bloodEssenceCount} 掉在了 ${victimName} 倒下之处。`, {
                    vars: { itemName: reward.name, count: bloodEssenceCount, victimName },
                    pills: [{ key: 'itemName', style: 'target' }, { key: 'victimName', style: 'target' }],
                });
                deps.queuePlayerNotice(killer.playerId, pvpDropNotice.text, pvpDropNotice.kind, undefined, undefined, pvpDropNotice.structured);
            }
        }
    }

    recordCombatSemanticAudit(action: string, input: any = {}) {
        return false;
    }

    isCombatSemanticAuditEnabled(): boolean {
        return false;
    }

    /** 递增怪物击杀计数器。 */
    private incrementMonsterKillCounter(playerId: string, tier: string | undefined): void {
        const counters = this.playerCountersPersistenceService;
        if (!counters?.increment) return;
        counters.increment(playerId, 'monsterKillCount');
        if (tier === 'variant') counters.increment(playerId, 'eliteMonsterKillCount');
        else if (tier === 'demon_king') counters.increment(playerId, 'bossMonsterKillCount');
    }
};

function buildMonsterAuditTarget(monster: any) {
    return {
        kind: 'monster',
        id: typeof monster?.runtimeId === 'string' ? monster.runtimeId : null,
        monsterId: typeof monster?.monsterId === 'string' ? monster.monsterId : null,
        name: typeof monster?.name === 'string' ? monster.name : null,
        x: Number.isFinite(Number(monster?.x)) ? Math.trunc(Number(monster.x)) : null,
        y: Number.isFinite(Number(monster?.y)) ? Math.trunc(Number(monster.y)) : null,
    };
}

function buildPlayerAuditTarget(player: any) {
    return {
        kind: 'player',
        id: typeof player?.playerId === 'string' ? player.playerId : null,
        name: typeof player?.name === 'string' ? player.name : null,
        x: Number.isFinite(Number(player?.x)) ? Math.trunc(Number(player.x)) : null,
        y: Number.isFinite(Number(player?.y)) ? Math.trunc(Number(player.y)) : null,
    };
}

function capturePlayerProgressionAuditSnapshot(player: any) {
    return {
        realmLv: Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? 1))),
        realmProgress: Math.max(0, Number(player?.realm?.progress ?? 0)),
        foundation: Math.max(0, Number(player?.foundation ?? 0)),
        combatExp: Math.max(0, Number(player?.combatExp ?? 0)),
        techniqueId: typeof player?.cultivatingTechniqueId === 'string' ? player.cultivatingTechniqueId : null,
        techniqueExp: Math.max(0, Number(resolveCultivatingTechniqueExp(player) ?? 0)),
    };
}

function diffPlayerProgressionAuditSnapshot(before: any, after: any) {
    return {
        realmProgress: Math.max(0, Number(after?.realmProgress ?? 0) - Number(before?.realmProgress ?? 0)),
        foundation: Math.max(0, Number(after?.foundation ?? 0) - Number(before?.foundation ?? 0)),
        combatExp: Math.max(0, Number(after?.combatExp ?? 0) - Number(before?.combatExp ?? 0)),
        techniqueExp: Math.max(0, Number(after?.techniqueExp ?? 0) - Number(before?.techniqueExp ?? 0)),
    };
}

function hasPositiveProgressionDelta(delta: any) {
    return Number(delta?.realmProgress ?? 0) > 0
        || Number(delta?.foundation ?? 0) > 0
        || Number(delta?.combatExp ?? 0) > 0
        || Number(delta?.techniqueExp ?? 0) > 0;
}

function resolveCultivatingTechniqueExp(player: any) {
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

function resolvePlayerDeathSite(victim: any, deps: any) {
    const instance = victim.instanceId ? deps.getInstanceRuntime(victim.instanceId) : null;
    return {
        instance,
        x: victim.x,
        y: victim.y,
    };
}

function resolveOfflineDefeatSourceName(killerPlayerId: string | null, killer: any, instance: any): string {
    if (killer) {
        return resolvePlayerDisplayName(killer, { playerId: killer.playerId, fallback: '未知敌手' });
    }
    const normalizedKillerId = typeof killerPlayerId === 'string' ? killerPlayerId.trim() : '';
    const monster = normalizedKillerId && typeof instance?.getMonster === 'function'
        ? instance.getMonster(normalizedKillerId)
        : null;
    return resolvePlayerFacingContentName(
        monster?.monsterId ?? normalizedKillerId,
        '未知敌手',
        monster?.displayName,
        monster?.name,
    );
}

function interruptTechniqueActivitiesForDefeat(playerId: string, victim: any, deps: any): void {
    if (typeof deps?.worldRuntimeCraftInterruptService?.interruptCraftForReason !== 'function') {
        return;
    }
    deps.worldRuntimeCraftInterruptService.interruptCraftForReason(playerId, victim, 'defeat', deps);
}

function isOfflineRuntimePlayer(player: any) {
    return !player?.sessionId || (typeof player.sessionId === 'string' && !player.sessionId.trim());
}

function pushShaDeathPenaltyMessages(deps: any, playerId: string, deathPenalty: any) {
    if ((deathPenalty.consumedProgress ?? 0) > 0 || (deathPenalty.consumedFoundation ?? 0) > 0) {
        const fallback = `体内煞气反噬，折损 ${deathPenalty.consumedProgress} 点境界修为${deathPenalty.consumedFoundation > 0 ? `，并再损 ${deathPenalty.consumedFoundation} 点底蕴` : ''}。`;
        const notice = buildStructuredNotice('combat', 'notice.combat.sha-backlash-loss', fallback, {
            vars: { progress: deathPenalty.consumedProgress, foundation: deathPenalty.consumedFoundation },
            pills: [
                { key: 'progress', style: 'damage', color: '#a855f7', tooltipTitle: '煞气反噬', tooltipLines: [`折损境界修为 ${deathPenalty.consumedProgress}`] },
            ],
        });
        deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
    }
    if ((deathPenalty.backlashAddedStacks ?? 0) > 0) {
        const fallback = `身死之后，${deathPenalty.backlashAddedStacks} 层煞气入体转为煞气反噬；当前煞气反噬 ${deathPenalty.backlashTotalStacks} 层，煞气入体余 ${deathPenalty.remainingInfusionStacks} 层。`;
        const notice = buildStructuredNotice('combat', 'notice.combat.sha-backlash-convert', fallback, {
            vars: { added: deathPenalty.backlashAddedStacks, total: deathPenalty.backlashTotalStacks, remaining: deathPenalty.remainingInfusionStacks },
            pills: [
                { key: 'total', style: 'damage', color: '#a855f7', tooltipTitle: '煞气反噬', tooltipLines: [`新增 ${deathPenalty.backlashAddedStacks} 层`, `煞气入体余 ${deathPenalty.remainingInfusionStacks} 层`] },
            ],
        });
        deps.queuePlayerNotice(playerId, notice.text, notice.kind, undefined, undefined, notice.structured);
    }
}
