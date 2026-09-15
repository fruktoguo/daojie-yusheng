/**
 * 世界投影器 — 世界/地图入口构建辅助函数。
 *
 * 从 world-projector.helpers.ts 拆分而来，负责全量 WorldDelta/SelfDelta/PanelDelta 构建、
 * 地图入口视图、世界状态快照捕获、实体投影缓存等。
 * 维护时要保持投影缓存与 AOI 同步链路一致。
 */
import {
  type MapEnterView,
  type WorldDeltaView,
  type WorldPlayerPatchView,
  type WorldMonsterPatchView,
  type WorldNpcPatchView,
  type WorldPortalPatchView,
  type WorldGroundPatchView,
  type WorldContainerPatchView,
  type WorldBuildingPatchView,
  type WorldFormationPatchView,
  type SelfDeltaView,
  type S2C_PanelDelta,
  type VisibleBuffState,
  cloneCraftEffectStats,
} from '@mud/shared';
import { cloneVisibleBuffProjection } from '../runtime/player/player-buff-projection.helpers';
import {
  type ProjectorViewLike,
  type ProjectorPlayerLike,
  type ProjectorNpcLike,
  type ProjectorMonsterLike,
  type ProjectorPortalLike,
  type ProjectorGroundPileLike,
  type ProjectorContainerLike,
  type ProjectorBuildingLike,
  type ProjectorFormationLike,
  type ProjectedPlayerEntry,
  type ProjectedNpcEntry,
  type ProjectedMonsterEntry,
  type ProjectedPortalEntry,
  type ProjectedGroundPileEntry,
  type ProjectedContainerEntry,
  type ProjectedBuildingEntry,
  type ProjectedFormationEntry,
  type ProjectedSelfState,
  type ProjectedPanelState,
  type WorldStateSlice,
} from './projector-types';
import { isSameBuffList } from './projector-compare';
import {
  resolvePlayerRenderLabel,
  resolvePlayerRenderChar,
  resolveBuffPresentationScale,
  normalizeProjectedSectMark,
  buildPortalId,
  resolvePortalDisplayName,
  resolvePortalRenderChar,
  normalizeOptionalNonNegativeInteger,
} from './world-projector.player-attrs.helpers';
import {
  capturePanelState,
  captureSelfState,
  cloneMovementCapabilities,
  resolveArtifactPanelRevision,
} from './world-projector.panel-slices.helpers';
import {
  buildFullAttrDeltaFromState,
  buildFullActionDeltaFromState,
  buildFullBuffDeltaFromState,
} from './world-projector.deltas.helpers';

