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
exports.WorldSyncThreatService = void 0;

const common_1 = require("@nestjs/common");

const shared_1 = require("@mud/shared-next");

const world_runtime_service_1 = require("../runtime/world/world-runtime.service");

const player_runtime_service_1 = require("../runtime/player/player-runtime.service");

/** threat 冷路径同步服务：负责 threat arrows 构造、diff 与下发。 */
let WorldSyncThreatService = class WorldSyncThreatService {
    /** 世界 runtime，用于读取 monster aggro 状态。 */
    worldRuntimeService;
    /** 玩家 runtime，用于读取 combat target。 */
    playerRuntimeService;
    constructor(worldRuntimeService, playerRuntimeService) {
        this.worldRuntimeService = worldRuntimeService;
        this.playerRuntimeService = playerRuntimeService;
    }
    /** 初始同步时按当前视野下发完整 threat arrows。 */
    emitInitialThreatSync(socket, view, threatArrows = this.buildThreatArrows(view)) {
        if (threatArrows.length > 0) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, {
                t: view.tick,
                wr: view.worldRevision,
                sr: view.selfRevision,
                threatArrows: cloneThreatArrows(threatArrows),
            });
        }
        return threatArrows;
    }
    /** 增量同步时按需下发 threat arrow patch。 */
    emitDeltaThreatSync(socket, view, previousThreatArrows, mapChanged) {

        const currentThreatArrows = this.buildThreatArrows(view);
        const threatArrowPatch = diffThreatArrows(previousThreatArrows ?? null, currentThreatArrows, mapChanged);
        if (threatArrowPatch.full || threatArrowPatch.adds.length > 0 || threatArrowPatch.removes.length > 0) {
            socket.emit(shared_1.NEXT_S2C.WorldDelta, {
                t: view.tick,
                wr: view.worldRevision,
                sr: view.selfRevision,
                threatArrows: threatArrowPatch.full ?? undefined,
                threatArrowAdds: threatArrowPatch.full ? undefined : (threatArrowPatch.adds.length > 0 ? threatArrowPatch.adds : undefined),
                threatArrowRemoves: threatArrowPatch.full ? undefined : (threatArrowPatch.removes.length > 0 ? threatArrowPatch.removes : undefined),
            });
        }
        return currentThreatArrows;
    }
    /** 构造当前玩家视野内的 threat arrows。 */
    buildThreatArrows(view) {

        const visiblePlayerIds = new Set([
            view.playerId,
            ...view.visiblePlayers.map((entry) => entry.playerId),
        ]);

        const visibleMonsterIds = new Set(view.localMonsters.map((entry) => entry.runtimeId));

        const visibleEntityIds = new Set([...visiblePlayerIds, ...visibleMonsterIds]);

        const arrows = [];

        const seen = new Set();

        const pushArrow = (ownerId, targetId) => {
            if (!targetId || ownerId === targetId) {
                return;
            }
            if (!visibleEntityIds.has(ownerId) || !visibleEntityIds.has(targetId)) {
                return;
            }

            const key = `${ownerId}->${targetId}`;
            if (seen.has(key)) {
                return;
            }
            seen.add(key);
            arrows.push([ownerId, targetId]);
        };
        for (const playerId of visiblePlayerIds) {
            const runtimePlayer = this.playerRuntimeService.getPlayer(playerId);
            const targetRef = runtimePlayer?.combat?.combatTargetId;
            if (typeof targetRef !== 'string' || targetRef.length === 0) {
                continue;
            }

            const targetId = targetRef.startsWith('player:')
                ? targetRef.slice('player:'.length)
                : targetRef.startsWith('tile:') || targetRef.startsWith('container:')
                    ? null
                    : targetRef;
            pushArrow(playerId, targetId);
        }
        for (const monster of view.localMonsters) {
            const runtimeMonster = this.worldRuntimeService.getInstanceMonster(view.instance.instanceId, monster.runtimeId);
            if (!runtimeMonster?.alive || !runtimeMonster.aggroTargetPlayerId) {
                continue;
            }
            pushArrow(monster.runtimeId, runtimeMonster.aggroTargetPlayerId);
        }
        arrows.sort(compareThreatArrows);
        return arrows;
    }
};
exports.WorldSyncThreatService = WorldSyncThreatService;
exports.WorldSyncThreatService = WorldSyncThreatService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [world_runtime_service_1.WorldRuntimeService,
        player_runtime_service_1.PlayerRuntimeService])
], WorldSyncThreatService);
function cloneThreatArrows(source) {
    return source.map(([ownerId, targetId]) => [ownerId, targetId]);
}
function diffThreatArrows(previous, current, forceFull) {
    if (forceFull || !previous) {
        return {
            full: cloneThreatArrows(current),
            adds: [],
            removes: [],
        };
    }

    const previousKeys = new Set(previous.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));

    const currentKeys = new Set(current.map(([ownerId, targetId]) => buildThreatArrowKey(ownerId, targetId)));

    const adds = current.filter(([ownerId, targetId]) => !previousKeys.has(buildThreatArrowKey(ownerId, targetId)));

    const removes = previous.filter(([ownerId, targetId]) => !currentKeys.has(buildThreatArrowKey(ownerId, targetId)));
    return {
        full: null,
        adds,
        removes,
    };
}
function buildThreatArrowKey(ownerId, targetId) {
    return `${ownerId}\n${targetId}`;
}
function compareThreatArrows(left, right) {
    if (left[0] !== right[0]) {
        return compareStableStrings(left[0], right[0]);
    }
    return compareStableStrings(left[1], right[1]);
}
function compareStableStrings(left, right) {
    if (left < right) {
        return -1;
    }
    if (left > right) {
        return 1;
    }
    return 0;
}
