import { Injectable } from '@nestjs/common';
import {
  type ActionDef,
  type AttrBonus,
  type Attributes,
  type AutoBattleTargetingMode,
  type AutoUsePillConfig,
  type BuffSustainCostDef,
  type BodyTrainingState,
  type CombatTargetingRules,
  type EquipmentBuffDef,
  type EquipmentConditionDef,
  type EquipmentConditionGroup,
  type EquipmentSlotUpdateEntry,
  type InventorySlotUpdateEntry,
  S2C,
  type GroundItemEntryView,
  type InitSessionView,
  type MapEnterView,
  type MonsterTier,
  type S2C_PanelActionDelta,
  type S2C_PanelAttrDelta,
  type S2C_PanelDelta,
  type NumericRatioDivisors,
  type NumericStats,
  type PartialNumericStats,
  type NpcQuestMarker,
  type PlayerSpecialStats,
  type QiProjectionModifier,
  type PlayerWalletState,
  type SelfDeltaView,
  type SkillDef,
  type SkillEffectDef,
  type SkillFormula,
  type SkillMonsterCastDef,
  type SkillTargetingDef,
  type SyncedItemStack,
  type TechniqueAttrCurveSegment,
  type TechniqueAttrCurves,
  type TechniqueLayerDef,
  type TechniqueUpdateEntryView,
  type VisibleBuffState,
  type WorldContainerPatchView,
  type WorldDeltaView,
  type WorldGroundPatchView,
  type WorldMonsterPatchView,
  type WorldNpcPatchView,
  type WorldPlayerPatchView,
  type WorldPortalPatchView,
} from '@mud/shared';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules } from '../runtime/player/player-combat-config.helpers';
const ATTR_DELTA_PATCH_THRESHOLD = 10;
const ATTRIBUTE_KEYS = ['constitution', 'spirit', 'perception', 'talent', 'comprehension', 'luck'] as const;
const NUMERIC_STAT_KEYS = [
    'maxHp',
    'maxQi',
    'physAtk',
    'spellAtk',
    'physDef',
    'spellDef',
    'hit',
    'dodge',
    'crit',
    'antiCrit',
    'critDamage',
    'breakPower',
    'resolvePower',
    'maxQiOutputPerTick',
    'qiRegenRate',
    'hpRegenRate',
    'cooldownSpeed',
    'auraCostReduce',
    'auraPowerRate',
    'playerExpRate',
    'techniqueExpRate',
    'realmExpPerTick',
    'techniqueExpPerTick',
    'lootRate',
    'rareLootRate',
    'viewRange',
    'moveSpeed',
    'extraAggroRate',
    'extraRange',
    'extraArea',
] as const;
const RATIO_DIVISOR_KEYS = [
    'dodge',
    'crit',
    'breakPower',
    'resolvePower',
    'cooldownSpeed',
    'moveSpeed',
] as const;
const ELEMENT_GROUP_KEYS = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
type DirectionLike = NonNullable<SelfDeltaView['f']>;
type LooseRecord = Record<string, unknown>;
type AttributeKey = typeof ATTRIBUTE_KEYS[number];
type NumericStatKey = typeof NUMERIC_STAT_KEYS[number];
type RatioDivisorKey = typeof RATIO_DIVISOR_KEYS[number];
type ElementGroupKey = typeof ELEMENT_GROUP_KEYS[number];
type ProjectedPatchResult<TPatch> = { changes: 0; patch?: undefined } | { changes: number; patch: TPatch };
interface AttrBonusMetaRecord {
    [key: string]: AttrBonusMetaValue;
}
type AttrBonusMetaValue = string | number | boolean | null | AttrBonusMetaRecord | AttrBonusMetaValue[];
interface BindingLike {
  playerId: string;
  sessionId: string;
  resumed?: boolean | null;
}
interface ProjectorInstanceLike {
  instanceId: string;
  templateId: string;
  name: string;
  kind: string;
  width: number;
  height: number;
}
interface ProjectorVisiblePlayerLike {
  playerId: string;
  name: string;
  displayName?: string | null;
  x: number;
  y: number;
}
interface ProjectorNpcLike {
  npcId: string;
  x: number;
  y: number;
  name: string;
  char: string;
  color: string;
  hasShop?: boolean;
  questMarker?: NpcQuestMarker | null;
}
interface ProjectorMonsterLike {
  runtimeId: string;
  monsterId: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  name: string;
  char: string;
  color: string;
  tier?: MonsterTier;
  buffs?: unknown[];
}
interface ProjectorPortalLike {
  x: number;
  y: number;
  kind: string;
  targetMapId?: string | null;
  trigger?: string | null;
}
interface ProjectorGroundPileLike {
  sourceId: string;
  x: number;
  y: number;
  items: GroundItemEntryView[];
}
interface ProjectorContainerLike {
  id: string;
  x: number;
  y: number;
  name: string;
  char: string;
  color: string;
}
interface ProjectorViewLike {
  playerId: string;
  tick: number;
  worldRevision: number;
  selfRevision: number;
  instance: ProjectorInstanceLike;
  self: {
    x: number;
    y: number;
    name: string;
    displayName?: string | null;
  };
  visiblePlayers: ProjectorVisiblePlayerLike[];
  localNpcs: ProjectorNpcLike[];
  localMonsters: ProjectorMonsterLike[];
  localPortals: ProjectorPortalLike[];
  localGroundPiles: ProjectorGroundPileLike[];
  localContainers: ProjectorContainerLike[];
}
interface ProjectedPlayerEntry {
  n: string;
  ch: string;
  x: number;
  y: number;
}
interface ProjectedNpcEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
  sh: 0 | 1;
  qm: NpcQuestMarker | null;
}
interface ProjectedMonsterEntry {
  mid: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  n: string;
  c: string;
  tr?: MonsterTier;
}
interface ProjectedPortalEntry {
  n: string;
  ch: string;
  x: number;
  y: number;
  tm?: string | null;
  tr: 0 | 1;
}
interface ProjectedGroundPileEntry {
  x: number;
  y: number;
  items: GroundItemEntryView[];
}
interface ProjectedContainerEntry {
  x: number;
  y: number;
  n: string;
  ch: string;
  c: string;
}
interface ProjectedSelfState {
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  f: DirectionLike;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  wallet: PlayerWalletState | null;
}
type ProjectedNumericStats = ReturnType<typeof cloneNumericStats>;
type ProjectedRatioDivisors = ReturnType<typeof cloneNumericRatioDivisors>;
type ProjectedActionEntry = ActionDef;
type ProjectedElementGroup = ProjectedNumericStats['elementDamageBonus'];
type ProjectedAttrPatch = NonNullable<S2C_PanelAttrDelta['baseAttrs']>;
type ProjectedNumericStatsPatch = NonNullable<S2C_PanelAttrDelta['numericStats']>;
type ProjectedRatioDivisorsPatch = NonNullable<S2C_PanelAttrDelta['ratioDivisors']>;
interface ProjectorPlayerLike {
  selfRevision: number;
  instanceId: string;
  templateId: string;
  x: number;
  y: number;
  facing: DirectionLike;
  hp: number;
  maxHp: number;
  qi: number;
  maxQi: number;
  foundation: number;
  combatExp: number;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears?: number | null;
  realm?: {
    progress?: number;
    progressToNext?: number;
    breakthroughReady?: boolean;
  } | null;
  inventory: {
    revision: number;
    capacity: number;
    items: SyncedItemStack[];
  };
  wallet?: PlayerWalletState | null;
  equipment: {
    revision: number;
    slots: EquipmentSlotUpdateEntry[];
  };
  techniques: {
    revision: number;
    techniques: TechniqueUpdateEntryView[];
    cultivatingTechId?: string | null;
  };
  bodyTraining?: BodyTrainingState | null;
  attrs: {
    revision: number;
    stage: S2C_PanelAttrDelta['stage'];
    baseAttrs: Attributes;
    finalAttrs: Attributes;
    numericStats: ProjectedNumericStats;
    ratioDivisors: ProjectedRatioDivisors;
  };
  actions: {
    revision: number;
    actions: ProjectedActionEntry[];
  };
  combat: {
    autoBattle: boolean;
    autoUsePills: AutoUsePillConfig[];
    combatTargetingRules?: CombatTargetingRules;
    autoBattleTargetingMode: AutoBattleTargetingMode;
    retaliatePlayerTargetId?: string | null;
    combatTargetId?: string | null;
    combatTargetLocked?: boolean;
    autoRetaliate?: boolean;
    autoBattleStationary?: boolean;
    allowAoePlayerHit?: boolean;
    autoIdleCultivation?: boolean;
    autoSwitchCultivation?: boolean;
    cultivationActive?: boolean;
    senseQiActive?: boolean;
  };
  buffs: {
    revision: number;
    buffs: VisibleBuffState[];
  };
  bonuses?: AttrBonus[];
}
interface ProjectedAttrPanelState {
  revision: number;
  stage: S2C_PanelAttrDelta['stage'];
  baseAttrs: Attributes;
  bonuses: AttrBonus[];
  finalAttrs: Attributes;
  numericStats: ProjectedNumericStats;
  ratioDivisors: ProjectedRatioDivisors;
  specialStats: PlayerSpecialStats;
  boneAgeBaseYears: number;
  lifeElapsedTicks: number;
  lifespanYears?: number | null;
  realmProgress?: number;
  realmProgressToNext?: number;
  realmBreakthroughReady?: boolean;
}
interface ProjectedActionPanelState {
  revision: number;
  actions: ProjectedActionEntry[];
  autoBattle: boolean;
  autoUsePills: AutoUsePillConfig[];
  combatTargetingRules?: CombatTargetingRules;
  autoBattleTargetingMode: AutoBattleTargetingMode;
  retaliatePlayerTargetId?: string | null;
  combatTargetId?: string | null;
  combatTargetLocked?: boolean;
  autoRetaliate?: boolean;
  autoBattleStationary?: boolean;
  allowAoePlayerHit?: boolean;
  autoIdleCultivation?: boolean;
  autoSwitchCultivation?: boolean;
  cultivationActive?: boolean;
  senseQiActive?: boolean;
}
type ProjectedAttrDeltaView = S2C_PanelAttrDelta;
interface ProjectedPanelState {
  inventory: {
    revision: number;
    capacity: number;
    items: SyncedItemStack[];
  };
  equipment: {
    revision: number;
    slots: EquipmentSlotUpdateEntry[];
  };
  technique: {
    revision: number;
    techniques: TechniqueUpdateEntryView[];
    cultivatingTechId?: string | null;
    bodyTraining?: BodyTrainingState | null;
  };
  attr: ProjectedAttrPanelState;
  action: ProjectedActionPanelState;
  buff: {
    revision: number;
    buffs: VisibleBuffState[];
  };
}
interface WorldStateSlice {
  instanceId: string;
  worldRevision: number;
  players: Map<string, ProjectedPlayerEntry>;
  npcs: Map<string, ProjectedNpcEntry>;
  monsters: Map<string, ProjectedMonsterEntry>;
  portals: Map<string, ProjectedPortalEntry>;
  groundPiles: Map<string, ProjectedGroundPileEntry>;
  containers: Map<string, ProjectedContainerEntry>;
}
interface PlayerStateSlice {
  selfRevision: number;
  self: ProjectedSelfState;
  panel: ProjectedPanelState;
}
interface ProjectorState extends WorldStateSlice, PlayerStateSlice {}
interface InitialEnvelope {
  initSession: InitSessionView;
  mapEnter: MapEnterView;
  worldDelta: WorldDeltaView;
  selfDelta: SelfDeltaView;
  panelDelta: S2C_PanelDelta;
}
interface DeltaEnvelope {
  mapEnter?: MapEnterView;
  worldDelta?: WorldDeltaView;
  selfDelta?: SelfDeltaView;
  panelDelta?: S2C_PanelDelta;
}
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
function buildFullWorldDelta(
    view: ProjectorViewLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): WorldDeltaView {
    const players: WorldPlayerPatchView[] = [{
            id: view.playerId,
            n: view.self.displayName ?? view.self.name,
            ch: resolvePlayerRenderChar(view.self.displayName, view.self.name),
            x: view.self.x,
            y: view.self.y,
        }, ...Array.from(view.visiblePlayers, (entry) => ({
            id: entry.playerId,
            n: entry.name,
            ch: resolvePlayerRenderChar(entry.displayName, entry.name),
            x: entry.x,
            y: entry.y,
        }))];
    const monsters: WorldMonsterPatchView[] = Array.from(view.localMonsters, (entry) => ({
        id: entry.runtimeId,
        mid: entry.monsterId,
        x: entry.x,
        y: entry.y,
        hp: entry.hp,
        maxHp: entry.maxHp,
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
        id: buildPortalId(entry.x, entry.y),
        n: resolvePortalDisplayName(entry, resolveMapName),
        ch: entry.kind === 'stairs' ? '梯' : '阵',
        x: entry.x,
        y: entry.y,
        tm: entry.targetMapId,
        tr: entry.trigger === 'auto' ? 1 : 0,
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
    };
}
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
function buildBootstrapPanelDelta(player: ProjectorPlayerLike): S2C_PanelDelta {
    return {
        inv: {
            r: player.inventory.revision,
        },
        eq: {
            r: player.equipment.revision,
            slots: [],
        },
        tech: {
            r: player.techniques.revision,
            techniques: [],
        },
        attr: {
            r: player.attrs.revision,
        },
        act: {
            r: player.actions.revision,
            actions: [],
        },
        buff: {
            r: player.buffs.revision,
        },
    };
}
function captureWorldState(
    view: ProjectorViewLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): WorldStateSlice {
    const players = new Map<string, ProjectedPlayerEntry>();
    const npcs: Array<[string, ProjectedNpcEntry]> = view.localNpcs.map((entry): [string, ProjectedNpcEntry] => [entry.npcId, {
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
        sh: entry.hasShop ? 1 : 0,
        qm: entry.questMarker ?? null,
    }]);
    const monsters: Array<[string, ProjectedMonsterEntry]> = view.localMonsters.map((entry): [string, ProjectedMonsterEntry] => [entry.runtimeId, {
        mid: entry.monsterId,
        x: entry.x,
        y: entry.y,
        hp: entry.hp,
        maxHp: entry.maxHp,
        n: entry.name,
        c: entry.color,
        tr: entry.tier,
    }]);
    const portals: Array<[string, ProjectedPortalEntry]> = view.localPortals.map((entry): [string, ProjectedPortalEntry] => [buildPortalId(entry.x, entry.y), {
        n: resolvePortalDisplayName(entry, resolveMapName),
        ch: entry.kind === 'stairs' ? '梯' : '阵',
        x: entry.x,
        y: entry.y,
        tm: entry.targetMapId,
        tr: entry.trigger === 'auto' ? 1 : 0,
    }]);
    const groundPiles: Array<[string, ProjectedGroundPileEntry]> = view.localGroundPiles.map((entry): [string, ProjectedGroundPileEntry] => [entry.sourceId, {
        x: entry.x,
        y: entry.y,
        items: entry.items.map((item) => ({ ...item })),
    }]);
    const containers: Array<[string, ProjectedContainerEntry]> = view.localContainers.map((entry): [string, ProjectedContainerEntry] => [`container:${entry.id}`, {
        x: entry.x,
        y: entry.y,
        n: entry.name,
        ch: entry.char,
        c: entry.color,
    }]);
    players.set(view.playerId, {
        n: view.self.displayName ?? view.self.name,
        ch: resolvePlayerRenderChar(view.self.displayName, view.self.name),
        x: view.self.x,
        y: view.self.y,
    });
    for (const entry of view.visiblePlayers) {
        players.set(entry.playerId, {
            n: entry.name,
            ch: resolvePlayerRenderChar(entry.displayName, entry.name),
            x: entry.x,
            y: entry.y,
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
    };
}
function capturePlayerState(player: ProjectorPlayerLike): PlayerStateSlice {
    return {
        selfRevision: player.selfRevision,
        self: {
            instanceId: player.instanceId,
            templateId: player.templateId,
            x: player.x,
            y: player.y,
            f: player.facing,
            hp: player.hp,
            maxHp: player.maxHp,
            qi: player.qi,
            maxQi: player.maxQi,
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
    return {
        revision: player.inventory.revision,
        capacity: player.inventory.capacity,
        items: player.inventory.items.map((entry) => ({ ...entry })),
    };
}
function captureEquipmentPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['equipment'] {
    return {
        revision: player.equipment.revision,
        slots: player.equipment.slots.map((entry) => ({
            slot: entry.slot,
            item: entry.item ? { ...entry.item } : null,
        })),
    };
}
function captureTechniquePanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['technique'] {
    return {
        revision: player.techniques.revision,
        techniques: player.techniques.techniques.map((entry) => cloneTechniqueEntry(entry)),
        cultivatingTechId: player.techniques.cultivatingTechId,
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
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
        specialStats: cloneSpecialStats({
            foundation: player.foundation,
            combatExp: player.combatExp,
        }),
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
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
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
    };
}
function captureBuffPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['buff'] {
    return {
        revision: player.buffs.revision,
        buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
    };
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
        specialStats: cloneSpecialStats({
            foundation: player.foundation,
            combatExp: player.combatExp,
        }),
        boneAgeBaseYears: player.boneAgeBaseYears,
        lifeElapsedTicks: player.lifeElapsedTicks,
        lifespanYears: player.lifespanYears,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
    };
}
function buildFullActionDelta(player: ProjectorPlayerLike): S2C_PanelActionDelta {
    return {
        r: player.actions.revision,
        full: 1,
        actions: player.actions.actions.map((entry) => ({ ...entry })),
        actionOrder: player.actions.actions.map((entry) => entry.id),
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
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
    };
}
function buildFullBuffDelta(player: ProjectorPlayerLike): S2C_PanelDelta['buff'] {
    return {
        r: player.buffs.revision,
        full: 1,
        buffs: player.buffs.buffs.map((entry) => cloneVisibleBuff(entry)),
    };
}
function buildAttrDelta(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): ProjectedAttrDeltaView {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const stageChanged = previousAttr.stage !== player.attrs.stage;
    const baseAttrsPatch = diffAttributes(previousAttr.baseAttrs, player.attrs.baseAttrs);
    const nextBonuses = buildAttrBonuses(player);
    const bonusesChanged = !isSameAttrBonuses(previousAttr.bonuses, nextBonuses);
    const finalAttrsPatch = diffAttributes(previousAttr.finalAttrs, player.attrs.finalAttrs);
    const numericStatsPatch = diffNumericStats(previousAttr.numericStats, player.attrs.numericStats);
    const ratioDivisorsPatch = diffRatioDivisors(previousAttr.ratioDivisors, player.attrs.ratioDivisors);
    const nextSpecialStats = {
        foundation: player.foundation,
        combatExp: player.combatExp,
    };
    const specialStatsChanged = !isSameSpecialStats(previousAttr.specialStats, nextSpecialStats);
    const boneAgeBaseYearsChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears;
    const lifeElapsedTicksChanged = previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks;
    const lifespanYearsChanged = previousAttr.lifespanYears !== player.lifespanYears;
    const realmProgressChanged = previousAttr.realmProgress !== player.realm?.progress;
    const realmProgressToNextChanged = previousAttr.realmProgressToNext !== player.realm?.progressToNext;
    const realmBreakthroughReadyChanged = previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady;
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
        + (realmBreakthroughReadyChanged ? 1 : 0);
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
    };
}
function buildSelfDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): SelfDeltaView | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (previous.selfRevision === player.selfRevision) {
        return null;
    }
    const delta: SelfDeltaView = { sr: player.selfRevision };
    if (previous.self.instanceId !== player.instanceId) {
        delta.iid = player.instanceId;
    }
    if (previous.self.templateId !== player.templateId) {
        delta.mid = player.templateId;
    }
    if (previous.self.f !== player.facing) {
        delta.f = player.facing;
    }
    if (previous.self.hp !== player.hp) {
        delta.hp = player.hp;
    }
    if (previous.self.maxHp !== player.maxHp) {
        delta.maxHp = player.maxHp;
    }
    if (previous.self.qi !== player.qi) {
        delta.qi = player.qi;
    }
    if (previous.self.maxQi !== player.maxQi) {
        delta.maxQi = player.maxQi;
    }
    if (!isSameWalletState(previous.self.wallet, player.wallet)) {
        delta.wallet = cloneWalletState(player.wallet);
    }
    return delta;
}
function buildPanelDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): S2C_PanelDelta | null {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
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
        delta.eq = {
            r: player.equipment.revision,
            slots: slotPatch,
        };
    }
    if (previousTechnique.revision !== player.techniques.revision) {
        const techniquePatch = diffTechniqueEntries(previousTechnique.techniques, player.techniques.techniques);
        const removed = diffRemovedTechniqueIds(previousTechnique.techniques, player.techniques.techniques);
        delta.tech = {
            r: player.techniques.revision,
            techniques: techniquePatch,
            removeTechniqueIds: removed.length > 0 ? removed : undefined,
            cultivatingTechId: previousTechnique.cultivatingTechId !== player.techniques.cultivatingTechId
                ? player.techniques.cultivatingTechId
                : undefined,
            bodyTraining: previousTechnique.bodyTraining !== player.bodyTraining
                ? (player.bodyTraining ? { ...player.bodyTraining } : null)
                : undefined,
        };
    }
    const attrMetaChanged = previousAttr.boneAgeBaseYears !== player.boneAgeBaseYears
        || previousAttr.lifeElapsedTicks !== player.lifeElapsedTicks
        || previousAttr.lifespanYears !== player.lifespanYears
        || previousAttr.realmProgress !== player.realm?.progress
        || previousAttr.realmProgressToNext !== player.realm?.progressToNext
        || previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady
        || !isSameSpecialStats(previousAttr.specialStats, {
            foundation: player.foundation,
            combatExp: player.combatExp,
        })
        || !isSameAttrBonuses(previousAttr.bonuses, buildAttrBonuses(player));
    if (previousAttr.revision !== player.attrs.revision || attrMetaChanged) {
        delta.attr = buildAttrDelta(previousAttr, player);
    }
    if (previousAction.revision !== player.actions.revision) {
        const actionPatch = diffActionEntries(previousAction.actions, player.actions.actions);
        const removedActionIds = diffRemovedActionIds(previousAction.actions, player.actions.actions);
        delta.act = {
            r: player.actions.revision,
            actions: actionPatch,
            removeActionIds: removedActionIds.length > 0 ? removedActionIds : undefined,
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
        || previousAction.cultivationActive !== player.combat.cultivationActive
        || previousAction.senseQiActive !== player.combat.senseQiActive;
    if (actionTopLevelChanged) {
        const actionDeltaBase = delta.act ?? { r: player.actions.revision };
        delta.act = {
            ...actionDeltaBase,
            actionOrder: player.actions.actions.map((entry) => entry.id),
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
            cultivationActive: player.combat.cultivationActive,
            senseQiActive: player.combat.senseQiActive,
        };
    }
    if (previousBuff.revision !== player.buffs.revision) {
        const buffPatch = diffBuffEntries(previousBuff.buffs, player.buffs.buffs);
        const removedBuffIds = diffRemovedBuffIds(previousBuff.buffs, player.buffs.buffs);
        delta.buff = {
            r: player.buffs.revision,
            buffs: buffPatch,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}
function diffPlayerEntries(previous: Map<string, ProjectedPlayerEntry>, current: Map<string, ProjectedPlayerEntry>): WorldPlayerPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldPlayerPatchView[] = [];
    for (const [playerId, entry] of current) {
        const prev = previous.get(playerId);
        if (!prev) {
            result.push({ id: playerId, n: entry.n, ch: entry.ch, x: entry.x, y: entry.y });
            continue;
        }
        const delta: WorldPlayerPatchView = { id: playerId };
        let changed = false;
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const playerId of previous.keys()) {
        if (!current.has(playerId)) {
            result.push({ id: playerId, rm: 1 });
        }
    }
    return result;
}
function diffNpcEntries(previous: Map<string, ProjectedNpcEntry>, current: Map<string, ProjectedNpcEntry>): WorldNpcPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldNpcPatchView[] = [];
    for (const [npcId, entry] of current) {
        const prev = previous.get(npcId);
        if (!prev) {
            result.push({
                id: npcId,
                x: entry.x,
                y: entry.y,
                n: entry.n,
                ch: entry.ch,
                c: entry.c,
                sh: entry.sh === 1 ? 1 : undefined,
                qm: entry.qm,
            });
            continue;
        }
        const delta: WorldNpcPatchView = { id: npcId };
        let changed = false;
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (prev.sh !== entry.sh) {
            delta.sh = entry.sh === 1 ? 1 : undefined;
            changed = true;
        }
        if (!isSameNpcQuestMarker(prev.qm, entry.qm)) {
            delta.qm = entry.qm;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const npcId of previous.keys()) {
        if (!current.has(npcId)) {
            result.push({ id: npcId, rm: 1 });
        }
    }
    return result;
}
function isSameNpcQuestMarker(left: NpcQuestMarker | null | undefined, right: NpcQuestMarker | null | undefined) {
    return left?.line === right?.line && left?.state === right?.state;
}
function diffPortalEntries(previous: Map<string, ProjectedPortalEntry>, current: Map<string, ProjectedPortalEntry>): WorldPortalPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldPortalPatchView[] = [];
    for (const [portalId, entry] of current) {
        const prev = previous.get(portalId);
        if (!prev) {
            result.push({ id: portalId, n: entry.n, ch: entry.ch, x: entry.x, y: entry.y, tm: entry.tm, tr: entry.tr });
            continue;
        }
        const delta: WorldPortalPatchView = { id: portalId };
        let changed = false;
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.tm !== entry.tm) {
            delta.tm = entry.tm;
            changed = true;
        }
        if (prev.tr !== entry.tr) {
            delta.tr = entry.tr;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const portalId of previous.keys()) {
        if (!current.has(portalId)) {
            result.push({ id: portalId, rm: 1 });
        }
    }
    return result;
}
function diffMonsterEntries(previous: Map<string, ProjectedMonsterEntry>, current: Map<string, ProjectedMonsterEntry>): WorldMonsterPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldMonsterPatchView[] = [];
    for (const [runtimeId, entry] of current) {
        const prev = previous.get(runtimeId);
        if (!prev) {
            result.push({
                id: runtimeId,
                mid: entry.mid,
                x: entry.x,
                y: entry.y,
                hp: entry.hp,
                maxHp: entry.maxHp,
                n: entry.n,
                c: entry.c,
                tr: entry.tr,
            });
            continue;
        }
        const delta: WorldMonsterPatchView = { id: runtimeId };
        let changed = false;
        if (prev.mid !== entry.mid) {
            delta.mid = entry.mid;
            changed = true;
        }
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.hp !== entry.hp) {
            delta.hp = entry.hp;
            changed = true;
        }
        if (prev.maxHp !== entry.maxHp) {
            delta.maxHp = entry.maxHp;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (prev.tr !== entry.tr) {
            delta.tr = entry.tr;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const runtimeId of previous.keys()) {
        if (!current.has(runtimeId)) {
            result.push({ id: runtimeId, rm: 1 });
        }
    }
    return result;
}
function diffGroundPiles(previous: Map<string, ProjectedGroundPileEntry>, current: Map<string, ProjectedGroundPileEntry>): WorldGroundPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldGroundPatchView[] = [];
    for (const [sourceId, entry] of current) {
        const prev = previous.get(sourceId);
        if (!isSameGroundPile(prev ?? null, entry)) {
            result.push({
                sourceId,
                x: entry.x,
                y: entry.y,
                items: entry.items.map((item) => ({ ...item })),
            });
        }
    }
    for (const [sourceId, entry] of previous) {
        if (!current.has(sourceId)) {
            result.push({
                sourceId,
                x: entry.x,
                y: entry.y,
                items: null,
            });
        }
    }
    return result;
}
function diffContainerEntries(previous: Map<string, ProjectedContainerEntry>, current: Map<string, ProjectedContainerEntry>): WorldContainerPatchView[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const result: WorldContainerPatchView[] = [];
    for (const [containerId, entry] of current) {
        const prev = previous.get(containerId);
        if (!prev) {
            result.push({
                id: containerId,
                x: entry.x,
                y: entry.y,
                n: entry.n,
                ch: entry.ch,
                c: entry.c,
            });
            continue;
        }
        const delta: WorldContainerPatchView = { id: containerId };
        let changed = false;
        if (prev.x !== entry.x) {
            delta.x = entry.x;
            changed = true;
        }
        if (prev.y !== entry.y) {
            delta.y = entry.y;
            changed = true;
        }
        if (prev.n !== entry.n) {
            delta.n = entry.n;
            changed = true;
        }
        if (prev.ch !== entry.ch) {
            delta.ch = entry.ch;
            changed = true;
        }
        if (prev.c !== entry.c) {
            delta.c = entry.c;
            changed = true;
        }
        if (changed) {
            result.push(delta);
        }
    }
    for (const containerId of previous.keys()) {
        if (!current.has(containerId)) {
            result.push({ id: containerId, rm: 1 });
        }
    }
    return result;
}
function diffInventorySlots(previous: SyncedItemStack[], current: SyncedItemStack[]): InventorySlotUpdateEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: InventorySlotUpdateEntry[] = [];
    const maxLength = Math.max(previous.length, current.length);
    for (let index = 0; index < maxLength; index += 1) {
        const prev = previous[index] ?? null;
        const next = current[index] ?? null;
        if (!isSameItem(prev, next)) {
            patch.push({
                slotIndex: index,
                item: next ? cloneSyncedItemStack(next) : null,
            });
        }
    }
    return patch;
}
function diffEquipmentSlots(previous: EquipmentSlotUpdateEntry[], current: EquipmentSlotUpdateEntry[]): EquipmentSlotUpdateEntry[] {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: EquipmentSlotUpdateEntry[] = [];
    const previousBySlot = new Map(previous.map((entry) => [entry.slot, entry]));
    for (const entry of current) {
        const prev = previousBySlot.get(entry.slot);
        if (!prev || !isSameItem(prev.item ?? null, entry.item ?? null)) {
            patch.push({
                slot: entry.slot,
                item: entry.item ? cloneSyncedItemStack(entry.item) : null,
            });
        }
    }
    return patch;
}
function diffTechniqueEntries(previous: TechniqueUpdateEntryView[], current: TechniqueUpdateEntryView[]): TechniqueUpdateEntryView[] {
    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    return current
        .filter((entry) => !isSameTechniqueEntry(previousById.get(entry.techId) ?? null, entry))
        .map((entry) => cloneTechniqueEntry(entry));
}
function diffRemovedTechniqueIds(previous: TechniqueUpdateEntryView[], current: TechniqueUpdateEntryView[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.techId));
    return previous
        .map((entry) => entry.techId)
        .filter((techId) => !currentIds.has(techId));
}
function diffActionEntries(previous: ProjectedActionEntry[], current: ProjectedActionEntry[]): ProjectedActionEntry[] {
    const previousById = new Map(previous.map((entry) => [entry.id, entry]));
    return current
        .filter((entry) => !isSameActionEntry(previousById.get(entry.id) ?? null, entry))
        .map((entry) => ({ ...entry }));
}
function diffRemovedActionIds(previous: ProjectedActionEntry[], current: ProjectedActionEntry[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.id));
    return previous
        .map((entry) => entry.id)
        .filter((actionId) => !currentIds.has(actionId));
}
function diffBuffEntries(previous: VisibleBuffState[], current: VisibleBuffState[]): VisibleBuffState[] {
    const previousById = new Map(previous.map((entry) => [entry.buffId, entry]));
    return current
        .filter((entry) => !isSameBuffEntry(previousById.get(entry.buffId) ?? null, entry))
        .map((entry) => cloneVisibleBuff(entry));
}
function diffRemovedBuffIds(previous: VisibleBuffState[], current: VisibleBuffState[]): string[] {
    const currentIds = new Set(current.map((entry) => entry.buffId));
    return previous
        .map((entry) => entry.buffId)
        .filter((buffId) => !currentIds.has(buffId));
}
function diffAttributes(previous: Attributes, current: Attributes): ProjectedPatchResult<ProjectedAttrPatch> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: ProjectedAttrPatch = {};
    let changes = 0;
    for (const key of ATTRIBUTE_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
function diffNumericStats(previous: ProjectedNumericStats, current: ProjectedNumericStats): ProjectedPatchResult<ProjectedNumericStatsPatch> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: ProjectedNumericStatsPatch = {};
    let changes = 0;
    for (const key of NUMERIC_STAT_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    const elementDamageBonusPatch = diffElementGroup(previous.elementDamageBonus, current.elementDamageBonus);
    if (elementDamageBonusPatch.changes > 0) {
        patch.elementDamageBonus = elementDamageBonusPatch.patch;
        changes += elementDamageBonusPatch.changes;
    }
    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
function diffRatioDivisors(previous: ProjectedRatioDivisors, current: ProjectedRatioDivisors): ProjectedPatchResult<ProjectedRatioDivisorsPatch> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: ProjectedRatioDivisorsPatch = {};
    let changes = 0;
    for (const key of RATIO_DIVISOR_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    const elementDamageReducePatch = diffElementGroup(previous.elementDamageReduce, current.elementDamageReduce);
    if (elementDamageReducePatch.changes > 0) {
        patch.elementDamageReduce = elementDamageReducePatch.patch;
        changes += elementDamageReducePatch.changes;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
function diffElementGroup(
    previous: ProjectedElementGroup,
    current: ProjectedElementGroup,
): ProjectedPatchResult<Partial<Pick<ProjectedElementGroup, ElementGroupKey>>> {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    const patch: Partial<Pick<ProjectedElementGroup, ElementGroupKey>> = {};
    let changes = 0;
    for (const key of ELEMENT_GROUP_KEYS) {
        if (previous[key] === current[key]) {
            continue;
        }
        patch[key] = current[key];
        changes += 1;
    }
    return changes > 0 ? { patch, changes } : { changes: 0 };
}
function isSameItem(left: SyncedItemStack | null | undefined, right: SyncedItemStack | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemId === right.itemId
        && left.count === right.count
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.groundLabel === right.groundLabel
        && left.grade === right.grade
        && left.level === right.level
        && left.equipSlot === right.equipSlot
        && isSameAttributes(left.equipAttrs, right.equipAttrs)
        && isSamePartialNumericStats(left.equipStats, right.equipStats)
        && isSamePartialNumericStats(left.equipValueStats, right.equipValueStats)
        && isSameEquipmentEffectList(left.effects, right.effects)
        && left.healAmount === right.healAmount
        && left.healPercent === right.healPercent
        && left.qiPercent === right.qiPercent
        && isSameConsumableBuffList(left.consumeBuffs, right.consumeBuffs)
        && isSameStringList(left.tags, right.tags)
        && left.mapUnlockId === right.mapUnlockId
        && isSameStringList(left.mapUnlockIds, right.mapUnlockIds)
        && left.tileAuraGainAmount === right.tileAuraGainAmount
        && isSameTileResourceGainList(left.tileResourceGains, right.tileResourceGains)
        && left.enhancementSuccessRate === right.enhancementSuccessRate
        && left.enhancementSpeedRate === right.enhancementSpeedRate
        && left.allowBatchUse === right.allowBatchUse;
}
function cloneSyncedItemStack(source: SyncedItemStack): SyncedItemStack {
    return {
        ...source,
        equipAttrs: source.equipAttrs ? clonePartialAttributes(source.equipAttrs) : undefined,
        equipStats: clonePartialNumericStats(source.equipStats),
        equipValueStats: clonePartialNumericStats(source.equipValueStats),
        effects: source.effects?.map((entry) => cloneEquipmentEffectDef(entry)),
        consumeBuffs: source.consumeBuffs?.map((entry) => cloneConsumableBuffDef(entry)),
        tags: source.tags?.slice(),
        mapUnlockIds: source.mapUnlockIds?.slice(),
        tileResourceGains: source.tileResourceGains?.map((entry) => ({ ...entry })),
    };
}
function isSameTileResourceGainList(
    left: SyncedItemStack['tileResourceGains'],
    right: SyncedItemStack['tileResourceGains'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index]?.resourceKey !== right[index]?.resourceKey || left[index]?.amount !== right[index]?.amount) {
            return false;
        }
    }
    return true;
}
function cloneEquipmentEffectDef(source: NonNullable<SyncedItemStack['effects']>[number]) {
    switch (source.type) {
        case 'stat_aura':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
                stats: clonePartialNumericStats(source.stats),
                qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
                valueStats: clonePartialNumericStats(source.valueStats),
            };
        case 'progress_boost':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
                stats: clonePartialNumericStats(source.stats),
                qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
                valueStats: clonePartialNumericStats(source.valueStats),
            };
        case 'periodic_cost':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
            };
        case 'timed_buff':
            return {
                ...source,
                conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
                buff: cloneEquipmentBuffDef(source.buff),
            };
    }
}
function cloneConsumableBuffDef(source: NonNullable<SyncedItemStack['consumeBuffs']>[number]) {
    return {
        ...source,
        attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
        valueStats: clonePartialNumericStats(source.valueStats),
        sustainCost: source.sustainCost ? cloneBuffSustainCostDef(source.sustainCost) : undefined,
    };
}
function cloneEquipmentConditionGroup(source: EquipmentConditionGroup): EquipmentConditionGroup {
    return {
        mode: source.mode,
        items: source.items.map((entry) => cloneEquipmentConditionDef(entry)),
    };
}
function cloneEquipmentConditionDef(source: EquipmentConditionDef): EquipmentConditionDef {
    switch (source.type) {
        case 'time_segment':
            return { type: source.type, in: source.in.slice() };
        case 'map':
            return { type: source.type, mapIds: source.mapIds.slice() };
        case 'target_kind':
            return { type: source.type, in: source.in.slice() };
        case 'hp_ratio':
        case 'qi_ratio':
            return { type: source.type, op: source.op, value: source.value };
        case 'is_cultivating':
            return { type: source.type, value: source.value };
        case 'has_buff':
            return { type: source.type, buffId: source.buffId, minStacks: source.minStacks };
    }
}
function cloneEquipmentBuffDef(source: EquipmentBuffDef): EquipmentBuffDef {
    return {
        ...source,
        attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
        valueStats: clonePartialNumericStats(source.valueStats),
    };
}
function cloneBuffSustainCostDef(source: BuffSustainCostDef): BuffSustainCostDef {
    return {
        resource: source.resource,
        baseCost: source.baseCost,
        growthRate: source.growthRate,
    };
}
function cloneTechniqueEntry(source: TechniqueUpdateEntryView): TechniqueUpdateEntryView {
    return {
        ...source,
        skillsEnabled: source.skillsEnabled !== false,
        skills: source.skills?.map((entry) => cloneSkillDef(entry)),
        layers: source.layers?.map((entry) => cloneTechniqueLayerDef(entry)),
        attrCurves: source.attrCurves ? cloneTechniqueAttrCurves(source.attrCurves) : undefined,
    };
}
function cloneSkillDef(source: SkillDef): SkillDef {
    return {
        ...source,
        targeting: source.targeting ? cloneSkillTargetingDef(source.targeting) : undefined,
        effects: source.effects.map((entry) => cloneSkillEffectDef(entry)),
        monsterCast: source.monsterCast ? cloneSkillMonsterCastDef(source.monsterCast) : undefined,
    };
}
function cloneSkillTargetingDef(source: SkillTargetingDef): SkillTargetingDef {
    return { ...source };
}
function cloneSkillEffectDef(source: SkillEffectDef): SkillEffectDef {
    switch (source.type) {
        case 'damage':
            return {
                ...source,
                formula: cloneSkillFormula(source.formula),
            };
        case 'heal':
            return {
                ...source,
                formula: cloneSkillFormula(source.formula),
            };
        case 'buff':
            return {
                ...source,
                attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
                stats: clonePartialNumericStats(source.stats),
                qiProjection: source.qiProjection?.map((entry) => cloneQiProjectionModifier(entry)),
                valueStats: clonePartialNumericStats(source.valueStats),
                sustainCost: source.sustainCost ? cloneBuffSustainCostDef(source.sustainCost) : undefined,
            };
        case 'cleanse':
            return { ...source };
    }
}
function cloneSkillFormula(source: SkillFormula): SkillFormula {
    if (typeof source === 'number') {
        return source;
    }
    if ('var' in source) {
        return {
            var: source.var,
            scale: source.scale,
        };
    }
    if (source.op === 'clamp') {
        return {
            op: source.op,
            value: cloneSkillFormula(source.value),
            min: source.min !== undefined ? cloneSkillFormula(source.min) : undefined,
            max: source.max !== undefined ? cloneSkillFormula(source.max) : undefined,
        };
    }
    return {
        op: source.op,
        args: source.args.map((entry) => cloneSkillFormula(entry)),
    };
}
function cloneSkillMonsterCastDef(source: SkillMonsterCastDef): SkillMonsterCastDef {
    return {
        ...source,
        conditions: source.conditions ? cloneEquipmentConditionGroup(source.conditions) : undefined,
    };
}
function cloneTechniqueLayerDef(source: TechniqueLayerDef): TechniqueLayerDef {
    return {
        level: source.level,
        expToNext: source.expToNext,
        attrs: source.attrs ? clonePartialAttributes(source.attrs) : undefined,
    };
}
function cloneTechniqueAttrCurves(source: TechniqueAttrCurves): TechniqueAttrCurves {
    const clone: TechniqueAttrCurves = {};
    for (const key of ATTRIBUTE_KEYS) {
        const segments = source[key];
        if (segments) {
            clone[key] = cloneTechniqueAttrCurveSegmentList(segments);
        }
    }
    return clone;
}
function cloneTechniqueAttrCurveSegmentList(source: TechniqueAttrCurveSegment[]): TechniqueAttrCurveSegment[] {
    return source.map((entry) => ({
        startLevel: entry.startLevel,
        endLevel: entry.endLevel,
        gainPerLevel: entry.gainPerLevel,
    }));
}
function isSameTechniqueEntry(left: TechniqueUpdateEntryView | null | undefined, right: TechniqueUpdateEntryView | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.techId === right.techId
        && left.level === right.level
        && left.exp === right.exp
        && left.expToNext === right.expToNext
        && left.realmLv === right.realmLv
        && left.realm === right.realm
        && (left.skillsEnabled !== false) === (right.skillsEnabled !== false)
        && left.name === right.name
        && left.grade === right.grade
        && left.category === right.category
        && isSameTechniqueSkillList(left.skills, right.skills)
        && isSameTechniqueLayerList(left.layers, right.layers)
        && isSameTechniqueAttrCurves(left.attrCurves, right.attrCurves);
}
function isSameActionEntry(left: ProjectedActionEntry | null | undefined, right: ProjectedActionEntry | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.type === right.type
        && left.desc === right.desc
        && left.cooldownLeft === right.cooldownLeft
        && left.range === right.range
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && left.autoBattleEnabled === right.autoBattleEnabled
        && left.autoBattleOrder === right.autoBattleOrder
        && left.skillEnabled === right.skillEnabled;
}
function isSameBuffEntry(left: VisibleBuffState | null | undefined, right: VisibleBuffState | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.remainingTicks === right.remainingTicks
        && left.duration === right.duration
        && left.stacks === right.stacks
        && left.maxStacks === right.maxStacks
        && left.sourceSkillId === right.sourceSkillId
        && left.sourceSkillName === right.sourceSkillName
        && left.color === right.color
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection);
}
function isSameGroundPile(left: ProjectedGroundPileEntry | null | undefined, right: ProjectedGroundPileEntry | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    if (left.x !== right.x || left.y !== right.y || left.items.length !== right.items.length) {
        return false;
    }
    for (let index = 0; index < left.items.length; index += 1) {
        if (!isSameGroundItemEntry(left.items[index] ?? null, right.items[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameGroundItemEntry(left: GroundItemEntryView | null | undefined, right: GroundItemEntryView | null | undefined) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.itemKey === right.itemKey
        && left.itemId === right.itemId
        && left.name === right.name
        && left.type === right.type
        && left.count === right.count
        && left.grade === right.grade
        && left.groundLabel === right.groundLabel;
}
function isSameStringList(left: readonly string[] | null | undefined, right: readonly string[] | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (left[index] !== right[index]) {
            return false;
        }
    }
    return true;
}
function isSameEquipmentEffectList(
    left: SyncedItemStack['effects'],
    right: SyncedItemStack['effects'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameEquipmentEffectDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameEquipmentEffectDef(
    left: NonNullable<SyncedItemStack['effects']>[number] | null | undefined,
    right: NonNullable<SyncedItemStack['effects']>[number] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type || left.effectId !== right.effectId) {
        return false;
    }
    switch (left.type) {
        case 'stat_aura':
            return right.type === 'stat_aura'
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats)
                && left.presentationScale === right.presentationScale;
        case 'progress_boost':
            return right.type === 'progress_boost'
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats);
        case 'periodic_cost':
            return right.type === 'periodic_cost'
                && left.trigger === right.trigger
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && left.resource === right.resource
                && left.mode === right.mode
                && left.value === right.value
                && left.minRemain === right.minRemain;
        case 'timed_buff':
            return right.type === 'timed_buff'
                && left.trigger === right.trigger
                && left.target === right.target
                && left.cooldown === right.cooldown
                && left.chance === right.chance
                && isSameEquipmentConditionGroup(left.conditions, right.conditions)
                && isSameEquipmentBuffDef(left.buff, right.buff);
    }
}
function isSameEquipmentConditionGroup(left: EquipmentConditionGroup | null | undefined, right: EquipmentConditionGroup | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.mode === right.mode
        && isSameEquipmentConditionList(left.items, right.items);
}
function isSameEquipmentConditionList(left: EquipmentConditionDef[], right: EquipmentConditionDef[]) {
    if (left === right) {
        return true;
    }
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameEquipmentConditionDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameEquipmentConditionDef(left: EquipmentConditionDef | null | undefined, right: EquipmentConditionDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type) {
        return false;
    }
    switch (left.type) {
        case 'time_segment':
            return right.type === 'time_segment' && isSameStringList(left.in, right.in);
        case 'map':
            return right.type === 'map' && isSameStringList(left.mapIds, right.mapIds);
        case 'target_kind':
            return right.type === 'target_kind' && isSameStringList(left.in, right.in);
        case 'hp_ratio':
        case 'qi_ratio':
            return right.type === left.type && left.op === right.op && left.value === right.value;
        case 'is_cultivating':
            return right.type === 'is_cultivating' && left.value === right.value;
        case 'has_buff':
            return right.type === 'has_buff' && left.buffId === right.buffId && left.minStacks === right.minStacks;
    }
}
function isSameEquipmentBuffDef(left: EquipmentBuffDef | null | undefined, right: EquipmentBuffDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.color === right.color
        && left.duration === right.duration
        && left.stacks === right.stacks
        && left.maxStacks === right.maxStacks
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
        && isSamePartialNumericStats(left.valueStats, right.valueStats)
        && left.presentationScale === right.presentationScale;
}
function isSameConsumableBuffList(
    left: SyncedItemStack['consumeBuffs'],
    right: SyncedItemStack['consumeBuffs'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameConsumableBuffDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameConsumableBuffDef(
    left: NonNullable<SyncedItemStack['consumeBuffs']>[number] | null | undefined,
    right: NonNullable<SyncedItemStack['consumeBuffs']>[number] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.buffId === right.buffId
        && left.name === right.name
        && left.desc === right.desc
        && left.shortMark === right.shortMark
        && left.category === right.category
        && left.visibility === right.visibility
        && left.color === right.color
        && left.duration === right.duration
        && left.maxStacks === right.maxStacks
        && isSameAttributes(left.attrs, right.attrs)
        && isSamePartialNumericStats(left.stats, right.stats)
        && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
        && isSamePartialNumericStats(left.valueStats, right.valueStats)
        && left.presentationScale === right.presentationScale
        && isSameBuffSustainCostDef(left.sustainCost, right.sustainCost)
        && left.infiniteDuration === right.infiniteDuration
        && left.expireWithBuffId === right.expireWithBuffId
        && left.sourceSkillId === right.sourceSkillId;
}
function isSameBuffSustainCostDef(left: BuffSustainCostDef | null | undefined, right: BuffSustainCostDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.resource === right.resource
        && left.baseCost === right.baseCost
        && left.growthRate === right.growthRate;
}
function cloneAttributes(source: Attributes) {
    return {
        constitution: source.constitution,
        spirit: source.spirit,
        perception: source.perception,
        talent: source.talent,
        comprehension: source.comprehension,
        luck: source.luck,
    };
}
function clonePartialAttributes(source: Partial<Attributes>): Partial<Attributes> {
    const clone: Partial<Attributes> = {};
    for (const key of ATTRIBUTE_KEYS) {
        if (source[key] !== undefined) {
            clone[key] = source[key];
        }
    }
    return clone;
}
function buildAttrBonuses(player: Pick<ProjectorPlayerLike, 'bonuses'>): AttrBonus[] {
    return Array.isArray(player.bonuses)
        ? player.bonuses.map((entry) => cloneAttrBonus(entry))
        : [];
}
function cloneSpecialStats(source: PlayerSpecialStats): PlayerSpecialStats {
    return {
        foundation: source.foundation,
        combatExp: source.combatExp,
    };
}
function cloneWalletState(source: PlayerWalletState | null | undefined): PlayerWalletState | null {
    if (!source || !Array.isArray(source.balances)) {
        return null;
    }
    return {
        balances: source.balances
            .map((entry) => ({
            walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
            balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
            frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
            version: Math.max(1, Math.trunc(Number(entry?.version ?? 1))),
        }))
            .filter((entry) => entry.walletType),
    };
}
function isSameWalletState(left: PlayerWalletState | null | undefined, right: PlayerWalletState | null | undefined): boolean {
    const leftBalances = Array.isArray(left?.balances) ? left.balances : [];
    const rightBalances = Array.isArray(right?.balances) ? right.balances : [];
    if (leftBalances.length !== rightBalances.length) {
        return false;
    }
    for (let index = 0; index < leftBalances.length; index += 1) {
        const leftEntry = leftBalances[index];
        const rightEntry = rightBalances[index];
        if (!leftEntry || !rightEntry) {
            return false;
        }
        if (leftEntry.walletType !== rightEntry.walletType
            || Number(leftEntry.balance ?? 0) !== Number(rightEntry.balance ?? 0)
            || Number(leftEntry.frozenBalance ?? 0) !== Number(rightEntry.frozenBalance ?? 0)
            || Number(leftEntry.version ?? 0) !== Number(rightEntry.version ?? 0)) {
            return false;
        }
    }
    return true;
}
function buildSpecialStatsPatch(previous: PlayerSpecialStats, current: PlayerSpecialStats): Partial<PlayerSpecialStats> | undefined {
    const patch: Partial<PlayerSpecialStats> = {};
    if (previous.foundation !== current.foundation) {
        patch.foundation = current.foundation;
    }
    if (previous.combatExp !== current.combatExp) {
        patch.combatExp = current.combatExp;
    }
    return Object.keys(patch).length > 0 ? patch : undefined;
}
function isSameAttrBonuses(left: AttrBonus[], right: AttrBonus[]) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (leftEntry.source !== rightEntry.source
            || leftEntry.label !== rightEntry.label
            || !isSameAttributes(leftEntry.attrs, rightEntry.attrs)
            || !isSamePartialNumericStats(leftEntry.stats, rightEntry.stats)
            || !isSameQiProjectionModifierList(leftEntry.qiProjection, rightEntry.qiProjection)
            || !isSameAttrBonusMeta(leftEntry.meta, rightEntry.meta)) {
            return false;
        }
    }
    return true;
}
function isSameAttributes(left: Partial<Attributes> | null | undefined, right: Partial<Attributes> | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.constitution === right.constitution
        && left.spirit === right.spirit
        && left.perception === right.perception
        && left.talent === right.talent
        && left.comprehension === right.comprehension
        && left.luck === right.luck;
}
function cloneAttrBonus(source: AttrBonus): AttrBonus {
    return {
        source: source.source,
        label: source.label,
        attrs: clonePartialAttributes(source.attrs),
        stats: clonePartialNumericStats(source.stats),
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => cloneQiProjectionModifier(entry)) : undefined,
        meta: cloneAttrBonusMetaRecord(source.meta),
    };
}
function isSameSpecialStats(left: PlayerSpecialStats, right: PlayerSpecialStats) {
    return left.foundation === right.foundation
        && left.combatExp === right.combatExp;
}
function isSamePartialNumericStats(left: PartialNumericStats | null | undefined, right: PartialNumericStats | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of NUMERIC_STAT_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return isSamePartialElementGroup(left.elementDamageBonus, right.elementDamageBonus)
        && isSamePartialElementGroup(left.elementDamageReduce, right.elementDamageReduce);
}
function isSamePartialElementGroup(
    left: Partial<ProjectedElementGroup> | null | undefined,
    right: Partial<ProjectedElementGroup> | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of ELEMENT_GROUP_KEYS) {
        if (left[key] !== right[key]) {
            return false;
        }
    }
    return true;
}
function isSameQiProjectionModifierList(
    left: QiProjectionModifier[] | null | undefined,
    right: QiProjectionModifier[] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameQiProjectionModifier(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameQiProjectionModifier(left: QiProjectionModifier | null | undefined, right: QiProjectionModifier | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.visibility === right.visibility
        && left.efficiencyBpMultiplier === right.efficiencyBpMultiplier
        && isSameQiProjectionSelector(left.selector, right.selector);
}
function isSameQiProjectionSelector(
    left: QiProjectionModifier['selector'],
    right: QiProjectionModifier['selector'],
) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return isSameStringList(left.resourceKeys, right.resourceKeys)
        && isSameStringList(left.families, right.families)
        && isSameStringList(left.forms, right.forms)
        && isSameStringList(left.elements, right.elements);
}
function isSameAttrBonusMeta(left: Record<string, unknown> | null | undefined, right: Record<string, unknown> | null | undefined) {
    return isSameAttrBonusMetaRecord(left, right);
}
function cloneAttrBonusMetaRecord(
    source: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
    const normalizedSource = normalizeAttrBonusMetaRecord(source);
    return normalizedSource ? cloneAttrBonusMetaRecordValue(normalizedSource) : undefined;
}
function cloneAttrBonusMetaValue(value: AttrBonusMetaValue): AttrBonusMetaValue {
    if (Array.isArray(value)) {
        return value.map((entry) => cloneAttrBonusMetaValue(entry));
    }
    if (value && typeof value === 'object') {
        const clone: AttrBonusMetaRecord = {};
        for (const [key, entry] of Object.entries(value)) {
            clone[key] = cloneAttrBonusMetaValue(entry);
        }
        return clone;
    }
    return value;
}
function cloneAttrBonusMetaRecordValue(value: AttrBonusMetaRecord): AttrBonusMetaRecord {
    return cloneAttrBonusMetaValue(value) as AttrBonusMetaRecord;
}
function isSameAttrBonusMetaRecord(
    left: Record<string, unknown> | null | undefined,
    right: Record<string, unknown> | null | undefined,
): boolean {
    if (left === right) {
        return true;
    }
    const normalizedLeft = normalizeAttrBonusMetaRecord(left);
    const normalizedRight = normalizeAttrBonusMetaRecord(right);
    if (!normalizedLeft || !normalizedRight) {
        return false;
    }
    const leftKeys = Object.keys(normalizedLeft);
    const rightKeys = Object.keys(normalizedRight);
    if (leftKeys.length !== rightKeys.length) {
        return false;
    }
    for (const key of leftKeys) {
        if (!Object.prototype.hasOwnProperty.call(normalizedRight, key)) {
            return false;
        }
        if (!isSameAttrBonusMetaValue(normalizedLeft[key], normalizedRight[key])) {
            return false;
        }
    }
    return true;
}
function isSameAttrBonusMetaValue(left: AttrBonusMetaValue, right: AttrBonusMetaValue): boolean {
    if (left === right) {
        return true;
    }
    if (Array.isArray(left) || Array.isArray(right)) {
        if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
            return false;
        }
        for (let index = 0; index < left.length; index += 1) {
            if (!isSameAttrBonusMetaValue(left[index], right[index] ?? null)) {
                return false;
            }
        }
        return true;
    }
    if (left && typeof left === 'object' && right && typeof right === 'object') {
        return isSameAttrBonusMetaRecord(left, right);
    }
    return false;
}
function normalizeAttrBonusMetaRecord(
    value: Record<string, unknown> | null | undefined,
): AttrBonusMetaRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    return value as AttrBonusMetaRecord;
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
    diffGroundPiles,
    diffMonsterEntries,
    diffNpcEntries,
    diffPlayerEntries,
    diffPortalEntries,
};
function isSameTechniqueSkillList(left: TechniqueUpdateEntryView['skills'], right: TechniqueUpdateEntryView['skills']) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameSkillDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameTechniqueLayerList(left: TechniqueUpdateEntryView['layers'], right: TechniqueUpdateEntryView['layers']) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameTechniqueLayerDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameTechniqueAttrCurves(left: TechniqueUpdateEntryView['attrCurves'], right: TechniqueUpdateEntryView['attrCurves']) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    for (const key of ATTRIBUTE_KEYS) {
        if (!isSameTechniqueAttrCurveSegmentList(left[key], right[key])) {
            return false;
        }
    }
    return true;
}
function isSameSkillDef(left: SkillDef | null | undefined, right: SkillDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.id === right.id
        && left.name === right.name
        && left.desc === right.desc
        && left.cooldown === right.cooldown
        && left.cost === right.cost
        && left.costMultiplier === right.costMultiplier
        && left.range === right.range
        && isSameSkillTargetingDef(left.targeting, right.targeting)
        && isSameSkillEffectList(left.effects, right.effects)
        && left.unlockLevel === right.unlockLevel
        && left.unlockRealm === right.unlockRealm
        && left.unlockPlayerRealm === right.unlockPlayerRealm
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode
        && isSameSkillMonsterCastDef(left.monsterCast, right.monsterCast);
}
function isSameSkillTargetingDef(left: SkillTargetingDef | null | undefined, right: SkillTargetingDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.shape === right.shape
        && left.range === right.range
        && left.radius === right.radius
        && left.innerRadius === right.innerRadius
        && left.width === right.width
        && left.height === right.height
        && left.checkerParity === right.checkerParity
        && left.maxTargets === right.maxTargets
        && left.requiresTarget === right.requiresTarget
        && left.targetMode === right.targetMode;
}
function isSameSkillEffectList(left: SkillEffectDef[] | null | undefined, right: SkillEffectDef[] | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        if (!isSameSkillEffectDef(left[index] ?? null, right[index] ?? null)) {
            return false;
        }
    }
    return true;
}
function isSameSkillEffectDef(left: SkillEffectDef | null | undefined, right: SkillEffectDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.type !== right.type) {
        return false;
    }
    switch (left.type) {
        case 'damage':
            return right.type === 'damage'
                && left.damageKind === right.damageKind
                && left.element === right.element
                && isSameSkillFormula(left.formula, right.formula);
        case 'heal':
            return right.type === 'heal'
                && left.target === right.target
                && isSameSkillFormula(left.formula, right.formula);
        case 'buff':
            return right.type === 'buff'
                && left.target === right.target
                && left.buffId === right.buffId
                && left.name === right.name
                && left.desc === right.desc
                && left.shortMark === right.shortMark
                && left.category === right.category
                && left.visibility === right.visibility
                && left.color === right.color
                && left.duration === right.duration
                && left.stacks === right.stacks
                && left.maxStacks === right.maxStacks
                && isSameAttributes(left.attrs, right.attrs)
                && isSamePartialNumericStats(left.stats, right.stats)
                && isSameQiProjectionModifierList(left.qiProjection, right.qiProjection)
                && isSamePartialNumericStats(left.valueStats, right.valueStats)
                && left.presentationScale === right.presentationScale
                && left.infiniteDuration === right.infiniteDuration
                && isSameBuffSustainCostDef(left.sustainCost, right.sustainCost)
                && left.expireWithBuffId === right.expireWithBuffId;
        case 'cleanse':
            return right.type === 'cleanse'
                && left.target === right.target
                && left.category === right.category
                && left.removeCount === right.removeCount;
    }
}
function isSameSkillFormula(left: SkillFormula | null | undefined, right: SkillFormula | null | undefined) {
    if (left === right) {
        return true;
    }
    if (typeof left === 'number' || typeof right === 'number') {
        return left === right;
    }
    if (!left || !right) {
        return false;
    }
    if ('var' in left || 'var' in right) {
        return 'var' in left
            && 'var' in right
            && left.var === right.var
            && left.scale === right.scale;
    }
    if (left.op === 'clamp' || right.op === 'clamp') {
        return left.op === 'clamp'
            && right.op === 'clamp'
            && isSameSkillFormula(left.value, right.value)
            && isSameSkillFormula(left.min, right.min)
            && isSameSkillFormula(left.max, right.max);
    }
    if (left.op !== right.op || left.args.length !== right.args.length) {
        return false;
    }
    for (let index = 0; index < left.args.length; index += 1) {
        if (!isSameSkillFormula(left.args[index], right.args[index])) {
            return false;
        }
    }
    return true;
}
function isSameSkillMonsterCastDef(left: SkillMonsterCastDef | null | undefined, right: SkillMonsterCastDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.windupTicks === right.windupTicks
        && left.warningColor === right.warningColor
        && isSameEquipmentConditionGroup(left.conditions, right.conditions);
}
function isSameTechniqueLayerDef(left: TechniqueLayerDef | null | undefined, right: TechniqueLayerDef | null | undefined) {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return false;
    }
    return left.level === right.level
        && left.expToNext === right.expToNext
        && isSameAttributes(left.attrs, right.attrs);
}
function isSameTechniqueAttrCurveSegmentList(
    left: TechniqueAttrCurveSegment[] | null | undefined,
    right: TechniqueAttrCurveSegment[] | null | undefined,
) {
    if (left === right) {
        return true;
    }
    if (!left || !right || left.length !== right.length) {
        return false;
    }
    for (let index = 0; index < left.length; index += 1) {
        const leftEntry = left[index];
        const rightEntry = right[index];
        if (!leftEntry || !rightEntry) {
            return false;
        }
        if (
            leftEntry.startLevel !== rightEntry.startLevel
            || leftEntry.endLevel !== rightEntry.endLevel
            || leftEntry.gainPerLevel !== rightEntry.gainPerLevel
        ) {
            return false;
        }
    }
    return true;
}
function cloneNumericStats(source: NumericStats): NumericStats {
    return {
        maxHp: source.maxHp,
        maxQi: source.maxQi,
        physAtk: source.physAtk,
        spellAtk: source.spellAtk,
        physDef: source.physDef,
        spellDef: source.spellDef,
        hit: source.hit,
        dodge: source.dodge,
        crit: source.crit,
        antiCrit: source.antiCrit,
        critDamage: source.critDamage,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        maxQiOutputPerTick: source.maxQiOutputPerTick,
        qiRegenRate: source.qiRegenRate,
        hpRegenRate: source.hpRegenRate,
        cooldownSpeed: source.cooldownSpeed,
        auraCostReduce: source.auraCostReduce,
        auraPowerRate: source.auraPowerRate,
        playerExpRate: source.playerExpRate,
        techniqueExpRate: source.techniqueExpRate,
        realmExpPerTick: source.realmExpPerTick,
        techniqueExpPerTick: source.techniqueExpPerTick,
        lootRate: source.lootRate,
        rareLootRate: source.rareLootRate,
        viewRange: source.viewRange,
        moveSpeed: source.moveSpeed,
        extraAggroRate: source.extraAggroRate,
        extraRange: source.extraRange,
        extraArea: source.extraArea,
        elementDamageBonus: {
            metal: source.elementDamageBonus.metal,
            wood: source.elementDamageBonus.wood,
            water: source.elementDamageBonus.water,
            fire: source.elementDamageBonus.fire,
            earth: source.elementDamageBonus.earth,
        },
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
function clonePartialNumericStats(source: PartialNumericStats | null | undefined): PartialNumericStats | undefined {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。
    if (!source) {
        return undefined;
    }
    const clone: PartialNumericStats = {};
    for (const key of NUMERIC_STAT_KEYS) {
        if (source[key] !== undefined) {
            clone[key] = source[key];
        }
    }
    if (source.elementDamageBonus) {
        clone.elementDamageBonus = { ...source.elementDamageBonus };
    }
    if (source.elementDamageReduce) {
        clone.elementDamageReduce = { ...source.elementDamageReduce };
    }
    return Object.keys(clone).length > 0 ? clone : undefined;
}
function cloneNumericRatioDivisors(source: NumericRatioDivisors): NumericRatioDivisors {
    return {
        dodge: source.dodge,
        crit: source.crit,
        breakPower: source.breakPower,
        resolvePower: source.resolvePower,
        cooldownSpeed: source.cooldownSpeed,
        moveSpeed: source.moveSpeed,
        elementDamageReduce: {
            metal: source.elementDamageReduce.metal,
            wood: source.elementDamageReduce.wood,
            water: source.elementDamageReduce.water,
            fire: source.elementDamageReduce.fire,
            earth: source.elementDamageReduce.earth,
        },
    };
}
function cloneQiProjectionModifier(source: QiProjectionModifier): QiProjectionModifier {
    return {
        ...source,
        selector: source.selector
            ? {
                ...source.selector,
                resourceKeys: source.selector.resourceKeys ? source.selector.resourceKeys.slice() : undefined,
                families: source.selector.families ? source.selector.families.slice() : undefined,
                forms: source.selector.forms ? source.selector.forms.slice() : undefined,
                elements: source.selector.elements ? source.selector.elements.slice() : undefined,
            }
            : undefined,
    };
}
function cloneVisibleBuff(source: VisibleBuffState): VisibleBuffState {
    return {
        ...source,
        attrs: source.attrs ? { ...source.attrs } : undefined,
        stats: source.stats ? { ...source.stats } : undefined,
        qiProjection: source.qiProjection ? source.qiProjection.map((entry) => cloneQiProjectionModifier(entry)) : undefined,
    };
}
function buildPortalId(x: number, y: number) {
    return `${x}:${y}`;
}
function resolvePlayerRenderChar(displayName, name) {
    const normalizedDisplayName = typeof displayName === 'string' ? displayName.trim() : '';
    if (normalizedDisplayName) {
        return normalizedDisplayName;
    }
    const normalizedName = typeof name === 'string' ? name.trim() : '';
    return normalizedName ? [...normalizedName][0] ?? '@' : '@';
}
function resolvePortalDisplayName(
    portal: ProjectorPortalLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
) {
    const targetMapName = resolveMapName?.(portal.targetMapId) ?? null;
    if (typeof targetMapName === 'string' && targetMapName.trim()) {
        return targetMapName.trim();
    }
    if (typeof portal.targetMapId === 'string' && portal.targetMapId.trim()) {
        return portal.targetMapId.trim();
    }
    return portal.kind === 'stairs' ? '楼梯' : '传送阵';
}
