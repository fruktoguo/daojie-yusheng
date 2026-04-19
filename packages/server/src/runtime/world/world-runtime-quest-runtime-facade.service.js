"use strict";

var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};

Object.defineProperty(exports, "__esModule", { value: true });
exports.WorldRuntimeQuestRuntimeFacadeService = void 0;

const common_1 = require("@nestjs/common");

/** world-runtime quest-runtime facade：承接 quest state 与 NPC access 运行时 facade。 */
let WorldRuntimeQuestRuntimeFacadeService = class WorldRuntimeQuestRuntimeFacadeService {
    resolveAdjacentNpc(playerId, npcId, deps) {
        return deps.worldRuntimeNpcAccessService.resolveAdjacentNpc(playerId, npcId, deps);
    }
    refreshQuestStates(playerId, forceDirty, deps) {
        deps.worldRuntimeQuestStateService.refreshQuestStates(playerId, forceDirty);
    }
    tryAcceptNextQuest(playerId, nextQuestId, deps) {
        return deps.worldRuntimeQuestStateService.tryAcceptNextQuest(playerId, nextQuestId);
    }
    advanceKillQuestProgress(playerId, monsterId, monsterName, deps) {
        deps.worldRuntimeQuestStateService.advanceKillQuestProgress(playerId, monsterId, monsterName);
    }
    advanceLearnTechniqueQuest(playerId, techniqueId, deps) {
        deps.worldRuntimeQuestStateService.advanceLearnTechniqueQuest(playerId, techniqueId);
    }
    canReceiveRewardItems(playerId, rewards, deps) {
        return deps.worldRuntimeQuestStateService.canReceiveRewardItems(playerId, rewards);
    }
    getNpcForPlayerMap(playerId, npcId, deps) {
        return deps.worldRuntimeNpcAccessService.getNpcForPlayerMap(playerId, npcId, deps);
    }
};
exports.WorldRuntimeQuestRuntimeFacadeService = WorldRuntimeQuestRuntimeFacadeService;
exports.WorldRuntimeQuestRuntimeFacadeService = WorldRuntimeQuestRuntimeFacadeService = __decorate([
    (0, common_1.Injectable)()
], WorldRuntimeQuestRuntimeFacadeService);
