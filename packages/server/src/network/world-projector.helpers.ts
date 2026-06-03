/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import {
  type AttrBonus,
  type Attributes,
  type AutoUsePillConfig,
  type CombatTargetingRules,
  type MapEnterView,
  type PlayerSpecialStats,
  type S2C_PanelActionDelta,
  type S2C_PanelDelta,
  type SelfDeltaView,
  type ItemStack,
  type TechniqueTransmissionJobState,
  type SyncedItemStack,
  type TechniqueState,
  type TechniqueUpdateEntryView,
  type VisibleBuffState,
  type WorldBuildingPatchView,
  type WorldContainerPatchView,
  type WorldDeltaView,
  type WorldFormationPatchView,
  type WorldGroundPatchView,
  type WorldMonsterPatchView,
  type WorldNpcPatchView,
  type WorldPlayerPatchView,
  type WorldPortalPatchView,
  applyEquipmentAttributeEffectivenessToItemStack,
  calcTechniqueFinalSpecialStatBonus,
  getFirstGrapheme,
} from '@mud/shared';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules } from '../runtime/player/player-combat-config.helpers';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
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
  type ProjectedAttrPanelState,
  type ProjectedActionPanelState,
  type ProjectedPanelState,
  type ProjectedPanelCursor,
  type ProjectedAttrDeltaView,
  type ProjectedActionEntry,
  type WorldStateSlice,
  type PlayerStateSlice,
  type ProjectorState,
} from './projector-types';
import {
  cloneAttributes,
  cloneNumericStats,
  cloneNumericRatioDivisors,
  cloneSpecialStats,
  cloneWalletState,
  cloneTechniqueEntry,
  cloneAttrBonus,
  clonePartialNumericStats,
  clonePartialAttributes,
} from './projector-clone';
import {
  isSameWalletState,
  isSameSpecialStats,
  isSameAttrBonuses,
  isSameBuffList,
  isSameActionOrder,
  isSameCraftSkillState,
} from './projector-compare';
import {
  diffPlayerEntries,
  diffNpcEntries,
  diffPortalEntries,
  diffMonsterEntries,
  diffGroundPiles,
  diffContainerEntries,
  diffBuildingEntries,
  diffFormationEntries,
  diffInventorySlots,
  diffEquipmentSlots,
  diffTechniqueEntries,
  diffRemovedTechniqueIds,
  diffActionEntries,
  diffRemovedActionIds,
  diffBuffEntries,
  diffRemovedBuffIds,
  diffAttributes,
  diffNumericStats,
  diffRatioDivisors,
} from './projector-diff';
import { buildAttrDetailBonuses } from './world-gateway-attr-detail.helper';

const npcProjectionCache = new WeakMap<ProjectorNpcLike, ProjectedNpcEntry>();
const monsterProjectionCache = new WeakMap<ProjectorMonsterLike, ProjectedMonsterEntry>();
const portalProjectionCache = new WeakMap<ProjectorPortalLike, ProjectedPortalEntry>();
const groundPileProjectionCache = new WeakMap<ProjectorGroundPileLike, ProjectedGroundPileEntry>();
const containerProjectionCache = new WeakMap<ProjectorContainerLike, ProjectedContainerEntry>();
const buildingProjectionCache = new WeakMap<ProjectorBuildingLike, ProjectedBuildingEntry>();
const formationProjectionCache = new WeakMap<ProjectorFormationLike, ProjectedFormationEntry>();
const attrBonusCloneCache = new WeakMap<AttrBonus[], AttrBonus[]>();
const projectedAttrBonusCache = new WeakMap<ProjectorPlayerLike, { signature: string; bonuses: AttrBonus[] }>();

type SpecialStatsCacheEntry = {
    attrsRevision: number;
    techniquesRevision: number;
    equipmentRevision: number;
    foundation: number;
    rootFoundation: number;
    bodyTrainingLevel: number;
    combatExp: number;
    comprehension: number;
    luck: number;
    fengShuiLuck: number;
    stats: PlayerSpecialStats;
};

type PanelDeltaBuildResult = {
    delta: S2C_PanelDelta | null;
    panelCursor: ProjectedPanelCursor;
    attrPanel?: ProjectedAttrPanelState;
    actionPanel?: ProjectedActionPanelState;
    techniquePanel?: ProjectedPanelState['technique'];
};

const specialStatsCache = new WeakMap<ProjectorPlayerLike, SpecialStatsCacheEntry>();

function resolvePlayerSpecialStatsCached(player: ProjectorPlayerLike): PlayerSpecialStats {
    const rootFoundation = Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0));
    const bodyTrainingLevel = Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0));
    const comprehension = Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0));
    const luck = Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0));
    const fengShuiLuck = Math.trunc(Number(player.fengShuiLuck ?? 0) || 0);
    const cached = specialStatsCache.get(player);
    if (cached
        && cached.attrsRevision === player.attrs.revision
        && cached.techniquesRevision === player.techniques.revision
        && cached.equipmentRevision === player.equipment.revision
        && cached.foundation === player.foundation
        && cached.rootFoundation === rootFoundation
        && cached.bodyTrainingLevel === bodyTrainingLevel
        && cached.combatExp === player.combatExp
        && cached.comprehension === comprehension
        && cached.luck === luck
        && cached.fengShuiLuck === fengShuiLuck) {
        return cached.stats;
    }
    const stats = resolvePlayerSpecialStats(player);
    specialStatsCache.set(player, {
        attrsRevision: player.attrs.revision,
        techniquesRevision: player.techniques.revision,
        equipmentRevision: player.equipment.revision,
        foundation: player.foundation,
        rootFoundation,
        bodyTrainingLevel,
        combatExp: player.combatExp,
        comprehension,
        luck,
        fengShuiLuck,
        stats,
    });
    return stats;
}

function resolvePlayerSpecialStats(player: ProjectorPlayerLike): PlayerSpecialStats {
  const techniqueSpecialStats = calcTechniqueFinalSpecialStatBonus(player.techniques.techniques.map(toTechniqueState));
  const equipmentSpecialStats = resolveEquipmentSpecialStats(player);
  return {
    foundation: player.foundation,
    rootFoundation: Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)),
    bodyTrainingLevel: Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0)),
    combatExp: player.combatExp,
    comprehension: Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.comprehension ?? 0) || 0)),
    luck: Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.luck ?? 0) || 0))
      + Math.trunc(Number(player.fengShuiLuck ?? 0) || 0),
  };
}

function resolveEquipmentSpecialStats(player: ProjectorPlayerLike): Partial<PlayerSpecialStats> {
  const result: Partial<PlayerSpecialStats> = { comprehension: 0, luck: 0 };
  const realmLv = Math.max(1, Math.floor(Number(player.realm?.realmLv ?? player.realmLv ?? 1) || 1));
  for (const entry of player.equipment?.slots ?? []) {
    const item = entry?.item;
    if (!item) { continue; }
    const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(toEquipmentEffectivenessItemStack(item), realmLv);
    result.comprehension = Math.max(0, Math.trunc(Number(result.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.comprehension ?? 0) || 0));
    result.luck = Math.max(0, Math.trunc(Number(result.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.luck ?? 0) || 0));
  }
  return result;
}

function toEquipmentEffectivenessItemStack(item: SyncedItemStack): ItemStack {
  return {
    ...item,
    name: item.name ?? item.itemId,
    type: item.type ?? 'equipment',
  } as ItemStack;
}

function toTechniqueState(entry: TechniqueUpdateEntryView): TechniqueState {
  return {
    techId: entry.techId,
    name: entry.name ?? '',
    level: entry.level ?? 1,
    exp: entry.exp ?? 0,
    expToNext: entry.expToNext ?? 0,
    realmLv: entry.realmLv ?? 1,
    realm: entry.realm ?? 0,
    skillsEnabled: entry.skillsEnabled !== false,
    skills: entry.skills ?? [],
    grade: entry.grade,
    category: entry.category,
    layers: entry.layers,
  };
}

function normalizeOptionalNonNegativeInteger(value: unknown): number | undefined {
    if (!Number.isFinite(Number(value))) { return undefined; }
    return Math.max(0, Math.trunc(Number(value)));
}

function resolvePortalRenderChar(portal: ProjectorPortalLike): string {
    const portalRecord = portal as unknown as Record<string, unknown>;
    if (typeof portalRecord.char === 'string' && portalRecord.char.trim()) {
        return portalRecord.char.trim()[0] ?? '阵';
    }
    return portal.kind === 'stairs' ? '' : '阵';
}

function resolveBuffPresentationScale(source: { buffs?: unknown[] | null } | unknown[] | null | undefined): number | undefined {
    const buffs = Array.isArray(source)
        ? source
        : Array.isArray(source?.buffs)
            ? source.buffs
            : [];
    let scale = 1;
    for (const buff of buffs) {
        const record = buff as { remainingTicks?: unknown; stacks?: unknown; presentationScale?: unknown } | null | undefined;
        if ((Number(record?.remainingTicks ?? 0) <= 0) || (Number(record?.stacks ?? 0) <= 0)) { continue; }
        const presentationScale = Number(record?.presentationScale);
        if (Number.isFinite(presentationScale) && presentationScale > scale) { scale = presentationScale; }
    }
    return scale > 1 ? scale : undefined;
}

