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

const player_runtime_service_1 = require("../player/player-runtime.service");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { formatItemStackLabel } = world_runtime_normalization_helpers_1;

/** world-runtime player combat outcome：承接玩家战斗结果收口与击杀奖励分发。 */
let WorldRuntimePlayerCombatService = class WorldRuntimePlayerCombatService {
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

    handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        deps.queuePlayerNotice(killerPlayerId, `${monster.name} 被你斩杀`, 'combat');
        deps.advanceKillQuestProgress(killerPlayerId, monster.monsterId, monster.name);
        this.distributeMonsterKillProgress(instance, monster, killerPlayerId, deps);
        const killer = this.playerRuntimeService.getPlayer(killerPlayerId);
        const lootRate = killer?.attrs.numericStats.lootRate ?? 0;
        const rareLootRate = killer?.attrs.numericStats.rareLootRate ?? 0;
        const items = this.contentTemplateRepository.rollMonsterDrops(monster.monsterId, 1, lootRate, rareLootRate);
        for (const item of items) {
            this.deliverMonsterLoot(killerPlayerId, instance, monster.x, monster.y, item, deps);
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

    deliverMonsterLoot(playerId, instance, x, y, item, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            deps.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
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

    dispatchDamagePlayer(playerId, amount, deps) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        if (player.hp <= 0) {
            this.handlePlayerDefeat(playerId, deps);
            return;
        }
        const updated = this.playerRuntimeService.applyDamage(playerId, amount);
        this.playerRuntimeService.recordActivity(playerId, deps.resolveCurrentTickForPlayerId(playerId), {
            interruptCultivation: true,
        });
        if (updated.hp <= 0) {
            this.handlePlayerDefeat(playerId, deps);
        }
    }    
    /**
 * handlePlayerDefeat：处理玩家Defeat并更新相关状态。
 * @param playerId 玩家 ID。
 * @param deps 运行时依赖。
 * @returns 无返回值，直接更新玩家Defeat相关状态。
 */

    handlePlayerDefeat(playerId, deps) {
        deps.clearPendingCommand(playerId);
        deps.worldRuntimeGmQueueService.markPendingRespawn(playerId);
    }
};
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService;
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimePlayerCombatService);

export { WorldRuntimePlayerCombatService };