const npcProjectionCache = new WeakMap<ProjectorNpcLike, ProjectedNpcEntry>();
const monsterProjectionCache = new WeakMap<ProjectorMonsterLike, ProjectedMonsterEntry>();
const monsterPublicBuffProjectionCache = new WeakMap<unknown[], { signature: string; projected?: VisibleBuffState[] }>();
const portalProjectionCache = new WeakMap<ProjectorPortalLike, ProjectedPortalEntry>();
const groundPileProjectionCache = new WeakMap<ProjectorGroundPileLike, ProjectedGroundPileEntry>();
const containerProjectionCache = new WeakMap<ProjectorContainerLike, ProjectedContainerEntry>();
const buildingProjectionCache = new WeakMap<ProjectorBuildingLike, ProjectedBuildingEntry>();
const formationProjectionCache = new WeakMap<ProjectorFormationLike, { signature: string; projected: ProjectedFormationEntry }>();
const EMPTY_VISIBLE_BUFFS: VisibleBuffState[] = [];
export function buildFullWorldDeltaFromState(
    view: Pick<ProjectorViewLike, 'tick' | 'worldRevision' | 'selfRevision' | 'instance'>,
    state: WorldStateSlice,
): WorldDeltaView {
    const players: WorldPlayerPatchView[] = Array.from(state.players, ([id, entry]) => ({
        id,
        n: entry.n,
        ch: entry.ch,
        x: entry.x,
        y: entry.y,
        f: entry.f,
        sc: entry.sc ?? undefined,
        sm: entry.sm ?? undefined,
        pi: entry.pi ?? undefined,
    }));
    const monsters: WorldMonsterPatchView[] = Array.from(state.monsters, ([id, entry]) => {
        const patch: WorldMonsterPatchView = {
            id,
            mid: entry.mid,
            x: entry.x,
            y: entry.y,
            f: entry.f,
            hp: entry.hp,
            maxHp: entry.maxHp,
            qi: entry.qi,
            maxQi: entry.maxQi,
            n: entry.n,
            c: entry.c,
            tr: entry.tr,
        };
        if (entry.buffs) {
            patch.buffs = entry.buffs;
        }
        return patch;
    });
    const npcs: WorldNpcPatchView[] = Array.from(state.npcs, ([id, entry]) => ({
        id,
        x: entry.x,
        y: entry.y,
        n: entry.n,
        ch: entry.ch,
        c: entry.c,
        sh: entry.sh === 1 ? 1 : undefined,
        qm: entry.qm,
    }));
    const portals: WorldPortalPatchView[] = Array.from(state.portals, ([id, entry]) => ({
        id,
        n: entry.n,
        ch: entry.ch,
        x: entry.x,
        y: entry.y,
        tm: entry.tm,
        tr: entry.tr,
        d: entry.d,
        k: entry.k,
        sid: entry.sid,
        c: entry.c,
    }));
    const ground: WorldGroundPatchView[] = Array.from(state.groundPiles, ([sourceId, entry]) => ({
        sourceId,
        x: entry.x,
        y: entry.y,
        items: entry.items,
    }));
    const containers: WorldContainerPatchView[] = Array.from(state.containers, ([id, entry]) => ({
        id,
        x: entry.x,
        y: entry.y,
        n: entry.n,
        ch: entry.ch,
        c: entry.c,
        rr: entry.rr,
    }));
    const buildings: WorldBuildingPatchView[] = Array.from(state.buildings, ([id, entry]) => ({
        id,
        x: entry.x,
        y: entry.y,
        n: entry.n,
        ch: entry.ch,
        c: entry.c,
        rt: entry.rt,
        tt: entry.tt,
    }));
    const formations: WorldFormationPatchView[] = Array.from(state.formations, ([id, entry]) => ({
        id,
        x: entry.x,
        y: entry.y,
        n: entry.n,
        ch: entry.ch,
        c: entry.c,
        ac: entry.ac,
        hp: entry.hp,
        maxHp: entry.maxHp,
        rs: entry.rs,
        sh: entry.sh,
        hl: entry.hl,
        bch: entry.bch,
        bc: entry.bc,
        bhl: entry.bhl,
        ev: entry.ev,
        rv: entry.rv,
        bv: entry.bv,
        tx: entry.tx,
        bd: entry.bd,
        os: entry.os,
        op: entry.op,
        lt: entry.lt,
    }));
    return {
        t: view.tick,
        wr: view.worldRevision,
        sr: view.selfRevision,
        mid: view.instance.templateId,
        iid: state.instanceId,
        full: 1,
        reset: 1,
        p: players.length > 0 ? players : undefined,
        m: monsters.length > 0 ? monsters : undefined,
        n: npcs.length > 0 ? npcs : undefined,
        o: portals.length > 0 ? portals : undefined,
        g: ground.length > 0 ? ground : undefined,
        c: containers.length > 0 ? containers : undefined,
        bd: buildings.length > 0 ? buildings : undefined,
        fmn: formations.length > 0 ? formations : undefined,
    };
}

/** 构造 MapEnter 视图：玩家进入/切换地图时的首包地图元信息。 */
export function buildMapEnter(view: ProjectorViewLike): MapEnterView {
    return {
        iid: view.instance.instanceId,
        mid: view.instance.templateId,
        n: view.instance.name,
        k: view.instance.kind,
        w: view.instance.width,
        h: view.instance.height,
        x: view.self.x,
        y: view.self.y,
    };
}

/** 构造全量 WorldDelta：包含视野内所有玩家、怪物、NPC、容器、传送门等实体。 */
export function buildFullWorldDelta(
    view: ProjectorViewLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): WorldDeltaView {
    return buildFullWorldDeltaFromState(view, captureWorldState(view, resolveMapName));
}

/** 构造全量 SelfDelta：包含玩家自身的位置、HP、MP、经验等核心状态。 */
export function buildFullSelfDelta(player: ProjectorPlayerLike): SelfDeltaView {
    return buildFullSelfDeltaFromState(captureSelfState(player), player.selfRevision);
}