function buildPortalId(portalOrX: ProjectorPortalLike | number, y?: number) {
    if (typeof portalOrX === 'object' && portalOrX !== null) {
        const explicit = typeof portalOrX.id === 'string' ? portalOrX.id.trim() : '';
        if (explicit) { return explicit; }
        return `${portalOrX.x}:${portalOrX.y}`;
    }
    return `${portalOrX}:${y}`;
}

function normalizePlayerIdentityText(value: unknown) {
    return typeof value === 'string' ? value.trim().normalize('NFC') : '';
}

function resolvePlayerRenderLabel(name: unknown, displayName: unknown, playerId: unknown) {
    return normalizePlayerDisplayText(name, playerId)
        || normalizePlayerDisplayText(displayName, playerId)
        || '修士';
}

function resolvePlayerRenderChar(displayName: unknown, name: unknown) {
    const normalizedDisplayName = normalizePlayerDisplayText(displayName);
    const normalizedName = normalizePlayerDisplayText(name);
    if (normalizedDisplayName && (normalizedDisplayName !== '@' || !normalizedName)) {
        return getFirstGrapheme(normalizedDisplayName) || '@';
    }
    return getFirstGrapheme(normalizedName) || '人';
}

function normalizePlayerDisplayText(value: unknown, playerId: unknown = undefined) {
    const normalized = normalizePlayerIdentityText(value);
    if (!normalized || isRuntimePlayerIdLike(normalized) || normalized === normalizePlayerIdentityText(playerId)) {
        return '';
    }
    return normalized;
}

function isRuntimePlayerIdLike(value: string) {
    return /^p_[0-9a-f-]+(?:_\d+)?$/i.test(value) || /^player[:_-]/i.test(value);
}

function resolvePortalDisplayName(
    portal: ProjectorPortalLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
) {
    const explicitName = (portal as unknown as Record<string, unknown>).name;
    if (typeof explicitName === 'string' && explicitName.trim()) {
        return explicitName.trim();
    }
    const kindLabel = portal.kind === 'stairs' ? '楼梯' : '传送阵';
    const targetMapName = resolveMapName?.(portal.targetMapId) ?? null;
    if (typeof targetMapName === 'string' && targetMapName.trim()) {
        return `${kindLabel} · ${targetMapName.trim()}`;
    }
    if (typeof portal.targetMapId === 'string' && portal.targetMapId.trim()) {
        return `${kindLabel} · ${portal.targetMapId.trim()}`;
    }
    return kindLabel;
}

function buildAttrBonuses(player: ProjectorPlayerLike): AttrBonus[] {
    const signature = buildProjectedAttrBonusesSignature(player);
    const projectedCached = projectedAttrBonusCache.get(player);
    if (projectedCached?.signature === signature) {
        return projectedCached.bonuses;
    }
    const source = buildAttrDetailBonuses(player);
    if (source.length === 0) {
        projectedAttrBonusCache.set(player, { signature, bonuses: [] });
        return [];
    }
    const cached = attrBonusCloneCache.get(source);
    if (cached && isSameAttrBonuses(cached, source)) {
        projectedAttrBonusCache.set(player, { signature, bonuses: cached });
        return cached;
    }
    const cloned = source.map((entry) => cloneAttrBonus(entry));
    attrBonusCloneCache.set(source, cloned);
    projectedAttrBonusCache.set(player, { signature, bonuses: cloned });
    return cloned;
}

function buildProjectedAttrBonusesSignature(player: ProjectorPlayerLike): string {
    const realm = player.realm as Record<string, unknown> | null | undefined;
    return [
        player.attrs.revision,
        player.techniques.revision,
        player.equipment.revision,
        player.buffs.revision,
        player.realmLv ?? '',
        player.hp,
        player.maxHp,
        player.qi,
        player.maxQi,
        player.combat.cultivationActive === true ? 1 : 0,
        realm?.stage ?? '',
        realm?.displayName ?? '',
        realm?.name ?? '',
        stableShallowSignature((player as { runtimeBonuses?: unknown }).runtimeBonuses),
    ].join('|');
}

function buildSpecialStatsPatch(previous: PlayerSpecialStats, current: PlayerSpecialStats): Partial<PlayerSpecialStats> | undefined {
    const patch: Partial<PlayerSpecialStats> = {};
    if (previous.foundation !== current.foundation) { patch.foundation = current.foundation; }
    if (previous.rootFoundation !== current.rootFoundation) { patch.rootFoundation = current.rootFoundation; }
    if (previous.bodyTrainingLevel !== current.bodyTrainingLevel) { patch.bodyTrainingLevel = current.bodyTrainingLevel; }
    if (previous.combatExp !== current.combatExp) { patch.combatExp = current.combatExp; }
    if (previous.comprehension !== current.comprehension) { patch.comprehension = current.comprehension; }
    if (previous.luck !== current.luck) { patch.luck = current.luck; }
    return Object.keys(patch).length > 0 ? patch : undefined;
}

function buildActionOrder(actions: ProjectedActionEntry[]): string[] {
    return actions.map((entry) => entry.id);
}

function buildFullWorldDeltaFromState(
    view: Pick<ProjectorViewLike, 'tick' | 'worldRevision' | 'selfRevision'>,
    state: WorldStateSlice,
): WorldDeltaView {
    const players: WorldPlayerPatchView[] = Array.from(state.players, ([id, entry]) => ({
        id,
        n: entry.n,
        ch: entry.ch,
        x: entry.x,
        y: entry.y,
        sc: entry.sc ?? undefined,
    }));
    const monsters: WorldMonsterPatchView[] = Array.from(state.monsters, ([id, entry]) => ({
        id,
        x: entry.x,
        y: entry.y,
        hp: entry.hp,
        maxHp: entry.maxHp,
        qi: entry.qi,
        maxQi: entry.maxQi,
        n: entry.n,
        c: entry.c,
        tr: entry.tr,
    }));
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
function buildMapEnter(view: ProjectorViewLike): MapEnterView {
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
function buildFullWorldDelta(
    view: ProjectorViewLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): WorldDeltaView {
    return buildFullWorldDeltaFromState(view, captureWorldState(view, resolveMapName));
}

/** 构造全量 SelfDelta：包含玩家自身的位置、HP、MP、经验等核心状态。 */
function buildFullSelfDelta(player: ProjectorPlayerLike): SelfDeltaView {
    return buildFullSelfDeltaFromState(captureSelfState(player), player.selfRevision);
}

function buildFullSelfDeltaFromState(self: ProjectedSelfState, selfRevision: number): SelfDeltaView {
    return {
        sr: selfRevision,
        iid: self.instanceId,
        mid: self.templateId,
        x: self.x,
        y: self.y,
        f: self.f,
        hp: self.hp,
        maxHp: self.maxHp,
        qi: self.qi,
        maxQi: self.maxQi,
        wallet: self.wallet,
    };
}

/** 构造全量 PanelDelta：包含背包、装备、功法、属性、动作和 buff 面板完整状态。 */
function buildFullPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return buildFullPanelDeltaFromState(capturePanelState(player));
}

function buildFullPanelDeltaFromState(panel: ProjectedPanelState): S2C_PanelDelta {
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

/** 构造 bootstrap 首包 PanelDelta：仅含 revision，不含完整列表，客户端按需拉取。 */
function buildBootstrapPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return {
        inv: { r: player.inventory.revision },
        eq: { r: player.equipment.revision, slots: [] },
        tech: { r: player.techniques.revision, techniques: [] },
        attr: { r: player.attrs.revision },
        act: { r: player.actions.revision, actions: [] },
        buff: { r: player.buffs.revision },
    };
}

/** 捕获当前帧的世界状态快照，用于后续 diff 比较。 */
function captureWorldState(
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
        sc: resolveBuffPresentationScale(view.self.buffs),
    });
    for (const entry of view.visiblePlayers) {
        players.set(entry.playerId, {
            n: resolvePlayerRenderLabel(entry.name, entry.displayName, entry.playerId),
            ch: resolvePlayerRenderChar(entry.displayName, entry.name),
            x: entry.x, y: entry.y,
            sc: resolveBuffPresentationScale(entry.buffs),
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

function projectNpcEntry(entry: ProjectorNpcLike): ProjectedNpcEntry {
    const cached = npcProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, sh: entry.hasShop ? 1 as const : 0 as const, qm: entry.questMarker ?? null,
    });
    npcProjectionCache.set(entry, projected);
    return projected;
}

function projectMonsterEntry(entry: ProjectorMonsterLike): ProjectedMonsterEntry {
    const cached = monsterProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        mid: entry.monsterId, x: entry.x, y: entry.y, hp: entry.hp, maxHp: entry.maxHp, qi: entry.qi, maxQi: entry.maxQi, n: entry.name, c: entry.color, tr: entry.tier,
    });
    monsterProjectionCache.set(entry, projected);
    return projected;
}

function projectPortalEntry(
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

function projectGroundPileEntry(entry: ProjectorGroundPileLike): ProjectedGroundPileEntry {
    const cached = groundPileProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, items: entry.items.map((item) => ({ ...item })),
    });
    freezeProjectedEntry(projected.items);
    groundPileProjectionCache.set(entry, projected);
    return projected;
}

