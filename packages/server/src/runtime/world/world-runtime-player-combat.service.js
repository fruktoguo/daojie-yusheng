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
    contentTemplateRepository;
    playerRuntimeService;
    constructor(contentTemplateRepository, playerRuntimeService) {
        this.contentTemplateRepository = contentTemplateRepository;
        this.playerRuntimeService = playerRuntimeService;
    }
    handlePlayerMonsterKill(instance, monster, killerPlayerId, deps) {
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
    distributeMonsterKillProgress(instance, monster, killerPlayerId, deps) {
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
    resolveMonsterExpParticipants(instance, runtimeId, killerPlayerId) {
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
    resolveMonsterTopContributionRealmLv(participants) {
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
    deliverMonsterLoot(playerId, instance, x, y, item, deps) {
        if (this.playerRuntimeService.canReceiveInventoryItem(playerId, item.itemId)) {
            this.playerRuntimeService.receiveInventoryItem(playerId, item);
            deps.queuePlayerNotice(playerId, `获得 ${formatItemStackLabel(item)}`, 'loot');
            return;
        }
        deps.spawnGroundItem(instance, x, y, item);
        deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 掉落在 (${x}, ${y}) 的地面上，但你的背包已满。`, 'loot');
    }
    handlePlayerDefeat(playerId, deps) {
        deps.pendingCommands.delete(playerId);
        deps.worldRuntimeGmQueueService.markPendingRespawn(playerId);
    }
};
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService;
exports.WorldRuntimePlayerCombatService = WorldRuntimePlayerCombatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [content_template_repository_1.ContentTemplateRepository,
        player_runtime_service_1.PlayerRuntimeService])
], WorldRuntimePlayerCombatService);
