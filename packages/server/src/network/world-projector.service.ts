/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { S2C } from '@mud/shared';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';

import {
    buildBootstrapPanelDelta,
    buildFullPanelDeltaFromState,
    buildFullSelfDeltaFromState,
    buildFullWorldDeltaFromState,
    buildMapEnter,
    buildPanelUpdate,
    buildSelfDelta,
    capturePanelState,
    capturePlayerState,
    captureSelfState,
    captureWorldState,
    combineProjectorState,
    diffBuildingEntries,
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

function capturePlayerStateForFullPanel(player: any): any {
    return capturePanelState(player);
}

/** 世界投影器服务：维护每个玩家的投影缓存，编排初始/增量 envelope 生成。 */
@Injectable()
export class WorldProjectorService {
    private readonly cacheByPlayerId = new Map<string, any>();
    private readonly identityProjectionByPlayerId = new Map<string, any>();

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

    /** 为新进入的玩家构造全量初始 envelope（initSession + mapEnter + worldDelta + selfDelta + panelDelta）。 */
    createInitialEnvelope(binding: any, view: any, player: any) {
        const identityView = this.withAccountIdentityProjection(view);
        const worldState = captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
        const playerState = capturePlayerState(player);
        this.cacheByPlayerId.set(binding.playerId, combineProjectorState(worldState, playerState));
        return {
            initSession: {
                sid: binding.sessionId,
                pid: binding.playerId,
                t: view.tick,
                resumed: binding.resumed || undefined,
            },
            mapEnter: buildMapEnter(identityView),
            worldDelta: buildFullWorldDeltaFromState(identityView, worldState),
            selfDelta: buildFullSelfDeltaFromState(playerState.self, playerState.selfRevision),
            panelDelta: buildBootstrapPanelDelta(player),
        };
    }

    /** 为已在线玩家构造增量 envelope：对比前帧缓存，仅包含变化的 world/self/panel patch。 */
    createDeltaEnvelope(view: any, player: any) {
        const identityView = this.withAccountIdentityProjection(view);
        const previous = this.cacheByPlayerId.get(identityView.playerId);
        if (!previous) {
            const worldState = captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
            const playerState = capturePlayerState(player);
            this.cacheByPlayerId.set(identityView.playerId, combineProjectorState(worldState, playerState));
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDeltaFromState(identityView, worldState),
                selfDelta: buildFullSelfDeltaFromState(playerState.self, playerState.selfRevision),
                panelDelta: buildFullPanelDeltaFromState(capturePlayerStateForFullPanel(player)),
            };
        }
        if (previous.instanceId !== identityView.instance.instanceId || previous.self?.templateId !== player.templateId) {
            const worldState = captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
            const playerState = capturePlayerState(player);
            this.cacheByPlayerId.set(identityView.playerId, combineProjectorState(worldState, playerState));
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDeltaFromState(identityView, worldState),
                selfDelta: buildFullSelfDeltaFromState(playerState.self, playerState.selfRevision),
                panelDelta: buildFullPanelDeltaFromState(capturePlayerStateForFullPanel(player)),
            };
        }
        const currentWorld = previous.worldRevision === identityView.worldRevision
            && !hasDynamicContainerCountdown(identityView, previous.containers)
            && !hasPlayerPresentationScaleChange(identityView, previous.players)
            ? previous
            : captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
        const worldChanged = previous.worldRevision !== currentWorld.worldRevision || currentWorld !== previous;
        const playerPatch = worldChanged ? diffPlayerEntries(previous.players, currentWorld.players) : [];
        const monsterPatch = worldChanged ? diffMonsterEntries(previous.monsters, currentWorld.monsters) : [];
        const npcPatch = worldChanged ? diffNpcEntries(previous.npcs, currentWorld.npcs) : [];
        const portalPatch = worldChanged ? diffPortalEntries(previous.portals, currentWorld.portals) : [];
        const groundPatch = worldChanged ? diffGroundPiles(previous.groundPiles, currentWorld.groundPiles) : [];
        const containerPatch = worldChanged ? diffContainerEntries(previous.containers, currentWorld.containers) : [];
        const buildingPatch = worldChanged ? diffBuildingEntries(previous.buildings, currentWorld.buildings) : [];
        const formationPatch = worldChanged ? diffFormationEntries(previous.formations, currentWorld.formations) : [];
        const selfDelta = buildSelfDelta(previous, player);
        const panelUpdate = buildPanelUpdate(previous, player);
        const panelDelta = panelUpdate.delta;
        const hasWorldPatch = playerPatch.length > 0
            || monsterPatch.length > 0
            || npcPatch.length > 0
            || portalPatch.length > 0
            || groundPatch.length > 0
            || containerPatch.length > 0
            || buildingPatch.length > 0
            || formationPatch.length > 0;
        const playerChanged = Boolean(selfDelta || panelDelta);
        if (worldChanged || playerChanged) {
            const current = playerChanged
                ? combineProjectorState(currentWorld, {
                    selfRevision: player.selfRevision,
                    self: captureSelfState(player),
                    attrPanel: panelUpdate.attrPanel,
                    actionPanel: panelUpdate.actionPanel,
                    techniquePanel: panelUpdate.techniquePanel,
                    panelCursor: panelUpdate.panelCursor,
                })
                : mergeWorldState(previous, currentWorld);
            this.cacheByPlayerId.set(identityView.playerId, current);
        }
        if (
            !hasWorldPatch
            && !selfDelta
            && !panelDelta
        ) {
            return null;
        }
        return {
            worldDelta:
                hasWorldPatch
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
                        bd: buildingPatch.length > 0 ? buildingPatch : undefined,
                        fmn: formationPatch.length > 0 ? formationPatch : undefined,
                    }
                    : undefined,
            selfDelta: selfDelta ?? undefined,
            panelDelta: panelDelta ?? undefined,
        };
    }

    clear(playerId: string): void {
        this.cacheByPlayerId.delete(playerId);
        this.identityProjectionByPlayerId.delete(playerId);
    }

    getCachedProjectorState(playerId: string): any | null {
        return this.cacheByPlayerId.get(playerId) ?? null;
    }

    getEventNames() {
        return S2C;
    }

    private withAccountIdentityProjection(view: any): any {
        if (!view) {
            return view;
        }
        const selfIdentity = this.resolveAccountIdentityProjection(view.playerId, view.self);
        const self = selfIdentity
            ? { ...view.self, ...selfIdentity }
            : view.self;
        let visiblePlayers = view.visiblePlayers;
        if (Array.isArray(view.visiblePlayers)) {
            for (let index = 0; index < view.visiblePlayers.length; index += 1) {
                const entry = view.visiblePlayers[index];
                const identity = this.resolveAccountIdentityProjection(entry?.playerId, entry);
                if (!identity) {
                    if (visiblePlayers !== view.visiblePlayers) {
                        visiblePlayers.push(entry);
                    }
                    continue;
                }
                if (visiblePlayers === view.visiblePlayers) {
                    visiblePlayers = view.visiblePlayers.slice(0, index);
                }
                visiblePlayers.push({ ...entry, ...identity });
            }
        }
        return self !== view.self || visiblePlayers !== view.visiblePlayers ? { ...view, self, visiblePlayers } : view;
    }

    private resolveAccountIdentityProjection(playerId: unknown, fallback: any): { name?: string; displayName?: string } | null {
        const normalizedPlayerId = typeof playerId === 'string' ? playerId.trim() : '';
        if (!normalizedPlayerId || typeof this.playerAuthStore?.getMemoryUserByPlayerId !== 'function') {
            return null;
        }
        const account = this.playerAuthStore.getMemoryUserByPlayerId(normalizedPlayerId);
        if (!account) {
            this.identityProjectionByPlayerId.delete(normalizedPlayerId);
            return null;
        }
        const name = normalizeIdentityText(account.pendingRoleName) || normalizeIdentityText(account.playerName);
        const displayName = normalizeIdentityText(account.displayName);
        if (!name && !displayName) {
            this.identityProjectionByPlayerId.delete(normalizedPlayerId);
            return null;
        }
        const fallbackName = normalizeIdentityText(fallback?.name);
        const fallbackDisplayName = normalizeIdentityText(fallback?.displayName);
        const cached = this.identityProjectionByPlayerId.get(normalizedPlayerId);
        if (cached
            && cached.name === name
            && cached.displayName === displayName
            && cached.fallbackName === fallbackName
            && cached.fallbackDisplayName === fallbackDisplayName) {
            return cached.projection;
        }
        const projection = {
            name: name || fallbackName,
            displayName: displayName || fallbackDisplayName,
        };
        this.identityProjectionByPlayerId.set(normalizedPlayerId, {
            name,
            displayName,
            fallbackName,
            fallbackDisplayName,
            projection,
        });
        return projection;
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

function mergeWorldState(previous: any, worldState: any): any {
    if (worldState === previous) {
        return previous;
    }
    return {
        ...previous,
        instanceId: worldState.instanceId,
        worldRevision: worldState.worldRevision,
        players: worldState.players,
        npcs: worldState.npcs,
        monsters: worldState.monsters,
        portals: worldState.portals,
        groundPiles: worldState.groundPiles,
        containers: worldState.containers,
        buildings: worldState.buildings,
        formations: worldState.formations,
    };
}

function hasPlayerPresentationScaleChange(view: any, previousPlayers: Map<string, any>): boolean {
    const selfPlayerId = typeof view?.playerId === 'string' ? view.playerId : '';
    if (selfPlayerId) {
        const nextScale = resolveBuffPresentationScale(view?.self?.buffs) ?? null;
        const previousScale = previousPlayers.get(selfPlayerId)?.sc ?? null;
        if (nextScale !== previousScale) {
            return true;
        }
    }
    if (!Array.isArray(view?.visiblePlayers)) {
        return false;
    }
    for (const entry of view.visiblePlayers) {
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
