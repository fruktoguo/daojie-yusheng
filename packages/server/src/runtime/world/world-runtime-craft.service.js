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
exports.WorldRuntimeCraftService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const world_session_service_1 = require("../../network/world-session.service");
const world_client_event_service_1 = require("../../network/world-client-event.service");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");

/** world-runtime craft orchestration：承接 craft 写路径编排、tick 推进和面板同步。 */
let WorldRuntimeCraftService = class WorldRuntimeCraftService {
    playerRuntimeService;
    craftPanelRuntimeService;
    worldSessionService;
    worldClientEventService;
    constructor(playerRuntimeService, craftPanelRuntimeService, worldSessionService, worldClientEventService) {
        this.playerRuntimeService = playerRuntimeService;
        this.craftPanelRuntimeService = craftPanelRuntimeService;
        this.worldSessionService = worldSessionService;
        this.worldClientEventService = worldClientEventService;
    }
    interruptCraftForReason(playerId, player, reason, deps) {
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(player, reason), 'alchemy', deps);
        this.flushCraftMutation(playerId, this.craftPanelRuntimeService.interruptEnhancement(player, reason), 'enhancement', deps);
    }
    dispatchStartAlchemy(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.startAlchemy(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动炼丹失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy', deps);
    }
    dispatchCancelAlchemy(playerId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.cancelAlchemy(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消炼丹失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy', deps);
    }
    dispatchSaveAlchemyPreset(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.saveAlchemyPreset(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '保存炼制预设失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy', deps);
    }
    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.deleteAlchemyPreset(player, presetId);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '删除炼制预设失败');
        }
        this.flushCraftMutation(playerId, result, 'alchemy', deps);
    }
    dispatchStartEnhancement(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.startEnhancement(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动强化失败');
        }
        this.flushCraftMutation(playerId, result, 'enhancement', deps);
    }
    dispatchCancelEnhancement(playerId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.cancelEnhancement(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消强化失败');
        }
        this.flushCraftMutation(playerId, result, 'enhancement', deps);
    }
    advanceCraftJobs(playerIds, deps) {
        for (const playerId of playerIds) {
            const player = this.playerRuntimeService.getPlayer(playerId);
            if (!player) {
                continue;
            }
            if (this.craftPanelRuntimeService.hasActiveAlchemyJob(player)) {
                this.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickAlchemy(player), 'alchemy', deps);
            }
            if (this.craftPanelRuntimeService.hasActiveEnhancementJob(player)) {
                this.flushCraftMutation(playerId, this.craftPanelRuntimeService.tickEnhancement(player), 'enhancement', deps);
            }
        }
    }
    emitCraftPanelUpdate(playerId, panel, deps) {
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!socket || !player || !this.worldClientEventService.prefersNext(socket)) {
            return;
        }
        if (panel === 'alchemy') {
            socket.emit(shared_1.NEXT_S2C.AlchemyPanel, this.craftPanelRuntimeService.buildAlchemyPanelPayload(player));
            return;
        }
        socket.emit(shared_1.NEXT_S2C.EnhancementPanel, this.craftPanelRuntimeService.buildEnhancementPanelPayload(player));
    }
    flushCraftMutation(playerId, result, panel, deps) {
        if (!result?.ok) {
            return;
        }
        if (Array.isArray(result.groundDrops) && result.groundDrops.length > 0) {
            this.dropCraftGroundItems(playerId, result.groundDrops, deps);
        }
        for (const message of result.messages ?? []) {
            if (message?.text) {
                deps.queuePlayerNotice(playerId, message.text, message.kind ?? 'info');
            }
        }
        if (result.panelChanged) {
            this.emitCraftPanelUpdate(playerId, panel, deps);
        }
    }
    dropCraftGroundItems(playerId, items, deps) {
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!player) {
            return;
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        for (const item of items) {
            try {
                deps.spawnGroundItem(instance, player.x, player.y, item);
                deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 背包放不下，已落在你脚边。`, 'loot');
            }
            catch {
                this.playerRuntimeService.receiveInventoryItem(playerId, item);
                deps.queuePlayerNotice(playerId, `${formatItemStackLabel(item)} 无法落地，已直接放回背包。`, 'warn');
            }
        }
    }
};
exports.WorldRuntimeCraftService = WorldRuntimeCraftService;
exports.WorldRuntimeCraftService = WorldRuntimeCraftService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService])
], WorldRuntimeCraftService);

function formatItemStackLabel(item) {
    return `${item.name ?? item.itemId} x${Math.max(1, Math.floor(Number(item.count) || 1))}`;
}