export function buildFullSelfDeltaFromState(self: ProjectedSelfState, selfRevision: number): SelfDeltaView {
    return {
        sr: selfRevision,
        iid: self.instanceId,
        mid: self.templateId,
        sid: self.sectId,
        pid: self.partyId,
        x: self.x,
        y: self.y,
        f: self.f,
        hp: self.hp,
        maxHp: self.maxHp,
        qi: self.qi,
        maxQi: self.maxQi,
        wallet: self.wallet,
        mc: cloneMovementCapabilities(self.movementCapabilities),
    };
}

/** 构造全量 PanelDelta：包含背包、装备、功法、属性、动作和 buff 面板完整状态。 */
export function buildFullPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return buildFullPanelDeltaFromState(capturePanelState(player));
}

export function buildFullPanelDeltaFromState(panel: ProjectedPanelState): S2C_PanelDelta {
    return {
        inv: {
            r: panel.inventory.revision,
            full: 1 as const,
            capacity: panel.inventory.capacity,
            size: panel.inventory.items.length,
            slots: panel.inventory.items.map((entry, slotIndex) => ({
                slotIndex,
                item: entry,
            })),
            cooldowns: panel.inventory.cooldowns,
            serverTick: panel.inventory.serverTick,
        },
        eq: {
            r: panel.equipment.revision,
            full: 1 as const,
            slots: panel.equipment.slots,
        },
        art: {
            r: panel.artifact.revision,
            full: 1 as const,
            slots: panel.artifact.slots,
        },
        tech: {
            r: panel.technique.revision,
            full: 1 as const,
            techniques: panel.technique.techniques,
            cultivatingTechId: panel.technique.cultivatingTechId,
            bodyTraining: panel.technique.bodyTraining,
            pendingComprehensions: panel.technique.pendingComprehensions,
        },
        attr: buildFullAttrDeltaFromState(panel.attr),
        act: buildFullActionDeltaFromState(panel.action),
        buff: buildFullBuffDeltaFromState(panel.buff),
    };
}

/** 构造 bootstrap 首包 PanelDelta：列表类仅含 revision；属性额外带 Bootstrap.self 覆盖不到的技艺效果投影。 */
export function buildBootstrapPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return {
        inv: { r: player.inventory.revision },
        eq: { r: player.equipment.revision, slots: [] },
        art: { r: resolveArtifactPanelRevision(player), slots: [] },
        tech: { r: player.techniques.revision, techniques: [] },
        attr: { r: player.attrs.revision, craftEffectStats: cloneCraftEffectStats(player.attrs.craftEffectStats) },
        act: { r: player.actions.revision, actions: [] },
        buff: { r: player.buffs.revision },
    };
}

/** 捕获当前帧的世界状态快照，用于后续 diff 比较。 */
export function captureWorldState(
    view: ProjectorViewLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): WorldStateSlice {
    const players = new Map<string, ProjectedPlayerEntry>();
    const npcs: Array<[string, ProjectedNpcEntry]> = view.localNpcs.map((entry): [string, ProjectedNpcEntry] => [entry.npcId, projectNpcEntry(entry)]);
    const monsters: Array<[string, ProjectedMonsterEntry]> = view.localMonsters.map((entry): [string, ProjectedMonsterEntry] => [entry.runtimeId, projectMonsterEntry(entry)]);
    const portals: Array<[string, ProjectedPortalEntry]> = view.localPortals.map((entry): [string, ProjectedPortalEntry] => [buildPortalId(entry), projectPortalEntry(entry, resolveMapName)]);
    const groundPiles: Array<[string, ProjectedGroundPileEntry]> = view.localGroundPiles.map((entry): [string, ProjectedGroundPileEntry] => [entry.sourceId, projectGroundPileEntry(entry)]);
    const containers: Array<[string, ProjectedContainerEntry]> = view.localContainers.map((entry): [string, ProjectedContainerEntry] => [`container:${entry.id}`, projectContainerEntry(entry)]);
    const buildings: Array<[string, ProjectedBuildingEntry]> = (view.localBuildings ?? []).map((entry): [string, ProjectedBuildingEntry] => [entry.id, projectBuildingEntry(entry)]);
    const formations: Array<[string, ProjectedFormationEntry]> = (view.localFormations ?? []).map((entry): [string, ProjectedFormationEntry] => [entry.id, projectFormationEntry(entry)]);
    players.set(view.playerId, {
        n: resolvePlayerRenderLabel(view.self.name, view.self.displayName, view.playerId),
        ch: resolvePlayerRenderChar(view.self.displayName, view.self.name),
        x: view.self.x, y: view.self.y,
        f: view.self.facing,
        sc: resolveBuffPresentationScale(view.self.buffs),
        sm: normalizeProjectedSectMark(view.self.sectMark),
        pi: typeof view.self.partyId === 'string' && view.self.partyId ? view.self.partyId : null,
    });
    for (const entry of view.visiblePlayers) {
        players.set(entry.playerId, {
            n: resolvePlayerRenderLabel(entry.name, entry.displayName, entry.playerId),
            ch: resolvePlayerRenderChar(entry.displayName, entry.name),
            x: entry.x, y: entry.y,
            f: entry.facing,
            sc: resolveBuffPresentationScale(entry.buffs),
            sm: normalizeProjectedSectMark(entry.sectMark),
            pi: typeof entry.partyId === 'string' && entry.partyId ? entry.partyId : null,
        });
    }
    return {
        instanceId: view.instance.instanceId,
        worldRevision: view.worldRevision,
        players,
        npcs: new Map(npcs),
        monsters: new Map(monsters),
        portals: new Map(portals),
        groundPiles: new Map(groundPiles),
        containers: new Map(containers),
        buildings: new Map(buildings),
        formations: new Map(formations),
    };
}

