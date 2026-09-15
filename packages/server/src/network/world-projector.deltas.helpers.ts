/**
 * 世界投影器 — delta 构建辅助函数。
 *
 * 从 world-projector.helpers.ts 拆分而来，负责面板 delta 构建、cursor diff、
 * 技艺传输状态投影、面板更新编排等。
 * 维护时要保持 delta 字段与协议契约一致。
 */
import {
  type S2C_PanelActionDelta,
  type S2C_PanelDelta,
  type SelfDeltaView,
  type SyncedItemStack,
  type TechniqueTransmissionJobState,
  type VisibleBuffState,
} from '@mud/shared';
import { isSameAutoUsePillList, isSameCombatTargetingRules } from '../runtime/player/player-combat-config.helpers';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import {
  type ProjectorPlayerLike,
  type ProjectedAttrPanelState,
  type ProjectedActionPanelState,
  type ProjectedPanelState,
  type ProjectedPanelCursor,
  type ProjectedAttrDeltaView,
  type ProjectedActionEntry,
  type ProjectedSelfState,
  type PlayerStateSlice,
} from './projector-types';
import {
  isSameWalletState,
  isSameSpecialStats,
  isSameAttrBonuses,
  isSameCraftSkillState,
  isSameActionOrder,
} from './projector-compare';
import { cloneWalletState } from './projector-clone';
import {
  diffInventorySlots,
  diffEquipmentSlots,
  diffArtifactSlots,
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
import {
  addSyncFlushDuration,
  incrementSyncFlushCount,
  type SyncFlushBreakdownSample,
} from './world-sync-flush-breakdown';
import { buildSpecialStatsPatch, buildActionOrder } from './world-projector.player-attrs.helpers';
import {
  captureAttrPanelSlice,
  captureActionPanelSlice,
  captureBuffPanelSlice,
  captureInventoryPanelSlice,
  captureEquipmentPanelSlice,
  captureArtifactPanelSlice,
  captureTechniquePanelSlice,
  resolveAttrPanelChangeKind,
  canReuseActionPanelSlice,
  patchRealmProgressAttrPanelSlice,
  buildPanelCursor,
  cloneMovementCapabilities,
  isSameCraftEffectStats,
} from './world-projector.panel-slices.helpers';

type PanelDeltaBuildResult = {
    delta: S2C_PanelDelta | null;
    panelCursor: ProjectedPanelCursor;
    attrPanel?: ProjectedAttrPanelState;
    actionPanel?: ProjectedActionPanelState;
    techniquePanel?: ProjectedPanelState['technique'];
};
export function buildFullAttrDelta(player: ProjectorPlayerLike): ProjectedAttrDeltaView {
    return buildFullAttrDeltaFromState(captureAttrPanelSlice(player));
}

export function buildFullAttrDeltaFromState(attr: ProjectedAttrPanelState): ProjectedAttrDeltaView {
    return {
        r: attr.revision,
        full: 1 as const,
        stage: attr.stage,
        baseAttrs: attr.baseAttrs,
        bonuses: attr.bonuses,
        finalAttrs: attr.finalAttrs,
        numericStats: attr.numericStats,
        ratioDivisors: attr.ratioDivisors,
        craftEffectStats: attr.craftEffectStats,
        comprehensionSpeedRate: attr.comprehensionSpeedRate,
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

export function buildFullActionDelta(player: ProjectorPlayerLike): S2C_PanelActionDelta {
    return buildFullActionDeltaFromState(captureActionPanelSlice(player));
}

export function buildFullActionDeltaFromState(action: ProjectedActionPanelState): S2C_PanelActionDelta {
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
        combatAttackIntensity: action.combatAttackIntensity,
        cultivationActive: action.cultivationActive,
        senseQiActive: action.senseQiActive,
        wangQiActive: action.wangQiActive,
    };
}

export function buildActionDeltaFromState(
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
        combatAttackIntensity: previousAction.combatAttackIntensity !== currentAction.combatAttackIntensity
            ? currentAction.combatAttackIntensity
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

export function buildFullBuffDelta(player: ProjectorPlayerLike): S2C_PanelDelta['buff'] {
    return buildFullBuffDeltaFromState(captureBuffPanelSlice(player));
}

export function buildFullBuffDeltaFromState(buff: ProjectedPanelState['buff']): S2C_PanelDelta['buff'] {
    return { r: buff.revision, full: 1, buffs: buff.buffs };
}

export function buildAttrDelta(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): ProjectedAttrDeltaView {
    return buildAttrDeltaFromState(previousAttr, captureAttrPanelSlice(player));
}

export function buildAttrDeltaFromState(previousAttr: ProjectedAttrPanelState, currentAttr: ProjectedAttrPanelState): ProjectedAttrDeltaView {
    const stageChanged = previousAttr.stage !== currentAttr.stage;
    const baseAttrsPatch = diffAttributes(previousAttr.baseAttrs, currentAttr.baseAttrs);
    const bonusesChanged = !isSameAttrBonuses(previousAttr.bonuses, currentAttr.bonuses);
    const finalAttrsPatch = diffAttributes(previousAttr.finalAttrs, currentAttr.finalAttrs);
    const numericStatsPatch = diffNumericStats(previousAttr.numericStats, currentAttr.numericStats);
    const ratioDivisorsPatch = diffRatioDivisors(previousAttr.ratioDivisors, currentAttr.ratioDivisors);
    const craftEffectStatsChanged = !isSameCraftEffectStats(previousAttr.craftEffectStats, currentAttr.craftEffectStats);
    const comprehensionSpeedRateChanged = previousAttr.comprehensionSpeedRate !== currentAttr.comprehensionSpeedRate;
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
        craftEffectStats: craftEffectStatsChanged ? currentAttr.craftEffectStats : undefined,
        comprehensionSpeedRate: comprehensionSpeedRateChanged ? currentAttr.comprehensionSpeedRate : undefined,
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

export function buildSelfDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): SelfDeltaView | null {
    if (previous.selfRevision === player.selfRevision) { return null; }
    const currentMovementCapabilities = cloneMovementCapabilities(player.movementCapabilities);
    const delta: SelfDeltaView = { sr: player.selfRevision };
    if (previous.self.instanceId !== player.instanceId) { delta.iid = player.instanceId; }
    if (previous.self.templateId !== player.templateId) { delta.mid = player.templateId; }
    const currentSectId = typeof player.sectId === 'string' && player.sectId.trim() ? player.sectId.trim() : null;
    if (previous.self.sectId !== currentSectId) { delta.sid = currentSectId; }
    const currentPartyId = typeof player.partyId === 'string' && player.partyId.trim() ? player.partyId.trim() : null;
    if (previous.self.partyId !== currentPartyId) { delta.pid = currentPartyId; }
    if (previous.self.f !== player.facing) { delta.f = player.facing; }
    if (previous.self.hp !== player.hp) { delta.hp = player.hp; }
    if (previous.self.maxHp !== player.maxHp) { delta.maxHp = player.maxHp; }
    if (previous.self.qi !== player.qi) { delta.qi = player.qi; }
    if (previous.self.maxQi !== player.maxQi) { delta.maxQi = player.maxQi; }
    if (!isSameWalletState(previous.self.wallet, player.wallet)) { delta.wallet = cloneWalletState(player.wallet); }
    if (!isSameMovementCapabilities(previous.self.movementCapabilities, currentMovementCapabilities)) {
        delta.mc = currentMovementCapabilities;
    }
    return delta;
}

export function isSameMovementCapabilities(left: ProjectedSelfState['movementCapabilities'] | null | undefined, right: ProjectedSelfState['movementCapabilities'] | null | undefined): boolean {
    return (left?.staticObstacleIgnore === true) === (right?.staticObstacleIgnore === true);
}

export function buildPanelUpdate(
    previous: PlayerStateSlice,
    player: ProjectorPlayerLike,
    breakdown?: SyncFlushBreakdownSample,
): PanelDeltaBuildResult {
    const attrCheckStartedAt = performance.now();
    const attrChangeKind = previous.attrPanel
        ? resolveAttrPanelChangeKind(previous.attrPanel, player)
        : 'full';
    addSyncFlushDuration(breakdown, 'projectorPanelAttrCheckMs', attrCheckStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelAttrCheckCount');
    incrementSyncFlushCount(
        breakdown,
        attrChangeKind === 'none'
            ? 'projectorPanelAttrNoneCount'
            : attrChangeKind === 'realm_progress'
                ? 'projectorPanelAttrRealmProgressCount'
                : 'projectorPanelAttrFullCount',
    );
    const canReuseAttrPanel = attrChangeKind === 'none';
    const canReuseActionPanel = Boolean(previous.actionPanel && canReuseActionPanelSlice(previous.actionPanel, player));
    if (canReuseActionPanel) {
        incrementSyncFlushCount(breakdown, 'projectorPanelActionReuseCount');
    }
    const buffProjectionStartedAt = performance.now();
    const currentBuffs = projectVisiblePlayerBuffs(player);
    addSyncFlushDuration(breakdown, 'projectorPanelBuffProjectionMs', buffProjectionStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelBuffProjectionCount');
    incrementSyncFlushCount(breakdown, 'projectorPanelBuffEntryCount', currentBuffs.length);
    const cursorStartedAt = performance.now();
    const panelCursor = buildPanelCursor(player, previous.panelCursor, {
        attrSignature: canReuseAttrPanel,
        attrSignatureMode: attrChangeKind === 'realm_progress' ? 'realm_progress' : 'full',
        actionSignature: canReuseActionPanel,
    }, currentBuffs);
    addSyncFlushDuration(breakdown, 'projectorPanelCursorMs', cursorStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelCursorCount');
    const attrSliceStartedAt = performance.now();
    const currentAttrPanel = previous.attrPanel && canReuseAttrPanel
        ? previous.attrPanel
        : previous.attrPanel && attrChangeKind === 'realm_progress'
            ? patchRealmProgressAttrPanelSlice(previous.attrPanel, player)
        : captureAttrPanelSlice(player);
    addSyncFlushDuration(breakdown, 'projectorPanelAttrSliceMs', attrSliceStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelAttrSliceCount');
    const actionSliceStartedAt = performance.now();
    const currentActionPanel = previous.actionPanel && canReuseActionPanel
        ? previous.actionPanel
        : captureActionPanelSlice(player);
    addSyncFlushDuration(breakdown, 'projectorPanelActionSliceMs', actionSliceStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelActionSliceCount');
    if (!canReuseActionPanel) {
        incrementSyncFlushCount(breakdown, 'projectorPanelActionEntryCount', player.actions.actions.length);
    }
    const hasTechniqueCache = Boolean(previous.techniquePanel);
    const deltaStartedAt = performance.now();
    const delta = buildPanelDeltaFromCursor(previous.panelCursor, panelCursor, player, {
        previousAttr: previous.attrPanel,
        currentAttr: currentAttrPanel,
        attrProgressOnly: attrChangeKind === 'realm_progress',
        previousAction: previous.actionPanel,
        currentAction: currentActionPanel,
        skipTechnique: hasTechniqueCache,
        currentBuffs,
    }) ?? {};
    addSyncFlushDuration(breakdown, 'projectorPanelDeltaMs', deltaStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelDeltaCount');
    const techniqueStartedAt = performance.now();
    let techniquePanel = previous.techniquePanel;
    if (previous.techniquePanel && previous.panelCursor.techniqueSignature !== panelCursor.techniqueSignature) {
        incrementSyncFlushCount(breakdown, 'projectorPanelTechniqueEntryCount', player.techniques.techniques.length);
        const currentTechnique = captureTechniquePanelSlice(player, previous.techniquePanel);
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
    addSyncFlushDuration(breakdown, 'projectorPanelTechniqueMs', techniqueStartedAt);
    incrementSyncFlushCount(breakdown, 'projectorPanelTechniqueCount');
    const finalDelta = delta.inv || delta.eq || delta.art || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
    recordPanelDeltaBreakdown(breakdown, finalDelta);
    return { delta: finalDelta, panelCursor, attrPanel: currentAttrPanel, actionPanel: currentActionPanel, techniquePanel };
}

export function recordPanelDeltaBreakdown(
    breakdown: SyncFlushBreakdownSample | undefined,
    delta: S2C_PanelDelta | null,
): void {
    if (!delta) {
        return;
    }
    if (delta.inv) { incrementSyncFlushCount(breakdown, 'projectorPanelInventoryDeltaCount'); }
    if (delta.eq) { incrementSyncFlushCount(breakdown, 'projectorPanelEquipmentDeltaCount'); }
    if (delta.art) { incrementSyncFlushCount(breakdown, 'projectorPanelArtifactDeltaCount'); }
    if (delta.tech) { incrementSyncFlushCount(breakdown, 'projectorPanelTechniqueDeltaCount'); }
    if (delta.attr) { incrementSyncFlushCount(breakdown, 'projectorPanelAttrDeltaCount'); }
    if (delta.act) { incrementSyncFlushCount(breakdown, 'projectorPanelActionDeltaCount'); }
    if (delta.buff) { incrementSyncFlushCount(breakdown, 'projectorPanelBuffDeltaCount'); }
}

export function buildPanelDelta(previous: PlayerStateSlice, player: ProjectorPlayerLike): S2C_PanelDelta | null {
    return buildPanelUpdate(previous, player).delta;
}

export function buildPanelDeltaFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    player: ProjectorPlayerLike,
    options: {
        skipTechnique?: boolean;
        attrProgressOnly?: boolean;
        previousAttr?: ProjectedAttrPanelState;
        currentAttr?: ProjectedAttrPanelState;
        previousAction?: ProjectedActionPanelState;
        currentAction?: ProjectedActionPanelState;
        currentBuffs?: VisibleBuffState[];
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
    if (previousCursor.artifactRevision !== currentCursor.artifactRevision) {
        const artifact = captureArtifactPanelSlice(player);
        const slotPatch = diffArtifactSlotsFromCursor(previousCursor, currentCursor, artifact.slots);
        delta.art = { r: artifact.revision, slots: slotPatch };
    }
    if (!options.skipTechnique && previousCursor.techniqueSignature !== currentCursor.techniqueSignature) {
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
        delta.attr = options.attrProgressOnly && options.previousAttr
            ? buildRealmProgressAttrDelta(options.previousAttr, currentAttr)
            : options.previousAttr
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
        const buff = captureBuffPanelSlice(player, options.currentBuffs);
        const buffPatch = diffBuffEntriesFromCursor(previousCursor, currentCursor, buff.buffs);
        const removedBuffIds = diffRemovedIds(previousCursor.buffIds, currentCursor.buffIds);
        delta.buff = {
            r: buff.revision,
            buffs: buffPatch.length > 0 ? buffPatch : undefined,
            removeBuffIds: removedBuffIds.length > 0 ? removedBuffIds : undefined,
        };
    }
    return delta.inv || delta.eq || delta.art || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}

export function buildRealmProgressAttrDelta(
    previousAttr: ProjectedAttrPanelState,
    currentAttr: ProjectedAttrPanelState,
): ProjectedAttrDeltaView {
    const delta: ProjectedAttrDeltaView = { r: currentAttr.revision };
    if (previousAttr.realmProgress !== currentAttr.realmProgress) {
        delta.realmProgress = currentAttr.realmProgress;
    }
    if (previousAttr.realmProgressToNext !== currentAttr.realmProgressToNext) {
        delta.realmProgressToNext = currentAttr.realmProgressToNext;
    }
    if (previousAttr.realmBreakthroughReady !== currentAttr.realmBreakthroughReady) {
        delta.realmBreakthroughReady = currentAttr.realmBreakthroughReady;
    }
    return delta;
}

export function diffInventorySlotsFromCursor(
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

export function diffEquipmentSlotsFromCursor(
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

export function diffArtifactSlotsFromCursor(
    previousCursor: ProjectedPanelCursor,
    currentCursor: ProjectedPanelCursor,
    currentSlots: NonNullable<S2C_PanelDelta['art']>['slots'],
): NonNullable<S2C_PanelDelta['art']>['slots'] {
    const patch: NonNullable<S2C_PanelDelta['art']>['slots'] = [];
    const previousSignatures = previousCursor.artifactSlotSignatures ?? {};
    const currentSignatures = currentCursor.artifactSlotSignatures ?? {};
    for (const entry of currentSlots) {
        if ((previousSignatures[entry.slot] ?? '') !== (currentSignatures[entry.slot] ?? '')) {
            patch.push(entry);
        }
    }
    return patch;
}

export function diffActionEntryPatches(
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

export function buildActionEntryPatch(
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
    setActionPatchField(patch, 'passiveOnly', previous.passiveOnly, current.passiveOnly);
    setActionPatchField(patch, 'dungeonId', previous.dungeonId, current.dungeonId);
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

export function setActionPatchField<K extends keyof NonNullable<S2C_PanelActionDelta['actions']>[number]>(
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

export function diffBuffEntriesFromCursor(
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

export function diffRemovedIds(previousIds: string[], currentIds: string[]): string[] {
    const current = new Set(currentIds);
    return previousIds.filter((id) => !current.has(id));
}

export function isSameStringList(left: string[], right: string[]): boolean {
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

export function isSameBodyTrainingState(left: ProjectedPanelState['technique']['bodyTraining'], right: ProjectedPanelState['technique']['bodyTraining']): boolean {
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

export function clonePendingComprehensions(value: ProjectedPanelState['technique']['pendingComprehensions'], transmissionJob: unknown = null) {
    return (Array.isArray(value) ? value : []).map((entry) => ({
        ...entry,
        activeTransferJob: buildProjectedTransmissionJob(entry, transmissionJob),
    }));
}

export function buildProjectedTransmissionJob(entry: unknown, transmissionJob: any = null): TechniqueTransmissionJobState | null {
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

export function normalizePositiveProjectionNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized > 0 ? normalized : undefined;
}

export function normalizeNonNegativeProjectionNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) && normalized >= 0 ? normalized : undefined;
}

export function normalizeSignedProjectionNumber(value: unknown): number | undefined {
    const normalized = Number(value);
    return Number.isFinite(normalized) ? normalized : undefined;
}

export function normalizeProgressBreakdown(value: unknown): TechniqueTransmissionJobState['progressBreakdown'] | undefined {
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
    const transmissionSpeedRate = normalizeSignedProjectionNumber(source.transmissionSpeedRate);
    const learnerTransmissionSpeedRate = normalizeSignedProjectionNumber(source.learnerTransmissionSpeedRate);
    const teacherTransmissionSpeedRate = normalizeSignedProjectionNumber(source.teacherTransmissionSpeedRate);
    const transmissionSpeedFactor = normalizePositiveProjectionNumber(source.transmissionSpeedFactor);
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
        ...(transmissionSpeedRate === undefined ? {} : { transmissionSpeedRate }),
        ...(learnerTransmissionSpeedRate === undefined ? {} : { learnerTransmissionSpeedRate }),
        ...(teacherTransmissionSpeedRate === undefined ? {} : { teacherTransmissionSpeedRate }),
        ...(transmissionSpeedFactor === undefined ? {} : { transmissionSpeedFactor }),
    };
}

export function isSamePendingComprehensions(
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
            || leftEntry.name !== rightEntry.name
            || leftEntry.sourceKind !== rightEntry.sourceKind
            || leftEntry.creatorPlayerId !== rightEntry.creatorPlayerId
            || leftEntry.selfComprehensionAllowed !== rightEntry.selfComprehensionAllowed
            || leftEntry.progress !== rightEntry.progress
            || leftEntry.requiredProgress !== rightEntry.requiredProgress
            || leftEntry.realmLv !== rightEntry.realmLv
            || leftEntry.grade !== rightEntry.grade
            || leftEntry.category !== rightEntry.category
            || leftEntry.createdAtTick !== rightEntry.createdAtTick
            || leftEntry.updatedAtTick !== rightEntry.updatedAtTick
            || !isSameTransmissionJobState(leftEntry.activeTransferJob, rightEntry.activeTransferJob)) {
            return false;
        }
    }
    return true;
}

export function isSameTransmissionJobState(
    left: TechniqueTransmissionJobState | null | undefined,
    right: TechniqueTransmissionJobState | null | undefined,
): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left == null && right == null;
    }
    return left.jobId === right.jobId
        && left.teacherPlayerId === right.teacherPlayerId
        && left.teacherName === right.teacherName
        && left.startedAtTick === right.startedAtTick
        && left.status === right.status
        && left.blockedReason === right.blockedReason
        && left.range === right.range
        && left.progressGainPerTick === right.progressGainPerTick
        && left.estimatedRemainingTicks === right.estimatedRemainingTicks
        && left.interruptWaitRemainingTicks === right.interruptWaitRemainingTicks
        && isSameProgressBreakdown(left.progressBreakdown, right.progressBreakdown)
        && isSameTransmissionInterruptState(left.interruptState, right.interruptState);
}

export function isSameTransmissionInterruptState(
    left: TechniqueTransmissionJobState['interruptState'],
    right: TechniqueTransmissionJobState['interruptState'],
): boolean {
    if (left === right) {
        return true;
    }
    if (!left || !right) {
        return left == null && right == null;
    }
    return left.reason === right.reason
        && left.waitTotalTicks === right.waitTotalTicks
        && left.waitRemainingTicks === right.waitRemainingTicks
        && left.startedAtTick === right.startedAtTick;
}

export function isSameProgressBreakdown(
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
        && left.teacherTransmissionFactor === right.teacherTransmissionFactor
        && left.transmissionSpeedRate === right.transmissionSpeedRate
        && left.learnerTransmissionSpeedRate === right.learnerTransmissionSpeedRate
        && left.teacherTransmissionSpeedRate === right.teacherTransmissionSpeedRate
        && left.transmissionSpeedFactor === right.transmissionSpeedFactor;
}

export function buildPanelDeltaFromState(previousPanel: ProjectedPanelState, currentPanel: ProjectedPanelState): S2C_PanelDelta | null {
    const delta: S2C_PanelDelta = {};
    const previousInventory = previousPanel.inventory;
    const currentInventory = currentPanel.inventory;
    const previousEquipment = previousPanel.equipment;
    const currentEquipment = currentPanel.equipment;
    const previousArtifact = previousPanel.artifact;
    const currentArtifact = currentPanel.artifact;
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
    if (previousArtifact.revision !== currentArtifact.revision) {
        const slotPatch = diffArtifactSlots(previousArtifact.slots, currentArtifact.slots);
        delta.art = { r: currentArtifact.revision, slots: slotPatch };
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
            combatAttackIntensity: currentAction.combatAttackIntensity,
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
    return delta.inv || delta.eq || delta.art || delta.tech || delta.attr || delta.act || delta.buff ? delta : null;
}
