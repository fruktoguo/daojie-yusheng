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
exports.WorldPlayerSnapshotService = void 0;
const common_1 = require("@nestjs/common");
const player_persistence_service_1 = require("../persistence/player-persistence.service");
const world_legacy_player_source_service_1 = require("./world-legacy-player-source.service");
let WorldPlayerSnapshotService = class WorldPlayerSnapshotService {
    playerPersistenceService;
    worldLegacyPlayerSourceService;
    constructor(playerPersistenceService, worldLegacyPlayerSourceService) {
        this.playerPersistenceService = playerPersistenceService;
        this.worldLegacyPlayerSourceService = worldLegacyPlayerSourceService;
    }
    async loadPlayerSnapshot(playerId, allowLegacyFallback) {
        const nextSnapshot = await this.playerPersistenceService.loadPlayerSnapshot(playerId);
        if (nextSnapshot || !allowLegacyFallback) {
            return nextSnapshot;
        }
        return this.worldLegacyPlayerSourceService.loadLegacyPlayerSnapshot(playerId);
    }
};
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService;
exports.WorldPlayerSnapshotService = WorldPlayerSnapshotService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [player_persistence_service_1.PlayerPersistenceService,
        world_legacy_player_source_service_1.WorldLegacyPlayerSourceService])
], WorldPlayerSnapshotService);
//# sourceMappingURL=world-player-snapshot.service.js.map
