/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Inject, Injectable, Optional } from '@nestjs/common';
import { S2C, getFirstGrapheme, type VisibleBuffState } from '@mud/shared';
import { NativePlayerAuthStoreService } from '../http/native/native-player-auth-store.service';
import { MapTemplateRepository } from '../runtime/map/map-template.repository';
import { isSameBuffList } from './projector-compare';
import {
    addSyncFlushDuration,
    incrementSyncFlushCount,
    type SyncFlushBreakdownSample,
} from './world-sync-flush-breakdown';

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

type ProjectorWorldSource = {
    instanceId: unknown;
    instanceTemplateId: unknown;
    instanceName: unknown;
    instanceKind: unknown;
    instanceWidth: unknown;
    instanceHeight: unknown;
    aoiGlobalRevision: unknown;
    aoiLocalRevision: unknown;
    selfX: unknown;
    selfY: unknown;
    selfFacing: unknown;
    visiblePlayers: unknown;
    localNpcs: unknown;
    localMonsters: unknown;
    localPortals: unknown;
    localGroundPiles: unknown;
    localContainers: unknown;
    localBuildings: unknown;
    localFormations: unknown;
    identitySelfName: unknown;
    identitySelfDisplayName: unknown;
    identityVisiblePlayers: unknown;
};

const EMPTY_VISIBLE_MONSTER_BUFFS: VisibleBuffState[] = [];

function capturePlayerStateForFullPanel(player: any): any {
    return capturePanelState(player);
}

