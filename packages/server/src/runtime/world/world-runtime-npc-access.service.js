"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeNpcAccessService = void 0;

const common_1 = require("@nestjs/common");

/** NPC 邻接访问服务：承接玩家相邻 NPC 的读取与距离校验。 */
let WorldRuntimeNpcAccessService = class WorldRuntimeNpcAccessService {
    resolveAdjacentNpc(playerId, npcId, deps) {
        const location = deps.getPlayerLocationOrThrow(playerId);
        const instance = deps.getInstanceRuntimeOrThrow(location.instanceId);
        const npc = instance.getAdjacentNpc(playerId, npcId);
        if (!npc) {
            throw new common_1.NotFoundException('你离这位商人太远了');
        }
        return npc;
    }
    getNpcForPlayerMap(playerId, npcId, deps) {
        const location = deps.getPlayerLocation(playerId);
        if (!location) {
            return null;
        }
        return deps.getInstanceRuntime(location.instanceId)?.getNpc(npcId) ?? null;
    }
};
exports.WorldRuntimeNpcAccessService = WorldRuntimeNpcAccessService;
exports.WorldRuntimeNpcAccessService = WorldRuntimeNpcAccessService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeNpcAccessService);
