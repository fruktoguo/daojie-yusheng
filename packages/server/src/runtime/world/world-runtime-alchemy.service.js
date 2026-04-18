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
exports.WorldRuntimeAlchemyService = void 0;

const common_1 = require("@nestjs/common");
const shared_1 = require("@mud/shared-next");
const world_session_service_1 = require("../../network/world-session.service");
const world_client_event_service_1 = require("../../network/world-client-event.service");
const player_runtime_service_1 = require("../player/player-runtime.service");
const craft_panel_runtime_service_1 = require("../craft/craft-panel-runtime.service");

/** world-runtime alchemy orchestration：承接炼丹写路径、preset 和面板刷新。 */
let WorldRuntimeAlchemyService = class WorldRuntimeAlchemyService {
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
    interruptAlchemyForReason(playerId, player, reason, deps) {
        this.flushAlchemyMutation(playerId, this.craftPanelRuntimeService.interruptAlchemy(player, reason), deps);
    }
    dispatchStartAlchemy(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.startAlchemy(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '启动炼丹失败');
        }
        this.flushAlchemyMutation(playerId, result, deps);
    }
    dispatchCancelAlchemy(playerId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.cancelAlchemy(player);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '取消炼丹失败');
        }
        this.flushAlchemyMutation(playerId, result, deps);
    }
    dispatchSaveAlchemyPreset(playerId, payload, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.saveAlchemyPreset(player, payload);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '保存炼制预设失败');
        }
        this.flushAlchemyMutation(playerId, result, deps);
    }
    dispatchDeleteAlchemyPreset(playerId, presetId, deps) {
        const player = this.playerRuntimeService.getPlayerOrThrow(playerId);
        const result = this.craftPanelRuntimeService.deleteAlchemyPreset(player, presetId);
        if (!result.ok) {
            throw new common_1.BadRequestException(result.error ?? '删除炼制预设失败');
        }
        this.flushAlchemyMutation(playerId, result, deps);
    }
    tickAlchemy(playerId, player, deps) {
        this.flushAlchemyMutation(playerId, this.craftPanelRuntimeService.tickAlchemy(player), deps);
    }
    emitAlchemyPanelUpdate(playerId, deps) {
        const socket = this.worldSessionService.getSocketByPlayerId(playerId);
        const player = this.playerRuntimeService.getPlayer(playerId);
        if (!socket || !player || !this.worldClientEventService.prefersNext(socket)) {
            return;
        }
        socket.emit(shared_1.NEXT_S2C.AlchemyPanel, this.craftPanelRuntimeService.buildAlchemyPanelPayload(player));
    }
    flushAlchemyMutation(playerId, result, deps) {
        if (!result?.ok) {
            return;
        }
        if (Array.isArray(result.groundDrops) && result.groundDrops.length > 0) {
            this.dropGroundItems(playerId, result.groundDrops, deps);
        }
        for (const message of result.messages ?? []) {
            if (message?.text) {
                deps.queuePlayerNotice(playerId, message.text, message.kind ?? 'info');
            }
        }
        if (result.panelChanged) {
            this.emitAlchemyPanelUpdate(playerId, deps);
        }
    }
    dropGroundItems(playerId, items, deps) {
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
exports.WorldRuntimeAlchemyService = WorldRuntimeAlchemyService;
exports.WorldRuntimeAlchemyService = WorldRuntimeAlchemyService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_runtime_service_1.PlayerRuntimeService,
        craft_panel_runtime_service_1.CraftPanelRuntimeService,
        world_session_service_1.WorldSessionService,
        world_client_event_service_1.WorldClientEventService])
], WorldRuntimeAlchemyService);

function formatItemStackLabel(item) {
    return `${item.name ?? item.itemId} x${Math.max(1, Math.floor(Number(item.count) || 1))}`;
}