/** 世界投影器服务：维护每个玩家的投影缓存，编排初始/增量 envelope 生成。 */
@Injectable()
export class WorldProjectorService {
    private readonly cacheByPlayerId = new Map<string, any>();
    private readonly identityProjectionByPlayerId = new Map<string, any>();
    private readonly identityEntryProjectionBySource = new WeakMap<object, {
        identity: object;
        projected: object;
    }>();
    /** AOI view 命中时 worldRevision、selfRevision 会继续前进；这里单独记录真正影响世界投影的局部来源。 */
    private readonly worldSourceByPlayerId = new Map<string, ProjectorWorldSource>();

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
        this.worldSourceByPlayerId.set(binding.playerId, captureProjectorWorldSource(view, identityView));
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
    createDeltaEnvelope(view: any, player: any, breakdown?: SyncFlushBreakdownSample) {
        const identityStartedAt = performance.now();
        const identityView = this.withAccountIdentityProjection(view);
        addSyncFlushDuration(breakdown, 'projectorIdentityMs', identityStartedAt);
        incrementSyncFlushCount(breakdown, 'projectorIdentityCount');
        const worldStartedAt = performance.now();
        const worldSource = captureProjectorWorldSource(view, identityView);
        const previous = this.cacheByPlayerId.get(identityView.playerId);
        if (!previous) {
            const worldState = captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
            addSyncFlushDuration(breakdown, 'projectorWorldMs', worldStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorWorldCount');
            incrementSyncFlushCount(breakdown, 'projectorWorldCaptureCount');
            incrementSyncFlushCount(breakdown, 'projectorFullRebuildCount');
            const panelStartedAt = performance.now();
            const playerState = capturePlayerState(player);
            addSyncFlushDuration(breakdown, 'projectorPanelMs', panelStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorPanelCount');
            const cacheStartedAt = performance.now();
            this.cacheByPlayerId.set(identityView.playerId, combineProjectorState(worldState, playerState));
            this.worldSourceByPlayerId.set(identityView.playerId, worldSource);
            addSyncFlushDuration(breakdown, 'projectorCacheMs', cacheStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorCacheCount');
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDeltaFromState(identityView, worldState),
                selfDelta: buildFullSelfDeltaFromState(playerState.self, playerState.selfRevision),
                panelDelta: buildFullPanelDeltaFromState(capturePlayerStateForFullPanel(player)),
            };
        }
        if (previous.instanceId !== identityView.instance.instanceId || previous.self?.templateId !== player.templateId) {
            const worldState = captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
            addSyncFlushDuration(breakdown, 'projectorWorldMs', worldStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorWorldCount');
            incrementSyncFlushCount(breakdown, 'projectorWorldCaptureCount');
            incrementSyncFlushCount(breakdown, 'projectorFullRebuildCount');
            const panelStartedAt = performance.now();
            const playerState = capturePlayerState(player);
            addSyncFlushDuration(breakdown, 'projectorPanelMs', panelStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorPanelCount');
            const cacheStartedAt = performance.now();
            this.cacheByPlayerId.set(identityView.playerId, combineProjectorState(worldState, playerState));
            this.worldSourceByPlayerId.set(identityView.playerId, worldSource);
            addSyncFlushDuration(breakdown, 'projectorCacheMs', cacheStartedAt);
            incrementSyncFlushCount(breakdown, 'projectorCacheCount');
            return {
                mapEnter: buildMapEnter(identityView),
                worldDelta: buildFullWorldDeltaFromState(identityView, worldState),
                selfDelta: buildFullSelfDeltaFromState(playerState.self, playerState.selfRevision),
                panelDelta: buildFullPanelDeltaFromState(capturePlayerStateForFullPanel(player)),
            };
        }
        const previousWorldSource = this.worldSourceByPlayerId.get(identityView.playerId);
        const hasRuntimeAoiRevision = Boolean(previousWorldSource)
            && hasStableProjectorAoiRevision(previousWorldSource)
            && hasStableProjectorAoiRevision(worldSource);
        const canReuseWorld = (hasRuntimeAoiRevision || previous.worldRevision === identityView.worldRevision)
            && isSameProjectorWorldSource(previousWorldSource, worldSource)
            && !hasDynamicContainerCountdown(identityView, previous.containers)
            && !hasPlayerPresentationChange(identityView, previous.players)
            && !hasMonsterBuffPresentationChange(identityView, previous.monsters);
        const currentWorld = canReuseWorld
            ? previous
            : captureWorldState(identityView, (mapId) => this.resolveMapName(mapId));
        incrementSyncFlushCount(breakdown, canReuseWorld ? 'projectorWorldReuseCount' : 'projectorWorldCaptureCount');
        const worldChanged = previous.worldRevision !== currentWorld.worldRevision || currentWorld !== previous;
        const playerPatch = worldChanged ? diffPlayerEntries(previous.players, currentWorld.players) : [];
        const monsterPatch = worldChanged ? diffMonsterEntries(previous.monsters, currentWorld.monsters) : [];
        const npcPatch = worldChanged ? diffNpcEntries(previous.npcs, currentWorld.npcs) : [];
        const portalPatch = worldChanged ? diffPortalEntries(previous.portals, currentWorld.portals) : [];
        const groundPatch = worldChanged ? diffGroundPiles(previous.groundPiles, currentWorld.groundPiles) : [];
        const containerPatch = worldChanged ? diffContainerEntries(previous.containers, currentWorld.containers) : [];
        const buildingPatch = worldChanged ? diffBuildingEntries(previous.buildings, currentWorld.buildings) : [];
        const formationPatch = worldChanged ? diffFormationEntries(previous.formations, currentWorld.formations) : [];
        addSyncFlushDuration(breakdown, 'projectorWorldMs', worldStartedAt);
        incrementSyncFlushCount(breakdown, 'projectorWorldCount');
        const selfStartedAt = performance.now();
        const selfDelta = buildSelfDelta(previous, player);
        addSyncFlushDuration(breakdown, 'projectorSelfMs', selfStartedAt);
        incrementSyncFlushCount(breakdown, 'projectorSelfCount');
        const panelStartedAt = performance.now();
        const panelUpdate = buildPanelUpdate(previous, player);
        addSyncFlushDuration(breakdown, 'projectorPanelMs', panelStartedAt);
        incrementSyncFlushCount(breakdown, 'projectorPanelCount');
        const panelDelta = panelUpdate.delta;
        const cacheStartedAt = performance.now();
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
        if (worldChanged) {
            this.worldSourceByPlayerId.set(identityView.playerId, worldSource);
        }
        addSyncFlushDuration(breakdown, 'projectorCacheMs', cacheStartedAt);
        incrementSyncFlushCount(breakdown, 'projectorCacheCount');
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
        this.worldSourceByPlayerId.delete(playerId);
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
        const self = this.projectAccountIdentityEntry(view.playerId, view.self);
        let visiblePlayers = view.visiblePlayers;
        if (Array.isArray(view.visiblePlayers)) {
            for (let index = 0; index < view.visiblePlayers.length; index += 1) {
                const entry = view.visiblePlayers[index];
                const projectedEntry = this.projectAccountIdentityEntry(entry?.playerId, entry);
                if (projectedEntry === entry) {
                    if (visiblePlayers !== view.visiblePlayers) {
                        visiblePlayers.push(entry);
                    }
                    continue;
                }
                if (visiblePlayers === view.visiblePlayers) {
                    visiblePlayers = view.visiblePlayers.slice(0, index);
                }
                visiblePlayers.push(projectedEntry);
            }
        }
        return self !== view.self || visiblePlayers !== view.visiblePlayers ? { ...view, self, visiblePlayers } : view;
    }

    private projectAccountIdentityEntry(playerId: unknown, source: any): any {
        const identity = this.resolveAccountIdentityProjection(playerId, source);
        if (!identity || !source || typeof source !== 'object') {
            return source;
        }
        if (source.name === identity.name && source.displayName === identity.displayName) {
            return source;
        }
        const cached = this.identityEntryProjectionBySource.get(source);
        if (cached?.identity === identity) {
            return cached.projected;
        }
        const projected = { ...source, ...identity };
        this.identityEntryProjectionBySource.set(source, { identity, projected });
        return projected;
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

function captureProjectorWorldSource(view: any, identityView: any): ProjectorWorldSource {
    return {
        instanceId: view?.instance?.instanceId,
        instanceTemplateId: view?.instance?.templateId,
        instanceName: view?.instance?.name,
        instanceKind: view?.instance?.kind,
        instanceWidth: view?.instance?.width,
        instanceHeight: view?.instance?.height,
        aoiGlobalRevision: view?.aoiGlobalRevision,
        aoiLocalRevision: view?.aoiLocalRevision,
        selfX: view?.self?.x,
        selfY: view?.self?.y,
        selfFacing: view?.self?.facing,
        visiblePlayers: view?.visiblePlayers,
        localNpcs: view?.localNpcs,
        localMonsters: view?.localMonsters,
        localPortals: view?.localPortals,
        localGroundPiles: view?.localGroundPiles,
        localContainers: view?.localContainers,
        localBuildings: view?.localBuildings,
        localFormations: view?.localFormations,
        identitySelfName: identityView?.self?.name,
        identitySelfDisplayName: identityView?.self?.displayName,
        identityVisiblePlayers: identityView?.visiblePlayers,
    };
}

function isSameProjectorWorldSource(left: ProjectorWorldSource | undefined, right: ProjectorWorldSource): boolean {
    if (!left
        || !Object.is(left.instanceId, right.instanceId)
        || !Object.is(left.instanceTemplateId, right.instanceTemplateId)
        || !Object.is(left.instanceName, right.instanceName)
        || !Object.is(left.instanceKind, right.instanceKind)
        || !Object.is(left.instanceWidth, right.instanceWidth)
        || !Object.is(left.instanceHeight, right.instanceHeight)
        || !Object.is(left.selfX, right.selfX)
        || !Object.is(left.selfY, right.selfY)
        || !Object.is(left.selfFacing, right.selfFacing)
        || !isSameProjectorSourceList(left.visiblePlayers, right.visiblePlayers)
        || !isSameProjectorSourceList(left.localNpcs, right.localNpcs)
        || !isSameProjectorSourceList(left.localMonsters, right.localMonsters)
        || !isSameProjectorSourceList(left.localPortals, right.localPortals)
        || !isSameProjectorSourceList(left.localGroundPiles, right.localGroundPiles)
        || !isSameProjectorSourceList(left.localContainers, right.localContainers)
        || !isSameProjectorSourceList(left.localBuildings, right.localBuildings)
        || !isSameProjectorSourceList(left.localFormations, right.localFormations)
        || !Object.is(left.identitySelfName, right.identitySelfName)
        || !Object.is(left.identitySelfDisplayName, right.identitySelfDisplayName)
        || !isSameProjectorSourceList(left.identityVisiblePlayers, right.identityVisiblePlayers)) {
        return false;
    }
    if (hasStableProjectorAoiRevision(left) || hasStableProjectorAoiRevision(right)) {
        return hasStableProjectorAoiRevision(left)
            && hasStableProjectorAoiRevision(right)
            && Object.is(left.aoiGlobalRevision, right.aoiGlobalRevision)
            && Object.is(left.aoiLocalRevision, right.aoiLocalRevision);
    }
    return true;
}

function hasStableProjectorAoiRevision(source: ProjectorWorldSource): boolean {
    return Number.isFinite(Number(source.aoiGlobalRevision))
        && Number.isFinite(Number(source.aoiLocalRevision));
}

function isSameProjectorSourceList(left: unknown, right: unknown): boolean {
    if (left === right) {
        return true;
    }
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
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

function hasPlayerPresentationChange(view: any, previousPlayers: Map<string, any>): boolean {
    const selfPlayerId = typeof view?.playerId === 'string' ? view.playerId : '';
    if (selfPlayerId && hasPlayerPresentationEntryChange(selfPlayerId, view?.self, previousPlayers)) {
        return true;
    }
    if (!Array.isArray(view?.visiblePlayers)) {
        return false;
    }
    for (const entry of view.visiblePlayers) {
        const playerId = typeof entry?.playerId === 'string' ? entry.playerId : '';
        if (!playerId) {
            continue;
        }
        if (hasPlayerPresentationEntryChange(playerId, entry, previousPlayers)) {
            return true;
        }
    }
    return false;
}

function hasMonsterBuffPresentationChange(view: any, previousMonsters: Map<string, any>): boolean {
    if (!Array.isArray(view?.localMonsters)) {
        return false;
    }
    for (const entry of view.localMonsters) {
        const runtimeId = typeof entry?.runtimeId === 'string' ? entry.runtimeId : '';
        if (!runtimeId) {
            continue;
        }
        const previous = previousMonsters.get(runtimeId);
        if (!previous) {
            continue;
        }
        if (!isSameBuffList(previous.buffs ?? [], projectComparablePublicMonsterBuffs(entry?.buffs))) {
            return true;
        }
    }
    return false;
}

function projectComparablePublicMonsterBuffs(source: unknown[] | null | undefined): VisibleBuffState[] {
    if (!Array.isArray(source) || source.length === 0) {
        return EMPTY_VISIBLE_MONSTER_BUFFS;
    }
    const visible: VisibleBuffState[] = [];
    for (const entry of source) {
        const buff = entry as VisibleBuffState | null | undefined;
        if (!buff || buff.visibility !== 'public' || buff.remainingTicks <= 0 || buff.stacks <= 0) {
            continue;
        }
        visible.push(buff);
    }
    if (visible.length === 0) {
        return EMPTY_VISIBLE_MONSTER_BUFFS;
    }
    visible.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
    return visible;
}

function hasPlayerPresentationEntryChange(playerId: string, entry: any, previousPlayers: Map<string, any>): boolean {
    const previous = previousPlayers.get(playerId);
    if (!previous) {
        return false;
    }
    const nextScale = resolveBuffPresentationScale(entry?.buffs) ?? null;
    const previousScale = previous.sc ?? null;
    if (nextScale !== previousScale) {
        return true;
    }
    const nextSectMark = normalizeProjectedSectMark(entry?.sectMark);
    const previousSectMark = previous.sm ?? null;
    return nextSectMark !== previousSectMark;
}

function normalizeProjectedSectMark(value: unknown): string | null {
    const normalized = typeof value === 'string' ? value.trim().normalize('NFC') : '';
    return normalized ? getFirstGrapheme(normalized) || null : null;
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
