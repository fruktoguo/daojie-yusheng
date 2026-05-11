/**
 * 世界投影器核心 helper。
 * 负责将运行时 view 转换为协议 envelope（WorldDelta/SelfDelta/PanelDelta/MapEnter），
 * 包含状态捕获、全量构造和增量 diff 逻辑。
 */

import {
  type AttrBonus,
  type Attributes,
  type MapEnterView,
  type PlayerSpecialStats,
  type S2C_PanelActionDelta,
  type S2C_PanelDelta,
  type SelfDeltaView,
  type TechniqueState,
  type TechniqueUpdateEntryView,
  type WorldBuildingPatchView,
  type WorldContainerPatchView,
  type WorldDeltaView,
  type WorldFormationPatchView,
  type WorldGroundPatchView,
  type WorldMonsterPatchView,
  type WorldNpcPatchView,
  type WorldPlayerPatchView,
  type WorldPortalPatchView,
  calcTechniqueFinalSpecialStatBonus,
  getFirstGrapheme,
} from '@mud/shared';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules } from '../runtime/player/player-combat-config.helpers';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import {
  ATTR_DELTA_PATCH_THRESHOLD,
  type ProjectorViewLike,
  type ProjectorPlayerLike,
  type ProjectorPortalLike,
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
  for (const entry of player.equipment?.slots ?? []) {
    const item = entry?.item;
    if (!item) { continue; }
    result.comprehension = Math.max(0, Math.trunc(Number(result.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(item.equipSpecialStats?.comprehension ?? 0) || 0));
    result.luck = Math.max(0, Math.trunc(Number(result.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(item.equipSpecialStats?.luck ?? 0) || 0));
  }
  return result;
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
    attrCurves: entry.attrCurves,
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

function buildAttrBonuses(player: Pick<ProjectorPlayerLike, 'bonuses'>): AttrBonus[] {
    return Array.isArray(player.bonuses)
        ? player.bonuses.map((entry) => cloneAttrBonus(entry))
        : [];
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
    const players: WorldPlayerPatchView[] = [{
            id: view.playerId,
            n: resolvePlayerRenderLabel(view.self.name, view.self.displayName, view.playerId),
            ch: resolvePlayerRenderChar(view.self.displayName, view.self.name),
            x: view.self.x,
            y: view.self.y,
            sc: resolveBuffPresentationScale(view.self.buffs),
        }, ...Array.from(view.visiblePlayers, (entry) => ({
            id: entry.playerId,
            n: resolvePlayerRenderLabel(entry.name, entry.displayName, entry.playerId),
            ch: resolvePlayerRenderChar(entry.displayName, entry.name),
            x: entry.x,
            y: entry.y,
            sc: resolveBuffPresentationScale(entry.buffs),
        }))];
    const monsters: WorldMonsterPatchView[] = Array.from(view.localMonsters, (entry) => ({
        id: entry.runtimeId,
        mid: entry.monsterId,
        x: entry.x,
        y: entry.y,
        hp: entry.hp,
        maxHp: entry.maxHp,
        qi: entry.qi,
        maxQi: entry.maxQi,
        n: entry.name,
        c: entry.color,
        tr: entry.tier,
    }));
    const npcs: WorldNpcPatchView[] = Array.from(view.localNpcs, (entry) => ({
        id: entry.npcId,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
        sh: entry.hasShop ? 1 : undefined,
        qm: entry.questMarker ?? null,
    }));
    const portals: WorldPortalPatchView[] = Array.from(view.localPortals, (entry) => ({
        id: buildPortalId(entry),
        n: resolvePortalDisplayName(entry, resolveMapName),
        ch: resolvePortalRenderChar(entry),
        x: entry.x,
        y: entry.y,
        tm: entry.targetMapId,
        tr: entry.trigger === 'auto' ? 1 : 0,
        d: entry.direction === 'one_way' ? 1 : 0,
    }));
    const ground: WorldGroundPatchView[] = Array.from(view.localGroundPiles, (entry) => ({
        sourceId: entry.sourceId,
        x: entry.x,
        y: entry.y,
        items: entry.items.map((item) => ({ ...item })),
    }));
    const containers: WorldContainerPatchView[] = Array.from(view.localContainers, (entry) => ({
        id: `container:${entry.id}`,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
        rr: normalizeOptionalNonNegativeInteger(entry.respawnRemainingTicks),
    }));
    const buildings: WorldBuildingPatchView[] = Array.from(view.localBuildings ?? [], (entry) => ({
        id: entry.id,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
        rt: normalizeOptionalNonNegativeInteger(entry.remainingTicks),
        tt: normalizeOptionalNonNegativeInteger(entry.totalTicks),
    }));
    const formations: WorldFormationPatchView[] = Array.from(view.localFormations ?? [], (entry) => ({
        id: entry.id,
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char ?? '◎',
        c: entry.active === false ? '#9aa0a6' : entry.color ?? '#4da3ff',
        ac: entry.active === false ? 0 : 1,
        rs: normalizeOptionalNonNegativeInteger(entry.radius),
        sh: entry.rangeShape,
        hl: entry.rangeHighlightColor,
        bch: entry.boundaryChar,
        bc: entry.boundaryColor,
        bhl: entry.boundaryRangeHighlightColor,
        ev: entry.eyeVisibleWithoutSenseQi === true ? 1 : 0,
        rv: entry.rangeVisibleWithoutSenseQi === true ? 1 : 0,
        bv: entry.boundaryVisibleWithoutSenseQi === true ? 1 : 0,
        tx: entry.showText === false ? 0 : 1,
        bd: entry.blocksBoundary === true ? 1 : 0,
        os: entry.ownerSectId ?? null,
        op: entry.ownerPlayerId ?? null,
        lt: entry.lifecycle === 'persistent' ? 1 : 0,
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

/** 构造全量 SelfDelta：包含玩家自身的位置、HP、MP、经验等核心状态。 */
function buildFullSelfDelta(player: ProjectorPlayerLike): SelfDeltaView {
    return {
        sr: player.selfRevision,
        iid: player.instanceId,
        mid: player.templateId,
        x: player.x,
        y: player.y,
        f: player.facing,
        hp: player.hp,
        maxHp: player.maxHp,
        qi: player.qi,
        maxQi: player.maxQi,
        wallet: cloneWalletState(player.wallet),
    };
}

/** 构造全量 PanelDelta：包含背包、装备、功法、属性、动作和 buff 面板完整状态。 */
function buildFullPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return {
        inv: {
            r: player.inventory.revision,
            full: 1 as const,
            capacity: player.inventory.capacity,
            size: player.inventory.items.length,
            slots: player.inventory.items.map((entry, slotIndex) => ({
                slotIndex,
                item: { ...entry },
            })),
        },
        eq: {
            r: player.equipment.revision,
            full: 1 as const,
            slots: player.equipment.slots.map((entry) => ({
                slot: entry.slot,
                item: entry.item ? { ...entry.item } : null,
            })),
        },
        tech: {
            r: player.techniques.revision,
            full: 1 as const,
            techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
            cultivatingTechId: player.techniques.cultivatingTechId,
            bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        },
        attr: buildFullAttrDelta(player),
        act: buildFullActionDelta(player),
        buff: buildFullBuffDelta(player),
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
    const npcs: Array<[string, ProjectedNpcEntry]> = view.localNpcs.map((entry): [string, ProjectedNpcEntry] => [entry.npcId, {
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, sh: entry.hasShop ? 1 : 0, qm: entry.questMarker ?? null,
    }]);
    const monsters: Array<[string, ProjectedMonsterEntry]> = view.localMonsters.map((entry): [string, ProjectedMonsterEntry] => [entry.runtimeId, {
        mid: entry.monsterId, x: entry.x, y: entry.y, hp: entry.hp, maxHp: entry.maxHp, qi: entry.qi, maxQi: entry.maxQi, n: entry.name, c: entry.color, tr: entry.tier,
    }]);
    const portals: Array<[string, ProjectedPortalEntry]> = view.localPortals.map((entry): [string, ProjectedPortalEntry] => [buildPortalId(entry), {
        n: resolvePortalDisplayName(entry, resolveMapName), ch: resolvePortalRenderChar(entry), x: entry.x, y: entry.y, tm: entry.targetMapId, tr: entry.trigger === 'auto' ? 1 : 0, d: entry.direction === 'one_way' ? 1 : 0,
    }]);
    const groundPiles: Array<[string, ProjectedGroundPileEntry]> = view.localGroundPiles.map((entry): [string, ProjectedGroundPileEntry] => [entry.sourceId, {
        x: entry.x, y: entry.y, items: entry.items.map((item) => ({ ...item })),
    }]);
    const containers: Array<[string, ProjectedContainerEntry]> = view.localContainers.map((entry): [string, ProjectedContainerEntry] => [`container:${entry.id}`, {
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rr: normalizeOptionalNonNegativeInteger(entry.respawnRemainingTicks),
    }]);
    const buildings: Array<[string, ProjectedBuildingEntry]> = (view.localBuildings ?? []).map((entry): [string, ProjectedBuildingEntry] => [entry.id, {
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char, c: entry.color, rt: normalizeOptionalNonNegativeInteger(entry.remainingTicks), tt: normalizeOptionalNonNegativeInteger(entry.totalTicks),
    }]);
    const formations: Array<[string, ProjectedFormationEntry]> = (view.localFormations ?? []).map((entry): [string, ProjectedFormationEntry] => [entry.id, {
        x: entry.x, y: entry.y, n: entry.name, ch: entry.char ?? '◎', c: entry.active === false ? '#9aa0a6' : entry.color ?? '#4da3ff', ac: entry.active === false ? 0 : 1, rs: normalizeOptionalNonNegativeInteger(entry.radius), sh: entry.rangeShape, hl: entry.rangeHighlightColor, bch: entry.boundaryChar, bc: entry.boundaryColor, bhl: entry.boundaryRangeHighlightColor, ev: entry.eyeVisibleWithoutSenseQi === true ? 1 : 0, rv: entry.rangeVisibleWithoutSenseQi === true ? 1 : 0, bv: entry.boundaryVisibleWithoutSenseQi === true ? 1 : 0, tx: entry.showText === false ? 0 : 1, bd: entry.blocksBoundary === true ? 1 : 0, os: entry.ownerSectId ?? null, op: entry.ownerPlayerId ?? null, lt: entry.lifecycle === 'persistent' ? 1 : 0,
    }]);
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

/** 捕获当前帧的玩家自身状态快照，用于后续 self/panel diff。 */
function capturePlayerState(player: ProjectorPlayerLike): PlayerStateSlice {
    return {
        selfRevision: player.selfRevision,
        self: {
            instanceId: player.instanceId,
            templateId: player.templateId,
            x: player.x, y: player.y, f: player.facing,
            hp: player.hp, maxHp: player.maxHp, qi: player.qi, maxQi: player.maxQi,
            wallet: cloneWalletState(player.wallet),
        },
        panel: {
            inventory: captureInventoryPanelSlice(player),
            equipment: captureEquipmentPanelSlice(player),
            technique: captureTechniquePanelSlice(player),
            attr: captureAttrPanelSlice(player),
            action: captureActionPanelSlice(player),
            buff: captureBuffPanelSlice(player),
        },
    };
}

function captureInventoryPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['inventory'] {
    return { revision: player.inventory.revision, capacity: player.inventory.capacity, items: player.inventory.items.map((entry) => ({ ...entry })) };
}

function captureEquipmentPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['equipment'] {
    return { revision: player.equipment.revision, slots: player.equipment.slots.map((entry) => ({ slot: entry.slot, item: entry.item ? { ...entry.item } : null })) };
}

function captureTechniquePanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['technique'] {
    return { revision: player.techniques.revision, techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)), cultivatingTechId: player.techniques.cultivatingTechId, bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null };
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
        specialStats: cloneSpecialStats(resolvePlayerSpecialStats(player)),
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
        panel: playerState.panel,
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
    return {
        r: player.attrs.revision,
        full: 1 as const,
        stage: player.attrs.stage,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: cloneNumericStats(player.attrs.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
        specialStats: cloneSpecialStats(resolvePlayerSpecialStats(player)),
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
    };
}

function buildFullActionDelta(player: ProjectorPlayerLike): S2C_PanelActionDelta {
    return {
        r: player.actions.revision,
        full: 1,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        actionOrder: buildActionOrder(player.actions.actions),
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
    };
}

function buildFullBuffDelta(player: ProjectorPlayerLike): S2C_PanelDelta['buff'] {
    return { r: player.buffs.revision, full: 1, buffs: projectVisiblePlayerBuffs(player) };
}

function buildAttrDelta(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): ProjectedAttrDeltaView {
    const stageChanged = previousAttr.stage !== player.attrs.stage;
    const baseAttrsPatch = diffAttributes(previousAttr.baseAttrs, player.attrs.baseAttrs);
    const nextBonuses = buildAttrBonuses(player);
    const bonusesChanged = !isSameAttrBonuses(previousAttr.bonuses, nextBonuses);
    const finalAttrsPatch = diffAttributes(previousAttr.finalAttrs, player.attrs.finalAttrs);
    const numericStatsPatch = diffNumericStats(previousAttr.numericStats, player.attrs.numericStats);
    const ratioDivisorsPatch = diffRatioDivisors(previousAttr.ratioDivisors, player.attrs.ratioDivisors);
    const nextSpecialStats = resolvePlayerSpecialStats(player);
    const specialStatsChanged = !isSameSpecialStats(previousAttr.specialStats, nextSpecialStats);
    const boneAgeBaseYearsChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears;
    const lifeElapsedTicksChanged = previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks;
    const lifespanYearsChanged = previousAttr.lifespanYears !== player.lifespanYears;
    const realmProgressChanged = previousAttr.realmProgress !== player.realm?.progress;
    const realmProgressToNextChanged = previousAttr.realmProgressToNext !== player.realm?.progressToNext;
    const realmBreakthroughReadyChanged = previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady;
    const alchemySkillChanged = !isSameCraftSkillState(previousAttr.alchemySkill, player.alchemySkill);
    const forgingSkillChanged = !isSameCraftSkillState(previousAttr.forgingSkill, player.forgingSkill);
    const buildingSkillChanged = !isSameCraftSkillState(previousAttr.buildingSkill, player.buildingSkill);
    const gatherSkillChanged = !isSameCraftSkillState(previousAttr.gatherSkill, player.gatherSkill);
    const enhancementSkillChanged = !isSameCraftSkillState(previousAttr.enhancementSkill, player.enhancementSkill);
    const totalChanges = (stageChanged ? 1 : 0)
        + baseAttrsPatch.changes
        + (bonusesChanged ? 1 : 0)
        + finalAttrsPatch.changes
        + numericStatsPatch.changes
        + ratioDivisorsPatch.changes
        + (specialStatsChanged ? 1 : 0)
        + (boneAgeBaseYearsChanged ? 1 : 0)
        + (lifeElapsedTicksChanged ? 1 : 0)
        + (lifespanYearsChanged ? 1 : 0)
        + (realmProgressChanged ? 1 : 0)
        + (realmProgressToNextChanged ? 1 : 0)
        + (realmBreakthroughReadyChanged ? 1 : 0)
        + (alchemySkillChanged ? 1 : 0)
        + (forgingSkillChanged ? 1 : 0)
        + (buildingSkillChanged ? 1 : 0)
        + (gatherSkillChanged ? 1 : 0)
        + (enhancementSkillChanged ? 1 : 0);
    if (totalChanges > ATTR_DELTA_PATCH_THRESHOLD) {
        return buildFullAttrDelta(player);
    }
    return {
        r: player.attrs.revision,
        stage: stageChanged ? player.attrs.stage : undefined,
        baseAttrs: baseAttrsPatch.patch,
        bonuses: bonusesChanged ? nextBonuses : undefined,
        finalAttrs: finalAttrsPatch.patch,
        numericStats: numericStatsPatch.patch,
        ratioDivisors: ratioDivisorsPatch.patch,
        specialStats: specialStatsChanged ? buildSpecialStatsPatch(previousAttr.specialStats, nextSpecialStats) : undefined,
        boneAgeBaseYears: boneAgeBaseYearsChanged ? player.boneAgeBaseYears : undefined,
        lifeElapsedTicks: lifeElapsedTicksChanged ? player.lifeElapsedTicks : undefined,
        lifespanYears: lifespanYearsChanged ? player.lifespanYears : undefined,
        realmProgress: realmProgressChanged ? player.realm?.progress : undefined,
        realmProgressToNext: realmProgressToNextChanged ? player.realm?.progressToNext : undefined,
        realmBreakthroughReady: realmBreakthroughReadyChanged ? player.realm?.breakthroughReady : undefined,
        alchemySkill: alchemySkillChanged ? (player.alchemySkill ? { ...player.alchemySkill } : undefined) : undefined,
        forgingSkill: forgingSkillChanged ? (player.forgingSkill ? { ...player.forgingSkill } : undefined) : undefined,
        buildingSkill: buildingSkillChanged ? (player.buildingSkill ? { ...player.buildingSkill } : undefined) : undefined,
        gatherSkill: gatherSkillChanged ? (player.gatherSkill ? { ...player.gatherSkill } : undefined) : undefined,
        enhancementSkill: enhancementSkillChanged ? (player.enhancementSkill ? { ...player.enhancementSkill } : undefined) : undefined,
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

function buildPanelDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): S2C_PanelDelta | null {
    const delta: S2C_PanelDelta = {};
    const previousInventory = previous.panel.inventory;
    const previousEquipment = previous.panel.equipment;
    const previousTechnique = previous.panel.technique;
    const previousAttr = previous.panel.attr;
    const previousAction = previous.panel.action;
    const previousBuff = previous.panel.buff;
    if (previousInventory.revision !== player.inventory.revision) {
        const slotPatch = diffInventorySlots(previousInventory.items, player.inventory.items);
        delta.inv = {
            r: player.inventory.revision,
            capacity: previousInventory.capacity !== player.inventory.capacity ? player.inventory.capacity : undefined,
            size: previousInventory.items.length !== player.inventory.items.length ? player.inventory.items.length : undefined,
            slots: slotPatch.length > 0 ? slotPatch : undefined,
        };
    }
    if (previousEquipment.revision !== player.equipment.revision) {
        const slotPatch = diffEquipmentSlots(previousEquipment.slots, player.equipment.slots);
        delta.eq = { r: player.equipment.revision, slots: slotPatch };
    }
    if (previousTechnique.revision !== player.techniques.revision) {
        const techniquePatch = diffTechniqueEntries(previousTechnique.techniques, player.techniques.techniques);
        const removed = diffRemovedTechniqueIds(previousTechnique.techniques, player.techniques.techniques);
        delta.tech = {
            r: player.techniques.revision,
            techniques: techniquePatch,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,
            cultivatingTechId: previousTechnique.cultivatingTechId !== player.techniques.cultivatingTechId
                ? player.techniques.cultivatingTechId : undefined,
            bodyTraining: previousTechnique.bodyTraining !== player.bodyTraining
                ? (player.bodyTraining ? { ...player.bodyTraining } : null) : undefined,
        };
    }
    const attrMetaChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears
        || previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks
        || previousAttr.lifespanYears !== player.lifespanYears
        || previousAttr.realmProgress !== player.realm?.progress
        || previousAttr.realmProgressToNext !== player.realm?.progressToNext
        || previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady
        || !isSameCraftSkillState(previousAttr.alchemySkill, player.alchemySkill)
        || !isSameCraftSkillState(previousAttr.forgingSkill, player.forgingSkill)
        || !isSameCraftSkillState(previousAttr.buildingSkill, player.buildingSkill)
        || !isSameCraftSkillState(previousAttr.gatherSkill, player.gatherSkill)
        || !isSameCraftSkillState(previousAttr.enhancementSkill, player.enhancementSkill)
        || !isSameSpecialStats(previousAttr.specialStats, resolvePlayerSpecialStats(player))
        || !isSameAttrBonuses(previousAttr.bonuses, buildAttrBonuses(player));
    if (previousAttr.revision !== player.attrs.revision || attrMetaChanged) {
        delta.attr = buildAttrDelta(previousAttr, player);
    }
    const actionOrderChanged = !isSameActionOrder(previousAction.actions, player.actions.actions);
    if (previousAction.revision !== player.actions.revision) {
        const actionPatch = diffActionEntries(previousAction.actions, player.actions.actions);
        const removedActionIds = diffRemovedActionIds(previousAction.actions, player.actions.actions);
        delta.act = {
            r: player.actions.revision,
            actions: actionPatch,
            removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
            actionOrder: actionOrderChanged ? buildActionOrder(player.actions.actions) : undefined,
        };
    }
    const actionTopLevelChanged = previousAction.autoBattle !== player.combat.autoBattle
        || !isSameAutoUsePillList(previousAction.autoUsePills ?? [], player.combat.autoUsePills ?? [])
        || !isSameCombatTargetingRules(previousAction.combatTargetingRules ?? null, player.combat.combatTargetingRules ?? null)
        || previousAction.autoBattleTargetingMode !== player.combat.autoBattleTargetingMode
        || previousAction.retaliatePlayerTargetId !== player.combat.retaliatePlayerTargetId
        || previousAction.combatTargetId !== player.combat.combatTargetId
        || previousAction.combatTargetLocked !== player.combat.combatTargetLocked
        || previousAction.autoRetaliate !== player.combat.autoRetaliate
        || previousAction.autoBattleStationary !== player.combat.autoBattleStationary
        || previousAction.allowAoePlayerHit !== player.combat.allowAoePlayerHit
        || previousAction.autoIdleCultivation !== player.combat.autoIdleCultivation
        || previousAction.autoSwitchCultivation !== player.combat.autoSwitchCultivation
        || previousAction.autoRootFoundation !== (player.combat.autoRootFoundation === true)
        || previousAction.cultivationActive !== player.combat.cultivationActive
        || previousAction.senseQiActive !== player.combat.senseQiActive
        || previousAction.wangQiActive !== (player.combat.wangQiActive === true);
    if (actionTopLevelChanged) {
        const actionDeltaBase = delta.act ?? { r: player.actions.revision };
        delta.act = {
            ...actionDeltaBase,
            actionOrder: buildActionOrder(player.actions.actions),
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
    const currentBuffs = projectVisiblePlayerBuffs(player);
    if (previousBuff.revision !== player.buffs.revision || !isSameBuffList(previousBuff.buffs, currentBuffs)) {
        const buffPatch = diffBuffEntries(previousBuff.buffs, currentBuffs);
        const removedBuffIds = diffRemovedBuffIds(previousBuff.buffs, currentBuffs);
        delta.buff = {
            r: player.buffs.revision,
            buffs: buffPatch,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}

export {
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
    diffBuildingEntries,
    diffFormationEntries,
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
};