function projectContainerEntry(entry: ProjectorContainerLike): ProjectedContainerEntry {
    const cached = containerProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rr: normalizeOptionalNonNegativeInteger(entry.respawnRemainingTicks),
    });
    containerProjectionCache.set(entry, projected);
    return projected;
}

function projectBuildingEntry(entry: ProjectorBuildingLike): ProjectedBuildingEntry {
    const cached = buildingProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rt: normalizeOptionalNonNegativeInteger(entry.remainingTicks), tt: normalizeOptionalNonNegativeInteger(entry.totalTicks),
    });
    buildingProjectionCache.set(entry, projected);
    return projected;
}

function projectFormationEntry(entry: ProjectorFormationLike): ProjectedFormationEntry {
    const cached = formationProjectionCache.get(entry);
    if (cached) { return cached; }
    const projected = freezeProjectedEntry({
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char ?? '◎', c: entry.active === false ? '#9aa0a6' : entry.color ?? '#4da3ff', ac: entry.active === false ? 0 as const : 1 as const, rs: normalizeOptionalNonNegativeInteger(entry.radius), sh: entry.rangeShape, hl: entry.rangeHighlightColor, bch: entry.boundaryChar, bc: entry.boundaryColor, bhl: entry.boundaryRangeHighlightColor, ev: entry.eyeVisibleWithoutSenseQi === true ? 1 as const : 0 as const, rv: entry.rangeVisibleWithoutSenseQi === true ? 1 as const : 0 as const, bv: entry.boundaryVisibleWithoutSenseQi === true ? 1 as const : 0 as const, tx: entry.showText === false ? 0 as const : 1 as const, bd: entry.blocksBoundary === true ? 1 as const : 0 as const, os: entry.ownerSectId ?? null, op: entry.ownerPlayerId ?? null, lt: entry.lifecycle === 'persistent' ? 1 as const : 0 as const,
    });
    formationProjectionCache.set(entry, projected);
    return projected;
}

function freezeProjectedEntry<T extends object>(entry: T): T {
    if (process.env.NODE_ENV !== 'production') {
        Object.freeze(entry);
    }
    return entry;
}

/** 捕获当前帧的玩家自身状态快照，用于后续 self/panel diff。
 *  previousPanel 非空时按 revision 短路：未变的 slice 直接复用前帧引用，避免无谓克隆。 */
function capturePlayerState(player: ProjectorPlayerLike): PlayerStateSlice {
    return {
        selfRevision: player.selfRevision,
        self: captureSelfState(player),
        attrPanel: captureAttrPanelSlice(player),
        actionPanel: captureActionPanelSlice(player),
        techniquePanel: captureTechniquePanelSlice(player),
        panelCursor: buildPanelCursor(player),
    };
}

function captureSelfState(player: ProjectorPlayerLike): ProjectedSelfState {
    return {
        instanceId: player.instanceId,
        templateId: player.templateId,
        x: player.x, y: player.y, f: player.facing,
        hp: player.hp, maxHp: player.maxHp, qi: player.qi, maxQi: player.maxQi,
        wallet: cloneWalletState(player.wallet),
    };
}

function capturePanelState(player: ProjectorPlayerLike, previousPanel?: ProjectedPanelState | null): ProjectedPanelState {
    const prev = previousPanel ?? null;
    return {
        inventory: prev && prev.inventory.revision === player.inventory.revision
            ? prev.inventory : captureInventoryPanelSlice(player),
        equipment: prev && prev.equipment.revision === player.equipment.revision
            ? prev.equipment : captureEquipmentPanelSlice(player),
        technique: prev && prev.technique.revision === player.techniques.revision
            ? prev.technique : captureTechniquePanelSlice(player),
        attr: prev && canReuseAttrPanelSlice(prev.attr, player)
            ? prev.attr : captureAttrPanelSlice(player),
        action: prev && canReuseActionPanelSlice(prev.action, player)
            ? prev.action : captureActionPanelSlice(player),
        buff: prev && canReuseBuffPanelSlice(prev.buff, player)
            ? prev.buff : captureBuffPanelSlice(player),
    };
}

function buildPanelCursor(player: ProjectorPlayerLike, previousCursor?: ProjectedPanelCursor | null): ProjectedPanelCursor {
    const canReuseInventoryCursor = previousCursor
        && Array.isArray(previousCursor.inventorySlotSignatures)
        && previousCursor.inventoryRevision === player.inventory.revision
        && previousCursor.inventoryCapacity === player.inventory.capacity
        && previousCursor.inventorySize === player.inventory.items.length;
    const canReuseEquipmentCursor = previousCursor
        && previousCursor.equipmentSlotSignatures
        && previousCursor.equipmentRevision === player.equipment.revision;
    const canReuseActionCursor = previousCursor
        && Array.isArray(previousCursor.actionIds)
        && previousCursor.actionEntrySignatures
        && previousCursor.actionRevision === player.actions.revision;
    const currentBuffs = projectVisiblePlayerBuffs(player);
    const buffSignature = buildBuffListSignature(player.buffs.revision, currentBuffs);
    const canReuseBuffCursor = previousCursor
        && Array.isArray(previousCursor.buffIds)
        && previousCursor.buffEntrySignatures
        && previousCursor.buffRevision === player.buffs.revision
        && previousCursor.buffSignature === buffSignature;
    return {
        inventoryRevision: player.inventory.revision,
        inventoryCapacity: player.inventory.capacity,
        inventorySize: player.inventory.items.length,
        inventorySlotSignatures: canReuseInventoryCursor
            ? previousCursor.inventorySlotSignatures
            : player.inventory.items.map((entry) => buildStableProtocolSignature(entry)),
        equipmentRevision: player.equipment.revision,
        equipmentSlotSignatures: canReuseEquipmentCursor
            ? previousCursor.equipmentSlotSignatures
            : buildEquipmentSlotSignatures(player.equipment.slots),
        techniqueRevision: player.techniques.revision,
        attrRevision: player.attrs.revision,
        actionRevision: player.actions.revision,
        actionIds: canReuseActionCursor
            ? previousCursor.actionIds
            : player.actions.actions.map((entry) => entry.id),
        actionEntrySignatures: canReuseActionCursor
            ? previousCursor.actionEntrySignatures
            : buildActionEntrySignatures(player.actions.actions),
        buffRevision: player.buffs.revision,
        buffIds: canReuseBuffCursor
            ? previousCursor.buffIds
            : currentBuffs.map((entry) => entry.buffId),
        buffEntrySignatures: canReuseBuffCursor
            ? previousCursor.buffEntrySignatures
            : buildBuffEntrySignatures(currentBuffs),
        attrSignature: buildAttrPanelSignature(player),
        actionSignature: buildActionPanelSignature(player),
        buffSignature,
    };
}

function buildAttrPanelSignature(player: ProjectorPlayerLike): string {
    const attr = player.attrs;
    const realm = player.realm ?? null;
    return [
        attr.revision,
        attr.stage ?? '',
        player.boneAgeBaseYears,
        player.lifespanYears ?? '',
        realm?.progress ?? '',
        realm?.progressToNext ?? '',
        realm?.breakthroughReady === true ? 1 : 0,
        stableShallowSignature(attr.baseAttrs),
        stableShallowSignature(attr.finalAttrs),
        stableShallowSignature(attr.numericStats),
        stableShallowSignature(attr.ratioDivisors),
        resolvePlayerSpecialStatsSignature(resolvePlayerSpecialStatsCached(player)),
        buildCraftSkillSignature(player.alchemySkill),
        buildCraftSkillSignature(player.forgingSkill),
        buildCraftSkillSignature(player.buildingSkill),
        buildCraftSkillSignature(player.gatherSkill),
        buildCraftSkillSignature(player.enhancementSkill),
        buildCraftSkillSignature(player.miningSkill),
        buildCraftSkillSignature(player.formationSkill),
        buildCraftSkillSignature(player.transmissionSkill),
        buildAttrBonusesSignature(buildAttrBonuses(player)),
    ].join('|');
}

function resolvePlayerSpecialStatsSignature(stats: PlayerSpecialStats): string {
    return [
        stats.foundation,
        stats.rootFoundation,
        stats.bodyTrainingLevel,
        stats.combatExp,
        stats.comprehension,
        stats.luck,
    ].join(',');
}

function buildCraftSkillSignature(skill: unknown): string {
    if (!skill || typeof skill !== 'object') {
        return '';
    }
    const record = skill as Record<string, unknown>;
    return [
        record.level ?? '',
        record.exp ?? '',
        record.expToNext ?? '',
        record.successBonus ?? '',
        record.qualityBonus ?? '',
    ].join(',');
}

function buildAttrBonusesSignature(bonuses: AttrBonus[]): string {
    if (bonuses.length === 0) {
        return '';
    }
    return bonuses.map((entry) => [
        entry.source,
        entry.attrMode ?? 'flat',
        stableShallowSignature(entry.attrs),
        stableShallowSignature(entry.stats),
        stableShallowSignature(entry.qiProjection),
        entry.label ?? '',
    ].join(':')).join(';');
}

