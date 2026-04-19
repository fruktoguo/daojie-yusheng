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
exports.WorldRuntimeActionExecutionService = void 0;

const common_1 = require("@nestjs/common");
const player_runtime_service_1 = require("../player/player-runtime.service");
const world_runtime_npc_quest_write_service_1 = require("./world-runtime-npc-quest-write.service");
const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { normalizeRuntimeActionId } = world_runtime_normalization_helpers_1;

/** world-runtime action execution orchestration：承接动作入口分流与低频 toggle/交互编排。 */
let WorldRuntimeActionExecutionService = class WorldRuntimeActionExecutionService {
    playerRuntimeService;
    worldRuntimeNpcQuestWriteService;
    constructor(playerRuntimeService, worldRuntimeNpcQuestWriteService) {
        this.playerRuntimeService = playerRuntimeService;
        this.worldRuntimeNpcQuestWriteService = worldRuntimeNpcQuestWriteService;
    }
    executeAction(playerId, actionIdInput, targetInput, deps) {
        deps.getPlayerLocationOrThrow(playerId);

        const currentTick = deps.resolveCurrentTickForPlayerId(playerId);

        const rawActionId = typeof actionIdInput === 'string' ? actionIdInput.trim() : '';
        if (!rawActionId) {
            throw new common_1.BadRequestException('actionId is required');
        }
        if (rawActionId.startsWith('npc:')) {
            return this.executeLegacyNpcAction(playerId, rawActionId.slice('npc:'.length), deps);
        }

        const actionId = normalizeRuntimeActionId(rawActionId);
        if (actionId === 'portal:travel') {
            return {
                kind: 'queued',
                view: deps.usePortal(playerId),
            };
        }
        if (actionId === 'realm:breakthrough') {
            deps.enqueuePendingCommand(playerId, {
                kind: 'breakthrough',
            });
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'body_training:infuse') {
            const target = typeof targetInput === 'string' ? targetInput.trim() : '';
            const foundationAmount = Number.parseInt(target, 10);
            if (!Number.isFinite(foundationAmount) || foundationAmount <= 0) {
                throw new common_1.BadRequestException('foundation amount is required');
            }
            const result = this.playerRuntimeService.infuseBodyTraining(playerId, foundationAmount);
            deps.queuePlayerNotice(playerId, `你将 ${result.foundationSpent} 点底蕴灌入肉身，转化为 ${result.expGained} 点炼体经验`, 'success');
            return {
                kind: 'queued',
                view: deps.getPlayerViewOrThrow(playerId),
            };
        }
        if (actionId === 'toggle:auto_battle') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoBattle', deps);
        }
        if (actionId === 'toggle:auto_retaliate') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoRetaliate', deps);
        }
        if (actionId === 'toggle:auto_battle_stationary') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoBattleStationary', deps);
        }
        if (actionId === 'toggle:allow_aoe_player_hit') {
            return this.toggleCombatSetting(playerId, currentTick, 'allowAoePlayerHit', deps);
        }
        if (actionId === 'toggle:auto_idle_cultivation') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoIdleCultivation', deps);
        }
        if (actionId === 'cultivation:toggle') {
            const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
            if (!player.techniques.cultivatingTechId) {
                throw new common_1.BadRequestException('当前没有主修功法');
            }
            const nextActive = !player.combat.cultivationActive;
            this.playerRuntimeService.cultivateTechnique(playerId, nextActive ? player.techniques.cultivatingTechId : null);
            deps.queuePlayerNotice(playerId, nextActive ? '已恢复当前修炼' : '已停止当前修炼', 'info');
            return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
        }
        if (actionId === 'toggle:auto_switch_cultivation') {
            return this.toggleCombatSetting(playerId, currentTick, 'autoSwitchCultivation', deps);
        }
        if (actionId === 'sense_qi:toggle') {
            return this.toggleCombatSetting(playerId, currentTick, 'senseQiActive', deps);
        }
        if (actionId.startsWith('npc_shop:')) {
            return {
                kind: 'npcShop',
                npcShop: deps.buildNpcShopView(playerId, actionId.slice('npc_shop:'.length)),
            };
        }
        if (actionId.startsWith('npc_quests:')) {
            const npcId = actionId.slice('npc_quests:'.length).trim();
            if (!npcId) {
                throw new common_1.BadRequestException('npcId is required');
            }
            return this.worldRuntimeNpcQuestWriteService.executeNpcQuestAction(playerId, npcId, deps);
        }
        throw new common_1.BadRequestException(`Unsupported actionId: ${actionId}`);
    }
    executeLegacyNpcAction(playerId, npcId, deps) {
        return this.worldRuntimeNpcQuestWriteService.executeNpcQuestAction(playerId, npcId, deps);
    }
    toggleCombatSetting(playerId, currentTick, key, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        this.playerRuntimeService.updateCombatSettings(playerId, {
            [key]: !player.combat[key],
        }, currentTick);
        return { kind: 'queued', view: deps.getPlayerViewOrThrow(playerId) };
    }
};
exports.WorldRuntimeActionExecutionService = WorldRuntimeActionExecutionService;
exports.WorldRuntimeActionExecutionService = WorldRuntimeActionExecutionService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        world_runtime_npc_quest_write_service_1.WorldRuntimeNpcQuestWriteService])
], WorldRuntimeActionExecutionService);
