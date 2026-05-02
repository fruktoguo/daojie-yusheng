import { Inject, Injectable, Optional } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
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
type NativePlayerAuthStorePort = {
    getMemoryUserByPlayerId?(playerId: string): {
        pendingRoleName?: string | null;
        playerName?: string | null;
        displayName?: string | null;
    } | null;
};

@Injectable()
export class WorldProjectorService {
    private readonly cacheByPlayerId = new Map<string, any>();

    constructor(
        @Inject(MapTemplateRepository)
        private readonly templateRepository: MapTemplateRepositoryPort,
        @Optional()
        @Inject(NativePlayerAuthStoreService)
        private readonly playerAuthStore: NativePlayerAuthStorePort | null = null,
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
        const identityView = this.withAccountIdentityProjection(view);
        this.cacheByPlayerId.set(binding.playerId, captureProjectorState(identityView, player, (mapId) => this.resolveMapName(mapId)));
        return {
            initSession: {
                sid: binding.sessionId,
                pid: binding.playerId,
                t: view.tick,
                resumed: binding.resumed || undefined,
            },
            mapEnter: buildMapEnter(identityView),
            worldDelta: buildFullWorldDelta(identityView, (mapId) => this.resolveMapName(mapId)),
            selfDelta: buildFullSelfDelta(player),
            panelDelta: buildBootstrapPanelDelta(player),
        };
    }

    createDeltaEnvelope(view: any, player: any) {
        const identityView = this.withAccountIdentityProjection(view);
        const previous = this.cacheByPlayerId.get(identityView.playerId);
        if (!previous) {
            this.cacheByPlayerId.set(identityView.playerId, captureProjectorState(identityView, player, (mapId) => this.resolveMapName(mapId)));
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDelta(identityView, (mapId) => this.resolveMapName(mapId)),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }
        if (previous.instanceId !== identityView.instance.instanceId || previous.self?.templateId !== player.templateId) {
            this.cacheByPlayerId.set(identityView.playerId, captureProjectorState(identityView, player, (mapId) => this.resolveMapName(mapId)));
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDelta(identityView, (mapId) => this.resolveMapName(mapId)),
                selfDelta: buildFullSelfDelta(player),
                panelDelta: buildFullPanelDelta(player),
            };
        }
        const currentWorld = previous.worldRevision === identityView.worldRevision
            && !hasDynamicContainerCountdown(identityView, previous.containers)
            && !hasPlayerPresentationScaleChange(identityView, previous.players)
            ? previous
            : captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
        const current = combineProjectorState(currentWorld, capturePlayerState(player));
        this.cacheByPlayerId.set(identityView.playerId, current);
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
                        wr: identityView.worldRevision,
                        sr: identityView.selfRevision,
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

    private withAccountIdentityProjection(view: any): any {
        if (!view) {
            return view;
        }
        let changed = false;
        const selfIdentity = this.resolveAccountIdentityProjection(view.playerId, view.self);
        const self = selfIdentity
            ? { ...view.self, ...selfIdentity }
            : view.self;
        changed ||= self !== view.self;
        const visiblePlayers = Array.isArray(view.visiblePlayers)
            ? view.visiblePlayers.map((entry: any) => {
                const identity = this.resolveAccountIdentityProjection(entry?.playerId, entry);
                if (!identity) {
                    return entry;
                }
                changed = true;
                return { ...entry, ...identity };
            })
            : view.visiblePlayers;
        return changed ? { ...view, self, visiblePlayers } : view;
    }

    private resolveAccountIdentityProjection(playerId: unknown, fallback: any): { name?: string; displayName?: string } | null {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || typeof this.playerAuthStore?.getMemoryUserByPlayerId !== 'function') {
            return null;
        }
        const account = this.playerAuthStore.getMemoryUserByPlayerId(normalizedPlayerId);
        if (!account) {
            return null;
        }
        const name = normalizeIdentityText(account.pendingRoleName) || normalizeIdentityText(account.playerName);
        const displayName = normalizeIdentityText(account.displayName);
        if (!name && !displayName) {
            return null;
        }
        return {
            name: name || normalizeIdentityText(fallback?.name),
            displayName: displayName || normalizeIdentityText(fallback?.displayName),
        };
    }
}

function normalizeIdentityText(value: unknown): string {
    return typeof value === 'string' ? value.trim().normalize('NFC') : '';
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

function hasPlayerPresentationScaleChange(view: any, previousPlayers: Map<string, any>): boolean {
    const candidates = [
        { playerId: view?.playerId, buffs: view?.self?.buffs },
        ...(Array.isArray(view?.visiblePlayers) ? view.visiblePlayers : []),
    ];
    for (const entry of candidates) {
        const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
        if (!playerId) {
            continue;
        }
        const nextScale = resolveBuffPresentationScale(entry?.buffs) ?? null;
        const previousScale = previousPlayers.get(playerId)?.sc ?? null;
        if (nextScale !== previousScale) {
            return true;
        }
    }
    return false;
}

function resolveBuffPresentationScale(source: any): number | undefined {
    const buffs = Array.isArray(source)
        ? source
        : Array.isArray(source?.buffs)
            ? source.buffs
            : [];
    let scale = 1;
    for (const buff of buffs) {
        if ((Number(buff?.remainingTicks ?? 0) <= 0) || (Number(buff?.stacks ?? 0) <= 0)) {
            continue;
        }
        const presentationScale = Number(buff?.presentationScale);
        if (Number.isFinite(presentationScale) && presentationScale > scale) {
            scale = presentationScale;
        }
    }
    return scale > 1 ? scale : undefined;
}