function buildActionPanelSignature(player: ProjectorPlayerLike): string {
    return [
        player.actions.revision,
        player.combat.autoBattle === true ? 1 : 0,
        player.combat.autoBattleTargetingMode ?? '',
        player.combat.retaliatePlayerTargetId ?? '',
        player.combat.combatTargetId ?? '',
        player.combat.combatTargetLocked === true ? 1 : 0,
        player.combat.autoRetaliate === true ? 1 : 0,
        player.combat.autoBattleStationary === true ? 1 : 0,
        player.combat.allowAoePlayerHit === true ? 1 : 0,
        player.combat.autoIdleCultivation === true ? 1 : 0,
        player.combat.autoSwitchCultivation === true ? 1 : 0,
        player.combat.autoRootFoundation === true ? 1 : 0,
        player.combat.cultivationActive === true ? 1 : 0,
        player.combat.senseQiActive === true ? 1 : 0,
        player.combat.wangQiActive === true ? 1 : 0,
        buildAutoUsePillsSignature(player.combat.autoUsePills),
        buildCombatTargetingRulesSignature(player.combat.combatTargetingRules),
    ].join('|');
}

function buildAutoUsePillsSignature(configs: AutoUsePillConfig[] | null | undefined): string {
    return Array.isArray(configs) ? stableShallowSignature(configs) : '';
}

function buildCombatTargetingRulesSignature(rules: CombatTargetingRules | null | undefined): string {
    return rules ? stableShallowSignature(rules) : '';
}

function buildBuffListSignature(revision: number, buffs: VisibleBuffState[]): string {
    return `${revision}|${buffs.map((entry) => [
        entry.buffId,
        entry.name,
        entry.stacks,
        entry.presentationScale ?? '',
    ].join(':')).join(';')}`;
}

function buildEquipmentSlotSignatures(slots: ProjectorPlayerLike['equipment']['slots']): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of slots) {
        signatures[entry.slot] = buildStableProtocolSignature(entry.item ?? null);
    }
    return signatures;
}

function buildActionEntrySignatures(actions: ProjectedActionEntry[]): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of actions) {
        const { cooldownLeft: _cd, ...rest } = entry;
        signatures[entry.id] = buildStableProtocolSignature(rest);
    }
    return signatures;
}

function buildBuffEntrySignatures(buffs: VisibleBuffState[]): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of buffs) {
        const { remainingTicks: _rt, ...rest } = entry;
        signatures[entry.buffId] = buildStableProtocolSignature(rest);
    }
    return signatures;
}

function buildStableProtocolSignature(value: unknown): string {
    return stableShallowSignature(value);
}

function stableShallowSignature(value: unknown): string {
    return String(stableShallowHash(value));
}

/** FNV-1a 32-bit hash 常量 */
const FNV_OFFSET_BASIS = 2166136261;
const FNV_PRIME = 16777619;

/** 递归 FNV-1a 数值 hash，替代字符串拼接签名。 */
function stableShallowHash(value: unknown): number {
    if (value == null) {
        return 0;
    }
    if (Array.isArray(value)) {
        let hash = FNV_OFFSET_BASIS;
        for (let i = 0; i < value.length; i += 1) {
            hash = fnvMix(hash, stableShallowHash(value[i]));
        }
        return hash >>> 0;
    }
    if (typeof value === 'number') {
        return fnvHashNumber(value);
    }
    if (typeof value === 'string') {
        return fnvHashString(value);
    }
    if (typeof value === 'boolean') {
        return value ? 1231 : 1237;
    }
    if (typeof value !== 'object') {
        return fnvHashString(String(value));
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record).sort();
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < keys.length; i += 1) {
        hash = fnvMix(hash, fnvHashString(keys[i]));
        hash = fnvMix(hash, stableShallowHash(record[keys[i]]));
    }
    return hash >>> 0;
}

