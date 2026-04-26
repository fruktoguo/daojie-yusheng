import { Inject, Injectable } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

import {
    buildBootstrapPanelDelta,
    buildFullPanelDelta,
    buildFullSelfDelta,
    buildFullWorldDelta,
    buildMapEnter,
    buildPanelDelta,
    buildSelfDelta,
    capturePlayerState,
    captureProjectorState,
    captureWorldState,
    combineProjectorState,
    diffContainerEntries,
    diffFormationEntries,
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
} from './world-projector.helpers';

type MapTemplateRepositoryPort = {
    has(mapId: string): boolean;
    getOrThrow(mapId: string): { name?: string | null };
};

@Injectable()
export class WorldProjectorService {
    private readonly cacheByPlayerId = new Map<string, any>();

    constructor(
        @Inject(MapTemplateRepository)
        private readonly templateRepository: MapTemplateRepositoryPort,
    ) {}

    private resolveMapName(mapId: string | null | undefined): string | null {
        if (typeof mapId !== 'string') {
            return null;
        }
        const normalizedMapId = mapId.trim();
        if (!normalizedMapId || !this.templateRepository.has(normalizedMapId)) {
            return null;
        }
        const template = this.templateRepository.getOrThrow(normalizedMapId);
        return typeof template.name === 'string' && template.name.trim()
            ? template.name.trim()
            : normalizedMapId;
    }

    createInitialEnvelope(binding: any, view: any, player: any) {
        this.cacheByPlayerId.set(binding.playerId, captureProjectorState(view, player, (mapId) => this.resolveMapName(mapId)));
        return {
            initSession: {
                sid: binding.sessionId,
                pid: binding.playerId,
                t: view.tick,
                resumed: binding.resumed || undefined,
            },
            mapEnter: buildMapEnter(view),
            worldDelta: buildFullWorldDelta(view, (mapId) => this.resolveMapName(mapId)),
            selfDelta: buildFullSelfDelta(player),
            panelDelta: buildBootstrapPanelDelta(player),
        };
    }

    createDeltaEnvelope(view: any, player: any) {
        const previous = this.cacheByPlayerId.get(view.playerId);
        if (!previous) {
            this.cacheByPlayerId.set(view.playerId, captureProjectorState(view, player, (mapId) => this.resolveMapName(mapId)));
            return {
                mapEnter: buildMapEnter(view),
                worldDelta: buildFullWorldDelta(view, (mapId) => this.resolveMapName(mapId)),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }
        if (previous.instanceId !== view.instance.instanceId || previous.self?.templateId !== player.templateId) {
            this.cacheByPlayerId.set(view.playerId, captureProjectorState(view, player, (mapId) => this.resolveMapName(mapId)));
            return {
                mapEnter: buildMapEnter(view),
                worldDelta: buildFullWorldDelta(view, (mapId) => this.resolveMapName(mapId)),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }
        const currentWorld = previous.worldRevision === view.worldRevision && !hasDynamicContainerCountdown(view, previous.containers)
            ? previous
            : captureWorldState(view, (mapId) => this.resolveMapName(mapId));
        const current = combineProjectorState(currentWorld, capturePlayerState(player));
        this.cacheByPlayerId.set(view.playerId, current);
        const worldChanged = previous.worldRevision !== current.worldRevision || currentWorld !== previous;
        const playerPatch = worldChanged ? diffPlayerEntries(previous.players, current.players) : [];
        const monsterPatch = worldChanged ? diffMonsterEntries(previous.monsters, current.monsters) : [];
        const npcPatch = worldChanged ? diffNpcEntries(previous.npcs, current.npcs) : [];
        const portalPatch = worldChanged ? diffPortalEntries(previous.portals, current.portals) : [];
        const groundPatch = worldChanged ? diffGroundPiles(previous.groundPiles, current.groundPiles) : [];
        const containerPatch = worldChanged ? diffContainerEntries(previous.containers, current.containers) : [];
        const formationPatch = worldChanged ? diffFormationEntries(previous.formations, current.formations) : [];
        const selfDelta = buildSelfDelta(previous, player);
        const panelDelta = buildPanelDelta(previous, player);
        if (
            playerPatch.length === 0
            && monsterPatch.length === 0
            && npcPatch.length === 0
            && portalPatch.length === 0
            && groundPatch.length === 0
            && containerPatch.length === 0
            && formationPatch.length === 0
            && !selfDelta
            && !panelDelta
        ) {
            return null;
        }
        return {
            worldDelta:
                playerPatch.length > 0
                || monsterPatch.length > 0
                || npcPatch.length > 0
                || portalPatch.length > 0
                || groundPatch.length > 0
                || containerPatch.length > 0
                || formationPatch.length > 0
                    ? {
                        t: view.tick,
                        wr: view.worldRevision,
                        sr: view.selfRevision,
                        p: playerPatch.length > 0 ? playerPatch : undefined,
                        m: monsterPatch.length > 0 ? monsterPatch : undefined,
                        n: npcPatch.length > 0 ? npcPatch : undefined,
                        o: portalPatch.length > 0 ? portalPatch : undefined,
                        g: groundPatch.length > 0 ? groundPatch : undefined,
                        c: containerPatch.length > 0 ? containerPatch : undefined,
                        fmn: formationPatch.length > 0 ? formationPatch : undefined,
                    }
                    : undefined,
            selfDelta: selfDelta ?? undefined,
            panelDelta: panelDelta ?? undefined,
        };
    }

    clear(playerId: string): void {
        this.cacheByPlayerId.delete(playerId);
    }

    getEventNames() {
        return S2C;
    }
}

function hasDynamicContainerCountdown(view: any, previousContainers: Map<string, any>): boolean {
    if (Array.isArray(view?.localContainers) && view.localContainers.some((entry: any) => entry?.respawnRemainingTicks !== undefined)) {
        return true;
    }
    for (const entry of previousContainers.values()) {
        if (entry?.rr !== undefined) {
            return true;
        }
    }
    return false;
}
