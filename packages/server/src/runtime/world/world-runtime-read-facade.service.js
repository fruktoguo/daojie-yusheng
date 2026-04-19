"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeReadFacadeService = void 0;

const common_1 = require("@nestjs/common");

const world_runtime_normalization_helpers_1 = require("./world-runtime.normalization.helpers");

const { normalizeCoordinate } = world_runtime_normalization_helpers_1;

/** world-runtime read facade：承接高层读侧 envelope、详情与只读校验 facade。 */
let WorldRuntimeReadFacadeService = class WorldRuntimeReadFacadeService {
    buildNpcShopView(playerId, npcIdInput, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        return deps.worldRuntimeNpcShopQueryService.buildNpcShopView(playerId, npcId, deps);
    }
    buildQuestListView(playerId, _input, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        deps.refreshQuestStates(playerId);
        return deps.worldRuntimeQuestQueryService.buildQuestListView(playerId);
    }
    buildNpcQuestsView(playerId, npcIdInput, deps) {
        deps.getPlayerLocationOrThrow(playerId);
        const npcId = typeof npcIdInput === 'string' ? npcIdInput.trim() : '';
        if (!npcId) {
            throw new common_1.BadRequestException('npcId is required');
        }
        deps.refreshQuestStates(playerId);
        return deps.worldRuntimeQuestQueryService.buildNpcQuestsView(playerId, npcId, deps);
    }
    buildDetail(playerId, input, deps) {
        const location = deps.getPlayerLocationOrThrow(playerId);
        const kind = input.kind;
        const id = typeof input.id === 'string' ? input.id.trim() : '';
        if (!id) {
            throw new common_1.BadRequestException('id is required');
        }
        if (kind !== 'npc' && kind !== 'monster' && kind !== 'ground' && kind !== 'player' && kind !== 'portal' && kind !== 'container') {
            throw new common_1.BadRequestException(`Unsupported detail kind: ${String(kind)}`);
        }
        const view = deps.getPlayerViewOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const viewer = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        return deps.worldRuntimeDetailQueryService.buildDetail({ view, viewer, location, instance }, { kind, id });
    }
    buildTileDetail(playerId, input, deps) {
        const location = deps.getPlayerLocationOrThrow(playerId);
        const x = normalizeCoordinate(typeof input.x === 'number' ? input.x : Number.NaN, 'x');
        const y = normalizeCoordinate(typeof input.y === 'number' ? input.y : Number.NaN, 'y');
        const view = deps.getPlayerViewOrThrow(playerId);
        const viewer = deps.playerRuntimeService.getPlayerOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        return deps.worldRuntimeDetailQueryService.buildTileDetail({ view, viewer, location, instance }, { x, y });
    }
    buildLootWindowSyncState(playerId, tileX, tileY, deps) {
        const player = deps.playerRuntimeService.getPlayer(playerId);
        if (!player?.instanceId) {
            return null;
        }
        if (Math.max(Math.abs(player.x - tileX), Math.abs(player.y - tileY)) > 1) {
            return null;
        }
        const view = deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId);
        if (!view) {
            return null;
        }
        const instance = deps.getInstanceRuntimeOrThrow(player.instanceId);
        const container = instance.getContainerAtTile(tileX, tileY);
        if (container) {
            deps.worldRuntimeLootContainerService.prepareContainerLootSource(instance.meta.instanceId, container, deps.tick);
        }
        return deps.worldRuntimePlayerViewQueryService.buildLootWindowSyncState(deps, playerId, tileX, tileY);
    }
    refreshPlayerContextActions(playerId, view, deps) {
        const resolvedView = view ?? deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId);
        if (!resolvedView) {
            return null;
        }
        deps.playerRuntimeService.setContextActions(playerId, this.buildContextActions(resolvedView, deps), resolvedView.tick);
        return resolvedView;
    }
    getPlayerView(playerId, radius, deps) {
        return deps.worldRuntimePlayerViewQueryService.getPlayerView(deps, playerId, radius);
    }
    createNpcQuestsEnvelope(playerId, npcId, deps) {
        const npc = deps.worldRuntimeNpcAccessService.resolveAdjacentNpc(playerId, npcId, deps);
        return deps.worldRuntimeQuestQueryService.createNpcQuestsEnvelope(playerId, npc);
    }
    resolveQuestProgress(playerId, quest, deps) {
        return deps.worldRuntimeQuestQueryService.resolveQuestProgress(playerId, quest);
    }
    canQuestBecomeReady(playerId, quest, deps) {
        return deps.worldRuntimeQuestQueryService.canQuestBecomeReady(playerId, quest);
    }
    createQuestStateFromSource(playerId, questId, status, deps) {
        return deps.worldRuntimeQuestQueryService.createQuestStateFromSource(playerId, questId, status);
    }
    buildQuestRewardItems(quest, deps) {
        return deps.worldRuntimeQuestQueryService.buildQuestRewardItems(quest);
    }
    buildQuestRewardItemsFromRecord(quest, deps) {
        return deps.worldRuntimeQuestQueryService.buildQuestRewardItemsFromRecord(quest);
    }
    resolveQuestNavigationTarget(quest, deps) {
        return deps.worldRuntimeQuestQueryService.resolveQuestNavigationTarget(quest);
    }
    validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps) {
        return deps.worldRuntimeNpcShopQueryService.validateNpcShopPurchase(playerId, npcId, itemId, quantity, deps);
    }
    buildContextActions(view, deps) {
        return deps.worldRuntimeContextActionQueryService.buildContextActions(view);
    }
};
exports.WorldRuntimeReadFacadeService = WorldRuntimeReadFacadeService;
exports.WorldRuntimeReadFacadeService = WorldRuntimeReadFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeReadFacadeService);