function fnvHashString(str: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

function fnvHashNumber(num: number): number {
    // 整数直接混入，浮点转字符串
    if (Number.isInteger(num) && num >= -2147483648 && num <= 2147483647) {
        let hash = FNV_OFFSET_BASIS;
        hash ^= (num & 0xff);
        hash = Math.imul(hash, FNV_PRIME);
        hash ^= ((num >>> 8) & 0xff);
        hash = Math.imul(hash, FNV_PRIME);
        hash ^= ((num >>> 16) & 0xff);
        hash = Math.imul(hash, FNV_PRIME);
        hash ^= ((num >>> 24) & 0xff);
        hash = Math.imul(hash, FNV_PRIME);
        return hash >>> 0;
    }
    return fnvHashString(String(num));
}

function fnvMix(hash: number, value: number): number {
    hash ^= (value & 0xff);
    hash = Math.imul(hash, FNV_PRIME);
    hash ^= ((value >>> 8) & 0xff);
    hash = Math.imul(hash, FNV_PRIME);
    hash ^= ((value >>> 16) & 0xff);
    hash = Math.imul(hash, FNV_PRIME);
    hash ^= ((value >>> 24) & 0xff);
    hash = Math.imul(hash, FNV_PRIME);
    return hash >>> 0;
}

function canReuseAttrPanelSlice(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): boolean {
    return previousAttr.revision === player.attrs.revision
        && previousAttr.stage === player.attrs.stage
        && previousAttr.boneAgeBaseYears === player.boneAgeBaseYears
        && previousAttr.lifespanYears === player.lifespanYears
        && previousAttr.realmProgress === player.realm?.progress
        && previousAttr.realmProgressToNext === player.realm?.progressToNext
        && previousAttr.realmBreakthroughReady === player.realm?.breakthroughReady
        && isSameCraftSkillState(previousAttr.alchemySkill, player.alchemySkill)
        && isSameCraftSkillState(previousAttr.forgingSkill, player.forgingSkill)
        && isSameCraftSkillState(previousAttr.buildingSkill, player.buildingSkill)
        && isSameCraftSkillState(previousAttr.gatherSkill, player.gatherSkill)
        && isSameCraftSkillState(previousAttr.enhancementSkill, player.enhancementSkill)
        && isSameCraftSkillState(previousAttr.miningSkill, player.miningSkill)
        && isSameCraftSkillState(previousAttr.formationSkill, player.formationSkill)
        && isSameCraftSkillState(previousAttr.transmissionSkill, player.transmissionSkill)
        && isSameSpecialStats(previousAttr.specialStats, resolvePlayerSpecialStatsCached(player))
        && isSameAttrBonuses(previousAttr.bonuses, buildAttrBonuses(player));
}

function canReuseActionPanelSlice(previousAction: ProjectedActionPanelState, player: ProjectorPlayerLike): boolean {
    return previousAction.revision === player.actions.revision
        && previousAction.autoBattle === player.combat.autoBattle
        && isSameAutoUsePillList(previousAction.autoUsePills ?? [], player.combat.autoUsePills ?? [])
        && isSameCombatTargetingRules(previousAction.combatTargetingRules ?? null, player.combat.combatTargetingRules ?? null)
        && previousAction.autoBattleTargetingMode === player.combat.autoBattleTargetingMode
        && previousAction.retaliatePlayerTargetId === player.combat.retaliatePlayerTargetId
        && previousAction.combatTargetId === player.combat.combatTargetId
        && previousAction.combatTargetLocked === player.combat.combatTargetLocked
        && previousAction.autoRetaliate === player.combat.autoRetaliate
        && previousAction.autoBattleStationary === player.combat.autoBattleStationary
        && previousAction.allowAoePlayerHit === player.combat.allowAoePlayerHit
        && previousAction.autoIdleCultivation === player.combat.autoIdleCultivation
        && previousAction.autoSwitchCultivation === player.combat.autoSwitchCultivation
        && previousAction.autoRootFoundation === (player.combat.autoRootFoundation === true)
        && previousAction.cultivationActive === player.combat.cultivationActive
        && previousAction.senseQiActive === player.combat.senseQiActive
        && previousAction.wangQiActive === (player.combat.wangQiActive === true);
}

function canReuseBuffPanelSlice(previousBuff: ProjectedPanelState['buff'], player: ProjectorPlayerLike): boolean {
    return previousBuff.revision === player.buffs.revision
        && isSameBuffList(previousBuff.buffs, projectVisiblePlayerBuffs(player));
}

function captureInventoryPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['inventory'] {
    return {
        revision: player.inventory.revision,
        capacity: player.inventory.capacity,
        items: player.inventory.items.map((entry) => ({ ...entry })),
        cooldowns: Array.isArray(player.inventory.cooldowns)
            ? player.inventory.cooldowns.map((entry) => ({ ...entry }))
            : undefined,
        serverTick: Number.isFinite(Number(player.inventory.serverTick))
            ? Math.max(0, Math.trunc(Number(player.inventory.serverTick) || 0))
            : undefined,
    };
}

function captureEquipmentPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['equipment'] {
    return { revision: player.equipment.revision, slots: player.equipment.slots.map((entry) => ({ slot: entry.slot, item: entry.item ? { ...entry.item } : null })) };
}

function captureTechniquePanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['technique'] {
    return {
        revision: player.techniques.revision,
        techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
        cultivatingTechId: player.techniques.cultivatingTechId,
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        pendingComprehensions: clonePendingComprehensions(player.pendingTechniqueComprehensions, player.transmissionJob),
    };
}

function captureAttrPanelSlice(player: ProjectorPlayerLike): ProjectedAttrPanelState {
    return {
        revision: player.attrs.revision,
        stage: player.attrs.stage,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: cloneNumericStats(player.attrs.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
        specialStats: cloneSpecialStats(resolvePlayerSpecialStatsCached(player)),
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
        alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
        forgingSkill: player.forgingSkill ? { ...player.forgingSkill } : undefined,
        buildingSkill: player.buildingSkill ? { ...player.buildingSkill } : undefined,
        gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
        enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
        miningSkill: player.miningSkill ? { ...player.miningSkill } : undefined,
        formationSkill: player.formationSkill ? { ...player.formationSkill } : undefined,
        transmissionSkill: player.transmissionSkill ? { ...player.transmissionSkill } : undefined,
    };
}

function captureActionPanelSlice(player: ProjectorPlayerLike): ProjectedActionPanelState {
    return {
        revision: player.actions.revision,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        autoBattle: player.combat.autoBattle,
        autoUsePills: cloneAutoUsePillList(player.combat.autoUsePills),
        combatTargetingRules: cloneCombatTargetingRules(player.combat.combatTargetingRules),
        autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
        retaliatePlayerTargetId: player.combat.retaliatePlayerTargetId,
        combatTargetId: player.combat.combatTargetId,
        combatTargetLocked: player.combat.combatTargetLocked,
        autoRetaliate: player.combat.autoRetaliate,
        autoBattleStationary: player.combat.autoBattleStationary,
        allowAoePlayerHit: player.combat.allowAoePlayerHit,
        autoIdleCultivation: player.combat.autoIdleCultivation,
        autoSwitchCultivation: player.combat.autoSwitchCultivation,
        autoRootFoundation: player.combat.autoRootFoundation === true,
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
        wangQiActive: player.combat.wangQiActive === true,
    };
}

function captureBuffPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['buff'] {
    return { revision: player.buffs.revision, buffs: projectVisiblePlayerBuffs(player) };
}

function combineProjectorState(worldState: WorldStateSlice, playerState: PlayerStateSlice): ProjectorState {
    return {
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
        selfRevision: playerState.selfRevision,
        self: playerState.self,
        attrPanel: playerState.attrPanel,
        actionPanel: playerState.actionPanel,
        techniquePanel: playerState.techniquePanel,
        panelCursor: playerState.panelCursor,
    };
}

function captureProjectorState(
    view: ProjectorViewLike,
    player: ProjectorPlayerLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): ProjectorState {
    return combineProjectorState(captureWorldState(view, resolveMapName), capturePlayerState(player));
}

function buildFullAttrDelta(player: ProjectorPlayerLike): ProjectedAttrDeltaView {
    return buildFullAttrDeltaFromState(captureAttrPanelSlice(player));
}

function buildFullAttrDeltaFromState(attr: ProjectedAttrPanelState): ProjectedAttrDeltaView {
    return {
        r: attr.revision,
        full: 1 as const,
        stage: attr.stage,
        baseAttrs: attr.baseAttrs,
        bonuses: attr.bonuses,
        finalAttrs: attr.finalAttrs,
        numericStats: attr.numericStats,
        ratioDivisors: attr.ratioDivisors,
        specialStats: attr.specialStats,
        boneAgeBaseYears: attr.boneAgeBaseYears,
        lifeElapsedTicks: attr.lifeElapsedTicks,
        lifespanYears: attr.lifespanYears,
        realmProgress: attr.realmProgress,
        realmProgressToNext: attr.realmProgressToNext,
        realmBreakthroughReady: attr.realmBreakthroughReady,
        alchemySkill: attr.alchemySkill,
        forgingSkill: attr.forgingSkill,
        buildingSkill: attr.buildingSkill,
        gatherSkill: attr.gatherSkill,
        enhancementSkill: attr.enhancementSkill,
        miningSkill: attr.miningSkill,
        formationSkill: attr.formationSkill,
        transmissionSkill: attr.transmissionSkill,
    };
}

function buildFullActionDelta(player: ProjectorPlayerLike): S2C_PanelActionDelta {
    return buildFullActionDeltaFromState(captureActionPanelSlice(player));
}

function buildFullActionDeltaFromState(action: ProjectedActionPanelState): S2C_PanelActionDelta {
    return {
        r: action.revision,
        full: 1,
        actions: action.actions,
        actionOrder: buildActionOrder(action.actions),
        autoBattle: action.autoBattle,
        autoUsePills: action.autoUsePills,
        combatTargetingRules: action.combatTargetingRules,
        autoBattleTargetingMode: action.autoBattleTargetingMode,
        retaliatePlayerTargetId: action.retaliatePlayerTargetId,
        combatTargetId: action.combatTargetId,
        combatTargetLocked: action.combatTargetLocked,
        autoRetaliate: action.autoRetaliate,
        autoBattleStationary: action.autoBattleStationary,
        allowAoePlayerHit: action.allowAoePlayerHit,
        autoIdleCultivation: action.autoIdleCultivation,
        autoSwitchCultivation: action.autoSwitchCultivation,
        autoRootFoundation: action.autoRootFoundation,
        cultivationActive: action.cultivationActive,
        senseQiActive: action.senseQiActive,
        wangQiActive: action.wangQiActive,
    };
}

function buildActionDeltaFromState(
    previousAction: ProjectedActionPanelState,
    currentAction: ProjectedActionPanelState,
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
): S2C_PanelActionDelta {
    const actionPatch = previousCursor.actionRevision !== currentCursor.actionRevision
        ? diffActionEntryPatches(previousAction.actions, currentAction.actions)
        : [];
    const removedActionIds = previousCursor.actionRevision !== currentCursor.actionRevision
        ? diffRemovedIds(previousCursor.actionIds, currentCursor.actionIds)
        : [];
    const actionOrderChanged = !isSameStringList(previousCursor.actionIds, currentCursor.actionIds);
    return {
        r: currentAction.revision,
        actions: actionPatch.length > 0 ? actionPatch : undefined,
        removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
        actionOrder: actionOrderChanged ? buildActionOrder(currentAction.actions) : undefined,
        autoBattle: previousAction.autoBattle !== currentAction.autoBattle ? currentAction.autoBattle : undefined,
        autoUsePills: !isSameAutoUsePillList(previousAction.autoUsePills ?? [], currentAction.autoUsePills ?? [])
            ? currentAction.autoUsePills
            : undefined,
        combatTargetingRules: !isSameCombatTargetingRules(previousAction.combatTargetingRules ?? null, currentAction.combatTargetingRules ?? null)
            ? currentAction.combatTargetingRules
            : undefined,
        autoBattleTargetingMode: previousAction.autoBattleTargetingMode !== currentAction.autoBattleTargetingMode
            ? currentAction.autoBattleTargetingMode
            : undefined,
        retaliatePlayerTargetId: previousAction.retaliatePlayerTargetId !== currentAction.retaliatePlayerTargetId
            ? currentAction.retaliatePlayerTargetId ?? null
            : undefined,
        combatTargetId: previousAction.combatTargetId !== currentAction.combatTargetId
            ? currentAction.combatTargetId ?? null
            : undefined,
        combatTargetLocked: previousAction.combatTargetLocked !== currentAction.combatTargetLocked
            ? currentAction.combatTargetLocked
            : undefined,
        autoRetaliate: previousAction.autoRetaliate !== currentAction.autoRetaliate
            ? currentAction.autoRetaliate
            : undefined,
        autoBattleStationary: previousAction.autoBattleStationary !== currentAction.autoBattleStationary
            ? currentAction.autoBattleStationary
            : undefined,
        allowAoePlayerHit: previousAction.allowAoePlayerHit !== currentAction.allowAoePlayerHit
            ? currentAction.allowAoePlayerHit
            : undefined,
        autoIdleCultivation: previousAction.autoIdleCultivation !== currentAction.autoIdleCultivation
            ? currentAction.autoIdleCultivation
            : undefined,
        autoSwitchCultivation: previousAction.autoSwitchCultivation !== currentAction.autoSwitchCultivation
            ? currentAction.autoSwitchCultivation
            : undefined,
        autoRootFoundation: previousAction.autoRootFoundation !== currentAction.autoRootFoundation
            ? currentAction.autoRootFoundation
            : undefined,
        cultivationActive: previousAction.cultivationActive !== currentAction.cultivationActive
            ? currentAction.cultivationActive
            : undefined,
        senseQiActive: previousAction.senseQiActive !== currentAction.senseQiActive
            ? currentAction.senseQiActive
            : undefined,
        wangQiActive: previousAction.wangQiActive !== currentAction.wangQiActive
            ? currentAction.wangQiActive
            : undefined,
    };
}

function buildFullBuffDelta(player: ProjectorPlayerLike): S2C_PanelDelta['buff'] {
    return buildFullBuffDeltaFromState(captureBuffPanelSlice(player));
}

function buildFullBuffDeltaFromState(buff: ProjectedPanelState['buff']): S2C_PanelDelta['buff'] {
    return { r: buff.revision, full: 1, buffs: buff.buffs };
}

function buildAttrDelta(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): ProjectedAttrDeltaView {
    return buildAttrDeltaFromState(previousAttr, captureAttrPanelSlice(player));
}

function buildAttrDeltaFromState(previousAttr: ProjectedAttrPanelState, currentAttr: ProjectedAttrPanelState): ProjectedAttrDeltaView {
    const stageChanged = previousAttr.stage !== currentAttr.stage;
    const baseAttrsPatch = diffAttributes(previousAttr.baseAttrs, currentAttr.baseAttrs);
    const bonusesChanged = !isSameAttrBonuses(previousAttr.bonuses, currentAttr.bonuses);
    const finalAttrsPatch = diffAttributes(previousAttr.finalAttrs, currentAttr.finalAttrs);
    const numericStatsPatch = diffNumericStats(previousAttr.numericStats, currentAttr.numericStats);
    const ratioDivisorsPatch = diffRatioDivisors(previousAttr.ratioDivisors, currentAttr.ratioDivisors);
    const nextSpecialStats = currentAttr.specialStats;
    const specialStatsChanged = !isSameSpecialStats(previousAttr.specialStats, nextSpecialStats);
    const boneAgeBaseYearsChanged = previousAttr.boneAgeBaseYears !== currentAttr.boneAgeBaseYears;
    const lifeElapsedTicksChanged = previousAttr.lifeElapsedTicks !== currentAttr.lifeElapsedTicks;
    const lifespanYearsChanged = previousAttr.lifespanYears !== currentAttr.lifespanYears;
    const realmProgressChanged = previousAttr.realmProgress !== currentAttr.realmProgress;
    const realmProgressToNextChanged = previousAttr.realmProgressToNext !== currentAttr.realmProgressToNext;
    const realmBreakthroughReadyChanged = previousAttr.realmBreakthroughReady !== currentAttr.realmBreakthroughReady;
    const alchemySkillChanged = !isSameCraftSkillState(previousAttr.alchemySkill, currentAttr.alchemySkill);
    const forgingSkillChanged = !isSameCraftSkillState(previousAttr.forgingSkill, currentAttr.forgingSkill);
    const buildingSkillChanged = !isSameCraftSkillState(previousAttr.buildingSkill, currentAttr.buildingSkill);
    const gatherSkillChanged = !isSameCraftSkillState(previousAttr.gatherSkill, currentAttr.gatherSkill);
    const enhancementSkillChanged = !isSameCraftSkillState(previousAttr.enhancementSkill, currentAttr.enhancementSkill);
    const miningSkillChanged = !isSameCraftSkillState(previousAttr.miningSkill, currentAttr.miningSkill);
    const formationSkillChanged = !isSameCraftSkillState(previousAttr.formationSkill, currentAttr.formationSkill);
    const transmissionSkillChanged = !isSameCraftSkillState(previousAttr.transmissionSkill, currentAttr.transmissionSkill);
    return {
        r: currentAttr.revision,
        stage: stageChanged ? currentAttr.stage : undefined,
        baseAttrs: baseAttrsPatch.patch,
        bonuses: bonusesChanged ? currentAttr.bonuses : undefined,
        finalAttrs: finalAttrsPatch.patch,
        numericStats: numericStatsPatch.patch,
        ratioDivisors: ratioDivisorsPatch.patch,
        specialStats: specialStatsChanged ? buildSpecialStatsPatch(previousAttr.specialStats, nextSpecialStats) : undefined,
        boneAgeBaseYears: boneAgeBaseYearsChanged ? currentAttr.boneAgeBaseYears : undefined,
        lifeElapsedTicks: lifeElapsedTicksChanged ? currentAttr.lifeElapsedTicks : undefined,
        lifespanYears: lifespanYearsChanged ? currentAttr.lifespanYears : undefined,
        realmProgress: realmProgressChanged ? currentAttr.realmProgress : undefined,
        realmProgressToNext: realmProgressToNextChanged ? currentAttr.realmProgressToNext : undefined,
        realmBreakthroughReady: realmBreakthroughReadyChanged ? currentAttr.realmBreakthroughReady : undefined,
        alchemySkill: alchemySkillChanged ? currentAttr.alchemySkill : undefined,
        forgingSkill: forgingSkillChanged ? currentAttr.forgingSkill : undefined,
        buildingSkill: buildingSkillChanged ? currentAttr.buildingSkill : undefined,
        gatherSkill: gatherSkillChanged ? currentAttr.gatherSkill : undefined,
        enhancementSkill: enhancementSkillChanged ? currentAttr.enhancementSkill : undefined,
        miningSkill: miningSkillChanged ? currentAttr.miningSkill : undefined,
        formationSkill: formationSkillChanged ? currentAttr.formationSkill : undefined,
        transmissionSkill: transmissionSkillChanged ? currentAttr.transmissionSkill : undefined,
    };
}

function buildSelfDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): SelfDeltaView | null {
    if (previous.selfRevision === player.selfRevision) { return null; }
    const delta: SelfDeltaView = { sr: player.selfRevision };
    if (previous.self.instanceId !== player.instanceId) { delta.iid = player.instanceId; }
    if (previous.self.templateId !== player.templateId) { delta.mid = player.templateId; }
    if (previous.self.f !== player.facing) { delta.f = player.facing; }
    if (previous.self.hp !== player.hp) { delta.hp = player.hp; }
    if (previous.self.maxHp !== player.maxHp) { delta.maxHp = player.maxHp; }
    if (previous.self.qi !== player.qi) { delta.qi = player.qi; }
    if (previous.self.maxQi !== player.maxQi) { delta.maxQi = player.maxQi; }
    if (!isSameWalletState(previous.self.wallet, player.wallet)) { delta.wallet = cloneWalletState(player.wallet); }
    return delta;
}

function buildPanelUpdate(previous: PlayerStateSlice, player: ProjectorPlayerLike): PanelDeltaBuildResult {
    const panelCursor = buildPanelCursor(player, previous.panelCursor);
    const currentAttrPanel = previous.attrPanel && canReuseAttrPanelSlice(previous.attrPanel, player)
        ? previous.attrPanel
        : captureAttrPanelSlice(player);
    const currentActionPanel = previous.actionPanel && canReuseActionPanelSlice(previous.actionPanel, player)
        ? previous.actionPanel
        : captureActionPanelSlice(player);
    const hasTechniqueCache = Boolean(previous.techniquePanel);
    const delta = buildPanelDeltaFromCursor(previous.panelCursor, panelCursor, player, {
        previousAttr: previous.attrPanel,
        currentAttr: currentAttrPanel,
        previousAction: previous.actionPanel,
        currentAction: currentActionPanel,
        skipTechnique: hasTechniqueCache,
    }) ?? {};
    let techniquePanel = previous.techniquePanel;
    if (previous.techniquePanel && previous.panelCursor.techniqueRevision !== panelCursor.techniqueRevision) {
        const currentTechnique = captureTechniquePanelSlice(player);
        const techniquePatch = diffTechniqueEntries(previous.techniquePanel.techniques, currentTechnique.techniques);
        const removed = diffRemovedTechniqueIds(previous.techniquePanel.techniques, currentTechnique.techniques);
        delta.tech = {
            r: currentTechnique.revision,
            techniques: techniquePatch.length > 0 ? techniquePatch : undefined,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,
            cultivatingTechId: previous.techniquePanel.cultivatingTechId !== currentTechnique.cultivatingTechId
                ? currentTechnique.cultivatingTechId : undefined,
            bodyTraining: !isSameBodyTrainingState(previous.techniquePanel.bodyTraining, currentTechnique.bodyTraining)
                ? currentTechnique.bodyTraining : undefined,
            pendingComprehensions: !isSamePendingComprehensions(previous.techniquePanel.pendingComprehensions, currentTechnique.pendingComprehensions)
                ? currentTechnique.pendingComprehensions : undefined,
        };
        techniquePanel = currentTechnique;
    } else if (!techniquePanel) {
        techniquePanel = captureTechniquePanelSlice(player);
    }
    const finalDelta = delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
    return { delta: finalDelta, panelCursor, attrPanel: currentAttrPanel, actionPanel: currentActionPanel, techniquePanel };
}

function buildPanelDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): S2C_PanelDelta | null {
    return buildPanelUpdate(previous, player).delta;
}

function buildPanelDeltaFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    player: ProjectorPlayerLike,
    options: {
        skipTechnique?: boolean;
        previousAttr?: ProjectedAttrPanelState;
        currentAttr?: ProjectedAttrPanelState;
        previousAction?: ProjectedActionPanelState;
        currentAction?: ProjectedActionPanelState;
    } = {},
): S2C_PanelDelta | null {
    const delta: S2C_PanelDelta = {};
    if (previousCursor.inventoryRevision !== currentCursor.inventoryRevision) {
        const inventory = captureInventoryPanelSlice(player);
        const slotPatch = diffInventorySlotsFromCursor(previousCursor, currentCursor, inventory.items);
        delta.inv = {
            r: inventory.revision,
            capacity: previousCursor.inventoryCapacity !== currentCursor.inventoryCapacity ? inventory.capacity : undefined,
            size: previousCursor.inventorySize !== currentCursor.inventorySize ? inventory.items.length : undefined,
            slots: slotPatch.length > 0 ? slotPatch : undefined,
            cooldowns: inventory.cooldowns,
            serverTick: inventory.serverTick,
        };
    }
    if (previousCursor.equipmentRevision !== currentCursor.equipmentRevision) {
        const equipment = captureEquipmentPanelSlice(player);
        const slotPatch = diffEquipmentSlotsFromCursor(previousCursor, currentCursor, equipment.slots);
        delta.eq = { r: equipment.revision, slots: slotPatch };
    }
    if (!options.skipTechnique && previousCursor.techniqueRevision !== currentCursor.techniqueRevision) {
        const technique = captureTechniquePanelSlice(player);
        delta.tech = {
            r: technique.revision,
            full: 1,
            techniques: technique.techniques,
            cultivatingTechId: technique.cultivatingTechId,
            bodyTraining: technique.bodyTraining,
            pendingComprehensions: technique.pendingComprehensions,
        };
    }
    if (previousCursor.attrSignature !== currentCursor.attrSignature) {
        const currentAttr = options.currentAttr ?? captureAttrPanelSlice(player);
        delta.attr = options.previousAttr
            ? buildAttrDeltaFromState(options.previousAttr, currentAttr)
            : buildFullAttrDeltaFromState(currentAttr);
    }
    if (previousCursor.actionSignature !== currentCursor.actionSignature) {
        const currentAction = options.currentAction ?? captureActionPanelSlice(player);
        delta.act = options.previousAction
            ? buildActionDeltaFromState(options.previousAction, currentAction, previousCursor, currentCursor)
            : buildFullActionDeltaFromState(currentAction);
    }
    if (previousCursor.buffSignature !== currentCursor.buffSignature) {
        const buff = captureBuffPanelSlice(player);
        const buffPatch = diffBuffEntriesFromCursor(previousCursor, currentCursor, buff.buffs);
        const removedBuffIds = diffRemovedIds(previousCursor.buffIds, currentCursor.buffIds);
        delta.buff = {
            r: buff.revision,
            buffs: buffPatch.length > 0 ? buffPatch : undefined,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}

function diffInventorySlotsFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    currentItems: SyncedItemStack[],
): NonNullable<NonNullable<S2C_PanelDelta['inv']>['slots']> {
    const patch: NonNullable<NonNullable<S2C_PanelDelta['inv']>['slots']> = [];
    const previousSignatures = previousCursor.inventorySlotSignatures ?? [];
    const maxLength = Math.max(previousSignatures.length, currentItems.length);
    for (let index = 0; index < maxLength; index += 1) {
        const previousSignature = previousSignatures[index] ?? '';
        const currentSignature = currentCursor.inventorySlotSignatures[index] ?? '';
        if (previousSignature !== currentSignature) {
            patch.push({ slotIndex: index, item: currentItems[index] ?? null });
        }
    }
    return patch;
}

function diffEquipmentSlotsFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    currentSlots: NonNullable<S2C_PanelDelta['eq']>['slots'],
): NonNullable<S2C_PanelDelta['eq']>['slots'] {
    const patch: NonNullable<S2C_PanelDelta['eq']>['slots'] = [];
    const previousSignatures = previousCursor.equipmentSlotSignatures ?? {};
    const currentSignatures = currentCursor.equipmentSlotSignatures ?? {};
    for (const entry of currentSlots) {
        if ((previousSignatures[entry.slot] ?? '') !== (currentSignatures[entry.slot] ?? '')) {
            patch.push(entry);
        }
    }
    return patch;
}