export function projectNpcEntry(entry: ProjectorNpcLike): ProjectedNpcEntry {
    const cached = npcProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, sh: entry.hasShop ? 1 as const : 0 as const, qm: entry.questMarker ?? null,
    });
    npcProjectionCache.set(entry, projected);
    return projected;
}

export function projectMonsterEntry(entry: ProjectorMonsterLike): ProjectedMonsterEntry {
    const buffs = projectPublicMonsterBuffs(entry.buffs);
    const cached = monsterProjectionCache.get(entry);
    if (cached
        && cached.x === entry.x
        && cached.y === entry.y
        && cached.f === entry.facing
        && cached.hp === entry.hp
        && cached.maxHp === entry.maxHp
        && cached.qi === entry.qi
        && cached.maxQi === entry.maxQi
        && cached.n === entry.name
        && cached.c === entry.color
        && cached.tr === entry.tier
        && isSameBuffList(cached.buffs ?? EMPTY_VISIBLE_BUFFS, buffs ?? EMPTY_VISIBLE_BUFFS)) {
        return cached;
    }
    const monsterId = cached?.mid ?? entry.monsterId;
    const projected = freezeProjectedEntry({
        mid: monsterId, x: entry.x, y: entry.y, f: entry.facing, hp: entry.hp, maxHp: entry.maxHp, qi: entry.qi, maxQi: entry.maxQi, n: entry.name, c: entry.color, tr: entry.tier,
        buffs,
    });
    monsterProjectionCache.set(entry, projected);
    return projected;
}

export function projectPublicMonsterBuffs(source: unknown[] | null | undefined): VisibleBuffState[] | undefined {
    if (!Array.isArray(source) || source.length === 0) {
        return undefined;
    }
    let signature = '';
    let hasPublicBuff = false;
    for (const entry of source) {
        const buff = entry as VisibleBuffState | null | undefined;
        if (!buff || buff.visibility !== 'public' || buff.remainingTicks <= 0 || buff.stacks <= 0) {
            continue;
        }
        hasPublicBuff = true;
        signature += `${buff.buffId}:${buff.remainingTicks}:${buff.stacks}:${buff.duration}:${buff.maxStacks};`;
    }
    if (!hasPublicBuff) {
        return undefined;
    }
    const cached = monsterPublicBuffProjectionCache.get(source);
    if (cached?.signature === signature) {
        return cached.projected;
    }
    const projected: VisibleBuffState[] = [];
    for (const entry of source) {
        const buff = entry as VisibleBuffState | null | undefined;
        if (!buff || buff.visibility !== 'public' || buff.remainingTicks <= 0 || buff.stacks <= 0) {
            continue;
        }
        projected.push(cloneVisibleBuffProjection(buff));
    }
    projected.sort((left, right) => left.buffId.localeCompare(right.buffId, 'zh-Hans-CN'));
    monsterPublicBuffProjectionCache.set(source, { signature, projected });
    return projected;
}