function diffActionEntryPatches(
    previousActions: ProjectedActionEntry[],
    currentActions: ProjectedActionEntry[],
): NonNullable<S2C_PanelActionDelta['actions']> {
    const previousById = new Map(previousActions.map((entry) => [entry.id, entry]));
    const patches: NonNullable<S2C_PanelActionDelta['actions']> = [];
    for (const entry of currentActions) {
        const previous = previousById.get(entry.id);
        if (!previous) {
            patches.push(entry);
            continue;
        }
        const patch = buildActionEntryPatch(previous, entry);
        if (Object.keys(patch).length > 1) {
            patches.push(patch);
        }
    }
    return patches;
}

function buildActionEntryPatch(
    previous: ProjectedActionEntry,
    current: ProjectedActionEntry,
): NonNullable<S2C_PanelActionDelta['actions']>[number] {
    const patch: NonNullable<S2C_PanelActionDelta['actions']>[number] = { id: current.id };
    if (previous.cooldownReadyTick !== current.cooldownReadyTick) {
        patch.cooldownLeft = current.cooldownLeft ?? 0;
        if (current.cooldownReadyTick !== undefined) {
            patch.cooldownReadyTick = current.cooldownReadyTick;
        }
    }
    setActionPatchField(patch, 'autoBattleEnabled', previous.autoBattleEnabled, current.autoBattleEnabled);
    setActionPatchField(patch, 'autoBattleOrder', previous.autoBattleOrder, current.autoBattleOrder);
    setActionPatchField(patch, 'skillEnabled', previous.skillEnabled, current.skillEnabled);
    setActionPatchField(patch, 'name', previous.name, current.name);
    setActionPatchField(patch, 'type', previous.type, current.type);
    setActionPatchField(patch, 'desc', previous.desc, current.desc);
    setActionPatchField(patch, 'range', previous.range, current.range);
    setActionPatchField(patch, 'requiresTarget', previous.requiresTarget, current.requiresTarget);
    setActionPatchField(patch, 'targetMode', previous.targetMode, current.targetMode);
    setActionPatchField(patch, 'scriptureTechniqueId', previous.scriptureTechniqueId, current.scriptureTechniqueId);
    setActionPatchField(patch, 'scriptureTechniqueName', previous.scriptureTechniqueName, current.scriptureTechniqueName);
    setActionPatchField(patch, 'scriptureTechniqueRealmLv', previous.scriptureTechniqueRealmLv, current.scriptureTechniqueRealmLv);
    setActionPatchField(patch, 'scriptureTechniqueGrade', previous.scriptureTechniqueGrade, current.scriptureTechniqueGrade);
    setActionPatchField(patch, 'scriptureTechniqueCategory', previous.scriptureTechniqueCategory, current.scriptureTechniqueCategory);
    return patch;
}

function setActionPatchField<K extends keyof NonNullable<S2C_PanelActionDelta['actions']>[number]>(
    patch: NonNullable<S2C_PanelActionDelta['actions']>[number],
    key: K,
    previous: NonNullable<S2C_PanelActionDelta['actions']>[number][K] | undefined,
    current: NonNullable<S2C_PanelActionDelta['actions']>[number][K] | undefined,
): void {
    if (previous === current) {
        return;
    }
    patch[key] = (current ?? null) as NonNullable<S2C_PanelActionDelta['actions']>[number][K];
}

function diffBuffEntriesFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    currentBuffs: VisibleBuffState[],
): VisibleBuffState[] {
    const previousSignatures = previousCursor.buffEntrySignatures ?? {};
    const currentSignatures = currentCursor.buffEntrySignatures ?? {};
    return currentBuffs.filter((entry) => (
        (previousSignatures[entry.buffId] ?? '') !== (currentSignatures[entry.buffId] ?? '')
    ));
}

function diffRemovedIds(previousIds: string[], currentIds: string[]): string[] {
    const current = new Set(currentIds);
    return previousIds.filter((id) => !current.has(id));
}

function isSameStringList(left: string[], right: string[]): boolean {
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}

function isSameBodyTrainingState(left: ProjectedPanelState['technique']['bodyTraining'], right: ProjectedPanelState['technique']['bodyTraining']): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left == null && right == null;
    }
    return left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext;
}

function clonePendingComprehensions(value: ProjectedPanelState['technique']['pendingComprehensions'], transmissionJob: unknown = null) {
    return (Array.isArray(value) ? value : []).map((entry) => ({
        ...entry,
        activeTransferJob: buildProjectedTransmissionJob(entry, transmissionJob),
    }));
}

function buildProjectedTransmissionJob(entry: unknown, transmissionJob: any = null): TechniqueTransmissionJobState | null {
    const pending = entry as { techId?: string } | null;
    if (!pending || !transmissionJob || transmissionJob.techniqueId !== pending.techId || Number(transmissionJob.remainingTicks) <= 0) {
        return null;
    }
    const waitRemaining = Math.max(0, Math.floor(Number(
        transmissionJob.interruptWaitRemainingTicks
            ?? transmissionJob.interruptState?.waitRemainingTicks
            ?? 0,
    ) || 0));
    const status: TechniqueTransmissionJobState['status'] = transmissionJob.status === 'blocked' ? 'blocked' : 'running';
    return {
        jobId: typeof transmissionJob.jobRunId === 'string' && transmissionJob.jobRunId.trim()
            ? transmissionJob.jobRunId
            : `transmission:${pending.techId}`,
        teacherPlayerId: transmissionJob.teacherPlayerId,
        teacherName: transmissionJob.teacherName,
        startedAtTick: Math.max(0, Math.floor(Number(transmissionJob.startedAt) || 0)),
        status,
        blockedReason: transmissionJob.blockedReason,
        range: Math.max(1, Math.floor(Number(transmissionJob.range) || 2)),
        progressGainPerTick: normalizePositiveProjectionNumber(transmissionJob.progressGainPerTick),
        estimatedRemainingTicks: normalizeNonNegativeProjectionNumber(transmissionJob.estimatedRemainingTicks),
        progressBreakdown: normalizeProgressBreakdown(transmissionJob.progressBreakdown),
        interruptWaitRemainingTicks: waitRemaining,
        interruptState: transmissionJob.interruptState && typeof transmissionJob.interruptState === 'object'
            ? { ...transmissionJob.interruptState }
            : null,
    };
}

function normalizePositiveProjectionNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

function normalizeNonNegativeProjectionNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
}

function normalizeProgressBreakdown(value: unknown): TechniqueTransmissionJobState['progressBreakdown'] | undefined {
    if (!value || typeof value !== 'object') {
        return undefined;
    }
    const source = value as Record<string, unknown>;
    const baseProgress = normalizePositiveProjectionNumber(source.baseProgress);
    const progressGain = normalizePositiveProjectionNumber(source.progressGain);
    const difficultyFactor = normalizePositiveProjectionNumber(source.difficultyFactor);
    const realmFactor = normalizePositiveProjectionNumber(source.realmFactor);
    const learnerTransmissionFactor = normalizePositiveProjectionNumber(source.learnerTransmissionFactor);
    if (
        baseProgress === undefined
        || progressGain === undefined
        || difficultyFactor === undefined
        || realmFactor === undefined
        || learnerTransmissionFactor === undefined
    ) {
        return undefined;
    }
    const teacherTransmissionLevel = normalizePositiveProjectionNumber(source.teacherTransmissionLevel);
    const teacherTransmissionFactor = normalizePositiveProjectionNumber(source.teacherTransmissionFactor);
    return {
        baseProgress,
        progressGain,
        difficultyFactor,
        techniqueRealmLv: Math.max(1, Math.floor(Number(source.techniqueRealmLv) || 1)),
        learnerRealmLv: Math.max(1, Math.floor(Number(source.learnerRealmLv) || 1)),
        learnerTransmissionLevel: Math.max(1, Math.floor(Number(source.learnerTransmissionLevel) || 1)),
        ...(teacherTransmissionLevel === undefined ? {} : { teacherTransmissionLevel }),
        realmFactor,
        learnerTransmissionFactor,
        ...(teacherTransmissionFactor === undefined ? {} : { teacherTransmissionFactor }),
    };
}

function isSamePendingComprehensions(
    left: ProjectedPanelState['technique']['pendingComprehensions'],
    right: ProjectedPanelState['technique']['pendingComprehensions'],
): boolean {
    const leftList = left ?? [];
    const rightList = right ?? [];
    if (leftList.length !== rightList.length) {
        return false;
    }
    for (let index = 0; index < leftList.length; index += 1) {
        const leftEntry = leftList[index];
        const rightEntry = rightList[index];
        if (!leftEntry || !rightEntry
            || leftEntry.techId !== rightEntry.techId
            || leftEntry.progress !== rightEntry.progress
            || leftEntry.requiredProgress !== rightEntry.requiredProgress
            || leftEntry.activeTransferJob?.jobId !== rightEntry.activeTransferJob?.jobId
            || leftEntry.activeTransferJob?.status !== rightEntry.activeTransferJob?.status
            || leftEntry.activeTransferJob?.progressGainPerTick !== rightEntry.activeTransferJob?.progressGainPerTick
            || leftEntry.activeTransferJob?.estimatedRemainingTicks !== rightEntry.activeTransferJob?.estimatedRemainingTicks
            || !isSameProgressBreakdown(leftEntry.activeTransferJob?.progressBreakdown, rightEntry.activeTransferJob?.progressBreakdown)) {
            return false;
        }
    }
    return true;
}

function isSameProgressBreakdown(
    left: TechniqueTransmissionJobState['progressBreakdown'],
    right: TechniqueTransmissionJobState['progressBreakdown'],
): boolean {
    if (!left || !right) {
        return left == null && right == null;
    }
    return left.baseProgress === right.baseProgress
        && left.progressGain === right.progressGain
        && left.difficultyFactor === right.difficultyFactor
        && left.techniqueRealmLv === right.techniqueRealmLv
        && left.learnerRealmLv === right.learnerRealmLv
        && left.learnerTransmissionLevel === right.learnerTransmissionLevel
        && left.teacherTransmissionLevel === right.teacherTransmissionLevel
        && left.realmFactor === right.realmFactor
        && left.learnerTransmissionFactor === right.learnerTransmissionFactor
        && left.teacherTransmissionFactor === right.teacherTransmissionFactor;
}

function buildPanelDeltaFromState(previousPanel: ProjectedPanelState, currentPanel: ProjectedPanelState): S2C_PanelDelta | null {
    const delta: S2C_PanelDelta = {};
    const previousInventory = previousPanel.inventory;
    const currentInventory = currentPanel.inventory;
    const previousEquipment = previousPanel.equipment;
    const currentEquipment = currentPanel.equipment;
    const previousTechnique = previousPanel.technique;
    const currentTechnique = currentPanel.technique;
    const previousAttr = previousPanel.attr;
    const currentAttr = currentPanel.attr;
    const previousAction = previousPanel.action;
    const currentAction = currentPanel.action;
    const previousBuff = previousPanel.buff;
    const currentBuff = currentPanel.buff;
    if (previousInventory.revision !== currentInventory.revision) {
        const slotPatch = diffInventorySlots(previousInventory.items, currentInventory.items);
        delta.inv = {
            r: currentInventory.revision,
            capacity: previousInventory.capacity !== currentInventory.capacity ? currentInventory.capacity : undefined,
            size: previousInventory.items.length !== currentInventory.items.length ? currentInventory.items.length : undefined,
            slots: slotPatch.length > 0 ? slotPatch : undefined,
            cooldowns: currentInventory.cooldowns,
            serverTick: currentInventory.serverTick,
        };
    }
    if (previousEquipment.revision !== currentEquipment.revision) {
        const slotPatch = diffEquipmentSlots(previousEquipment.slots, currentEquipment.slots);
        delta.eq = { r: currentEquipment.revision, slots: slotPatch };
    }
    if (previousTechnique.revision !== currentTechnique.revision) {
        const techniquePatch = diffTechniqueEntries(previousTechnique.techniques, currentTechnique.techniques);
        const removed = diffRemovedTechniqueIds(previousTechnique.techniques, currentTechnique.techniques);
        delta.tech = {
            r: currentTechnique.revision,
            techniques: techniquePatch,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,
            cultivatingTechId: previousTechnique.cultivatingTechId !== currentTechnique.cultivatingTechId
                ? currentTechnique.cultivatingTechId : undefined,
            bodyTraining: previousTechnique.bodyTraining !== currentTechnique.bodyTraining
                ? currentTechnique.bodyTraining : undefined,
        };
    }
    if (previousAttr !== currentAttr) {
        delta.attr = buildAttrDeltaFromState(previousAttr, currentAttr);
    }
    const actionOrderChanged = !isSameActionOrder(previousAction.actions, currentAction.actions);
    if (previousAction.revision !== currentAction.revision) {
        const actionPatch = diffActionEntries(previousAction.actions, currentAction.actions);
        const removedActionIds = diffRemovedActionIds(previousAction.actions, currentAction.actions);
        delta.act = {
            r: currentAction.revision,
            actions: actionPatch,
            removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
            actionOrder: actionOrderChanged ? buildActionOrder(currentAction.actions) : undefined,
        };
    }
    const actionTopLevelChanged = previousAction !== currentAction;
    if (actionTopLevelChanged) {
        const actionDeltaBase = delta.act ?? { r: currentAction.revision };
        delta.act = {
            ...actionDeltaBase,
            actionOrder: buildActionOrder(currentAction.actions),
            autoBattle: currentAction.autoBattle,
            autoUsePills: currentAction.autoUsePills,
            combatTargetingRules: currentAction.combatTargetingRules,
            autoBattleTargetingMode: currentAction.autoBattleTargetingMode,
            retaliatePlayerTargetId: currentAction.retaliatePlayerTargetId,
            combatTargetId: currentAction.combatTargetId,
            combatTargetLocked: currentAction.combatTargetLocked,
            autoRetaliate: currentAction.autoRetaliate,
            autoBattleStationary: currentAction.autoBattleStationary,
            allowAoePlayerHit: currentAction.allowAoePlayerHit,
            autoIdleCultivation: currentAction.autoIdleCultivation,
            autoSwitchCultivation: currentAction.autoSwitchCultivation,
            autoRootFoundation: currentAction.autoRootFoundation,
            cultivationActive: currentAction.cultivationActive,
            senseQiActive: currentAction.senseQiActive,
            wangQiActive: currentAction.wangQiActive,
        };
    }
    if (previousBuff !== currentBuff) {
        const buffPatch = diffBuffEntries(previousBuff.buffs, currentBuff.buffs);
        const removedBuffIds = diffRemovedBuffIds(previousBuff.buffs, currentBuff.buffs);
        delta.buff = {
            r: currentBuff.revision,
            buffs: buffPatch,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}

export {
    buildBootstrapPanelDelta,
    buildFullPanelDelta,
    buildFullPanelDeltaFromState,
    buildFullSelfDelta,
    buildFullSelfDeltaFromState,
    buildFullWorldDelta,
    buildFullWorldDeltaFromState,
    buildMapEnter,
    buildPanelDelta,
    buildPanelUpdate,
    buildSelfDelta,
    capturePlayerState,
    captureSelfState,
    capturePanelState,
    buildPanelCursor,
    buildPanelDeltaFromCursor,
    captureProjectorState,
    captureWorldState,
    combineProjectorState,
    diffContainerEntries,
    diffBuildingEntries,
    diffFormationEntries,
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
};