export function projectPortalEntry(
    entry: ProjectorPortalLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): ProjectedPortalEntry {
    const cached = portalProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        n: resolvePortalDisplayName(entry, resolveMapName), ch: resolvePortalRenderChar(entry), x: entry.x, y: entry.y, tm: entry.targetMapId, tr: entry.trigger === 'auto' ? 1 as const : 0 as const, d: entry.direction === 'one_way' ? 1 as const : 0 as const,
        k: entry.kind || null, sid: entry.sectId ?? null, c: entry.color ?? null,
    });
    portalProjectionCache.set(entry, projected);
    return projected;
}

export function projectGroundPileEntry(entry: ProjectorGroundPileLike): ProjectedGroundPileEntry {
    const cached = groundPileProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, items: entry.items.map((item) => ({ ...item })),
    });
    freezeProjectedEntry(projected.items);
    groundPileProjectionCache.set(entry, projected);
    return projected;
}

export function projectContainerEntry(entry: ProjectorContainerLike): ProjectedContainerEntry {
    const cached = containerProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rr: normalizeOptionalNonNegativeInteger(entry.respawnRemainingTicks),
    });
    containerProjectionCache.set(entry, projected);
    return projected;
}

export function projectBuildingEntry(entry: ProjectorBuildingLike): ProjectedBuildingEntry {
    const cached = buildingProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rt: normalizeOptionalNonNegativeInteger(entry.remainingTicks), tt: normalizeOptionalNonNegativeInteger(entry.totalTicks),
    });
    buildingProjectionCache.set(entry, projected);
    return projected;
}

export function projectFormationEntry(entry: ProjectorFormationLike): ProjectedFormationEntry {
    const signature = buildFormationProjectionSignature(entry);
    const cached = formationProjectionCache.get(entry);
    if (cached?.signature === signature) { return cached.projected; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char ?? '◎', c: entry.active === false ? '#9aa0a6' : entry.color ?? '#4da3ff', ac: entry.active === false ? 0 as const : 1 as const, hp: normalizeOptionalNonNegativeInteger(entry.hp) ?? 0, maxHp: Math.max(1, normalizeOptionalNonNegativeInteger(entry.maxHp) ?? 1), rs: normalizeOptionalNonNegativeInteger(entry.radius), sh: entry.rangeShape, hl: entry.rangeHighlightColor, bch: entry.boundaryChar, bc: entry.boundaryColor, bhl: entry.boundaryRangeHighlightColor, ev: entry.eyeVisibleWithoutSenseQi === true ? 1 as const : 0 as const, rv: entry.rangeVisibleWithoutSenseQi === true ? 1 as const : 0 as const, bv: entry.boundaryVisibleWithoutSenseQi === true ? 1 as const : 0 as const, tx: entry.showText === false ? 0 as const : 1 as const, bd: entry.blocksBoundary === true ? 1 as const : 0 as const, os: entry.ownerSectId ?? null, op: entry.ownerPlayerId ?? null, lt: entry.lifecycle === 'persistent' ? 1 as const : 0 as const,
    });
    formationProjectionCache.set(entry, { signature, projected });
    return projected;
}

export function buildFormationProjectionSignature(entry: ProjectorFormationLike): string {
    return [
        entry.x,
        entry.y,
        entry.name,
        entry.char ?? '◎',
        entry.active === false ? 0 : 1,
        entry.active === false ? '#9aa0a6' : entry.color ?? '#4da3ff',
        normalizeOptionalNonNegativeInteger(entry.hp) ?? 0,
        Math.max(1, normalizeOptionalNonNegativeInteger(entry.maxHp) ?? 1),
        normalizeOptionalNonNegativeInteger(entry.radius) ?? '',
        entry.rangeShape ?? '',
        entry.rangeHighlightColor ?? '',
        entry.boundaryChar ?? '',
        entry.boundaryColor ?? '',
        entry.boundaryRangeHighlightColor ?? '',
        entry.eyeVisibleWithoutSenseQi === true ? 1 : 0,
        entry.rangeVisibleWithoutSenseQi === true ? 1 : 0,
        entry.boundaryVisibleWithoutSenseQi === true ? 1 : 0,
        entry.showText === false ? 0 : 1,
        entry.blocksBoundary === true ? 1 : 0,
        entry.ownerSectId ?? '',
        entry.ownerPlayerId ?? '',
        entry.lifecycle === 'persistent' ? 1 : 0,
    ].join('|');
}

export function freezeProjectedEntry<T extends object>(entry: T): T {
    if (process.env.NODE_ENV !== 'production') {
        Object.freeze(entry);
    }
    return entry;
}
