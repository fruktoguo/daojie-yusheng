/**
 * 世界投影器 — 面板 slice 捕获/签名辅助函数。
 *
 * 从 world-projector.helpers.ts 拆分而来，负责面板状态快照捕获、签名计算、
 * slice 复用判断、投影器状态组合等。包含 FNV hash 工具函数。
 * 维护时要保持签名覆盖面与面板 diff 链路一致。
 */
import {
  type AttrBonus,
  type AutoUsePillConfig,
  type CombatTargetingRules,
  type CraftEffectStatsPatch,
  type TechniqueTransmissionJobState,
  type VisibleBuffState,
  type PlayerSpecialStats,
  type TechniqueUpdateEntryView,
  CRAFT_EFFECT_KINDS,
  CRAFT_EFFECT_SKILL_KINDS,
  GAME_DAY_TICKS,
  cloneCraftEffectStats,
  normalizeCombatAttackIntensity,
} from '@mud/shared';
import { cloneAutoUsePillList, cloneCombatTargetingRules, isSameAutoUsePillList, isSameCombatTargetingRules } from '../runtime/player/player-combat-config.helpers';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import {
  type ProjectorViewLike,
  type ProjectorPlayerLike,
  type ProjectedSelfState,
  type ProjectedAttrPanelState,
  type ProjectedActionPanelState,
  type ProjectedPanelState,
  type ProjectedPanelCursor,
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
  cloneSyncedItemStack,
  cloneTechniqueEntry,
} from './projector-clone';
import {
  isSameSpecialStats,
  isSameAttrBonuses,
  isSameBuffList,
  isSameCraftSkillState,
  isSameTechniqueEntry,
} from './projector-compare';
import { resolvePlayerSpecialStatsCached, buildAttrBonuses } from './world-projector.player-attrs.helpers';
import { captureWorldState } from './world-projector.world-delta.helpers';
import { clonePendingComprehensions } from './world-projector.deltas.helpers';

export const FNV_OFFSET_BASIS = 2166136261;
export const FNV_PRIME = 16777619;

type AttrPanelChangeKind = 'none' | 'realm_progress' | 'full';
/** 捕获当前帧的玩家自身状态快照，用于后续 self/panel diff。
 *  previousPanel 非空时按 revision 短路：未变的 slice 直接复用前帧引用，避免无谓克隆。 */
export function capturePlayerState(player: ProjectorPlayerLike): PlayerStateSlice {
    return {
        selfRevision: player.selfRevision,
        self: captureSelfState(player),
        attrPanel: captureAttrPanelSlice(player),
        actionPanel: captureActionPanelSlice(player),
        techniquePanel: captureTechniquePanelSlice(player),
        panelCursor: buildPanelCursor(player),
    };
}

export function captureSelfState(player: ProjectorPlayerLike): ProjectedSelfState {
    return {
        instanceId: player.instanceId,
        templateId: player.templateId,
        sectId: typeof player.sectId === 'string' && player.sectId.trim() ? player.sectId.trim() : null,
        partyId: typeof player.partyId === 'string' && player.partyId.trim() ? player.partyId.trim() : null,
        x: player.x, y: player.y, f: player.facing,
        hp: player.hp, maxHp: player.maxHp, qi: player.qi, maxQi: player.maxQi,
        wallet: cloneWalletState(player.wallet),
        movementCapabilities: cloneMovementCapabilities(player.movementCapabilities),
    };
}

export function cloneMovementCapabilities(capabilities: ProjectedSelfState['movementCapabilities'] | null | undefined): ProjectedSelfState['movementCapabilities'] {
    return {
        staticObstacleIgnore: capabilities?.staticObstacleIgnore === true,
    };
}

export function capturePanelState(player: ProjectorPlayerLike, previousPanel?: ProjectedPanelState | null): ProjectedPanelState {
    const prev = previousPanel ?? null;
    return {
        inventory: prev && prev.inventory.revision === player.inventory.revision
            ? prev.inventory : captureInventoryPanelSlice(player),
        equipment: prev && prev.equipment.revision === player.equipment.revision
            ? prev.equipment : captureEquipmentPanelSlice(player),
        artifact: prev && prev.artifact.revision === resolveArtifactPanelRevision(player)
            ? prev.artifact : captureArtifactPanelSlice(player),
        technique: prev && prev.technique.revision === player.techniques.revision
            ? prev.technique : captureTechniquePanelSlice(player, prev?.technique),
        attr: prev && canReuseAttrPanelSlice(prev.attr, player)
            ? prev.attr : captureAttrPanelSlice(player),
        action: prev && canReuseActionPanelSlice(prev.action, player)
            ? prev.action : captureActionPanelSlice(player),
        buff: prev && canReuseBuffPanelSlice(prev.buff, player)
            ? prev.buff : captureBuffPanelSlice(player),
    };
}

export function buildPanelCursor(
    player: ProjectorPlayerLike,
    previousCursor?: ProjectedPanelCursor | null,
    reuse: {
        attrSignature?: boolean;
        attrSignatureMode?: 'realm_progress' | 'full';
        actionSignature?: boolean;
    } = {},
    projectedBuffs?: VisibleBuffState[],
): ProjectedPanelCursor {
    const canReuseInventoryCursor = previousCursor
        && Array.isArray(previousCursor.inventorySlotSignatures)
        && previousCursor.inventoryRevision === player.inventory.revision
        && previousCursor.inventoryCapacity === player.inventory.capacity
        && previousCursor.inventorySize === player.inventory.items.length;
    const canReuseEquipmentCursor = previousCursor
        && previousCursor.equipmentSlotSignatures
        && previousCursor.equipmentRevision === player.equipment.revision;
    const canReuseArtifactCursor = previousCursor
        && previousCursor.artifactSlotSignatures
        && previousCursor.artifactRevision === resolveArtifactPanelRevision(player);
    const canReuseActionCursor = previousCursor
        && Array.isArray(previousCursor.actionIds)
        && previousCursor.actionEntrySignatures
        && previousCursor.actionRevision === player.actions.revision;
    const currentBuffs = projectedBuffs ?? projectVisiblePlayerBuffs(player);
    const buffSignature = buildBuffListSignature(player.buffs.revision, currentBuffs);
    const canReuseBuffCursor = previousCursor
        && Array.isArray(previousCursor.buffIds)
        && previousCursor.buffEntrySignatures
        && previousCursor.buffRevision === player.buffs.revision
        && previousCursor.buffSignature === buffSignature;
    const inventorySlotSignatures = canReuseInventoryCursor
        ? previousCursor.inventorySlotSignatures
        : player.inventory.items.map((entry) => buildStableProtocolSignature(entry));
    const equipmentSlotSignatures = canReuseEquipmentCursor
        ? previousCursor.equipmentSlotSignatures
        : buildEquipmentSlotSignatures(player.equipment.slots);
    const artifactRevision = resolveArtifactPanelRevision(player);
    const artifactSlotSignatures = canReuseArtifactCursor
        ? previousCursor.artifactSlotSignatures
        : buildArtifactSlotSignatures(resolveArtifactPanelSlots(player));
    const techniqueSignature = buildTechniquePanelSignature(player);
    const actionIds = canReuseActionCursor
        ? previousCursor.actionIds
        : player.actions.actions.map((entry) => entry.id);
    const actionEntrySignatures = canReuseActionCursor
        ? previousCursor.actionEntrySignatures
        : buildActionEntrySignatures(player.actions.actions);
    const buffIds = canReuseBuffCursor
        ? previousCursor.buffIds
        : currentBuffs.map((entry) => entry.buffId);
    const buffEntrySignatures = canReuseBuffCursor
        ? previousCursor.buffEntrySignatures
        : buildBuffEntrySignatures(currentBuffs);
    const attrSignature = previousCursor && reuse.attrSignature === true
        ? previousCursor.attrSignature
        : reuse.attrSignatureMode === 'realm_progress'
            ? buildRealmProgressPanelSignature(player)
            : buildAttrPanelSignature(player);
    const actionSignature = previousCursor && reuse.actionSignature === true
        ? previousCursor.actionSignature
        : buildActionPanelSignature(player);
    if (previousCursor
        && previousCursor.inventoryRevision === player.inventory.revision
        && previousCursor.inventoryCapacity === player.inventory.capacity
        && previousCursor.inventorySize === player.inventory.items.length
        && previousCursor.inventorySlotSignatures === inventorySlotSignatures
        && previousCursor.equipmentRevision === player.equipment.revision
        && previousCursor.equipmentSlotSignatures === equipmentSlotSignatures
        && previousCursor.artifactRevision === artifactRevision
        && previousCursor.artifactSlotSignatures === artifactSlotSignatures
        && previousCursor.techniqueRevision === player.techniques.revision
        && previousCursor.techniqueSignature === techniqueSignature
        && previousCursor.attrRevision === player.attrs.revision
        && previousCursor.actionRevision === player.actions.revision
        && previousCursor.actionIds === actionIds
        && previousCursor.actionEntrySignatures === actionEntrySignatures
        && previousCursor.buffRevision === player.buffs.revision
        && previousCursor.buffIds === buffIds
        && previousCursor.buffEntrySignatures === buffEntrySignatures
        && previousCursor.attrSignature === attrSignature
        && previousCursor.actionSignature === actionSignature
        && previousCursor.buffSignature === buffSignature) {
        return previousCursor;
    }
    return {
        inventoryRevision: player.inventory.revision,
        inventoryCapacity: player.inventory.capacity,
        inventorySize: player.inventory.items.length,
        inventorySlotSignatures,
        equipmentRevision: player.equipment.revision,
        equipmentSlotSignatures,
        artifactRevision,
        artifactSlotSignatures,
        techniqueRevision: player.techniques.revision,
        techniqueSignature,
        attrRevision: player.attrs.revision,
        actionRevision: player.actions.revision,
        actionIds,
        actionEntrySignatures,
        buffRevision: player.buffs.revision,
        buffIds,
        buffEntrySignatures,
        attrSignature,
        actionSignature,
        buffSignature,
    };
}

export function buildAttrPanelSignature(player: ProjectorPlayerLike): string {
    const attr = player.attrs;
    const realm = player.realm ?? null;
    return [
        attr.revision,
        attr.stage ?? '',
        player.boneAgeBaseYears,
        resolveLifeElapsedDayBucket(player.lifeElapsedTicks),
        player.lifespanYears ?? '',
        realm?.progress ?? '',
        realm?.progressToNext ?? '',
        realm?.breakthroughReady === true ? 1 : 0,
        stableShallowSignature(attr.baseAttrs),
        stableShallowSignature(attr.finalAttrs),
        stableShallowSignature(attr.numericStats),
        stableShallowSignature(attr.ratioDivisors),
        resolveCraftEffectStatsSignature(attr.craftEffectStats),
        resolveProjectedComprehensionSpeedRate(player),
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

/** 修为推进只改变属性面板中的进度字段时，使用轻量游标，避免重复 hash 整个属性面板。 */
export function buildRealmProgressPanelSignature(player: ProjectorPlayerLike): string {
    const realm = player.realm ?? null;
    return `realm-progress:${player.attrs.revision}|${realm?.progress ?? ''}|${realm?.progressToNext ?? ''}|${realm?.breakthroughReady === true ? 1 : 0}`;
}

export function resolveCraftEffectStatsSignature(stats: CraftEffectStatsPatch | null | undefined): string {
    const normalized = cloneCraftEffectStats(stats);
    return CRAFT_EFFECT_SKILL_KINDS.map((skillKind) => {
        const block = normalized[skillKind];
        return CRAFT_EFFECT_KINDS.map((effectKind) => block[effectKind]).join(',');
    }).join(';');
}

export function resolveLifeElapsedDayBucket(value: unknown): number {
    const normalizedTicks = Number(value);
    if (!Number.isFinite(normalizedTicks) || normalizedTicks <= 0) {
        return 0;
    }
    return Math.floor(normalizedTicks / Math.max(1, GAME_DAY_TICKS));
}

export function resolveProjectedComprehensionSpeedRate(player: ProjectorPlayerLike): number {
    const normalized = Number(player.comprehensionSpeedRate);
    return Number.isFinite(normalized) ? normalized : 0;
}

export function resolvePlayerSpecialStatsSignature(stats: PlayerSpecialStats): string {
    return [
        stats.foundation,
        stats.rootFoundation,
        stats.bodyTrainingLevel,
        stats.combatExp,
        stats.comprehension,
        stats.luck,
    ].join(',');
}

export function buildCraftSkillSignature(skill: unknown): string {
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

export function buildAttrBonusesSignature(bonuses: AttrBonus[]): string {
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

export function buildActionPanelSignature(player: ProjectorPlayerLike): string {
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
        normalizeCombatAttackIntensity(player.combat.combatAttackIntensity),
        player.combat.cultivationActive === true ? 1 : 0,
        player.combat.senseQiActive === true ? 1 : 0,
        player.combat.wangQiActive === true ? 1 : 0,
        buildAutoUsePillsSignature(player.combat.autoUsePills),
        buildCombatTargetingRulesSignature(player.combat.combatTargetingRules),
    ].join('|');
}

export function buildTechniquePanelSignature(player: ProjectorPlayerLike): string {
    return buildStableProtocolSignature({
        revision: player.techniques.revision,
        cultivatingTechId: player.techniques.cultivatingTechId ?? null,
        bodyTraining: player.bodyTraining ?? null,
        pendingComprehensions: clonePendingComprehensions(
            player.pendingTechniqueComprehensions,
            (player as { transmissionJob?: unknown }).transmissionJob,
        ),
    });
}

export function buildAutoUsePillsSignature(configs: AutoUsePillConfig[] | null | undefined): string {
    return Array.isArray(configs) ? stableShallowSignature(configs) : '';
}

export function buildCombatTargetingRulesSignature(rules: CombatTargetingRules | null | undefined): string {
    return rules ? stableShallowSignature(rules) : '';
}

export function buildBuffListSignature(revision: number, buffs: VisibleBuffState[]): string {
    return `${revision}|${buffs.map((entry) => [
        entry.buffId,
        entry.name,
        entry.stacks,
        entry.presentationScale ?? '',
    ].join(':')).join(';')}`;
}

export function buildEquipmentSlotSignatures(slots: ProjectorPlayerLike['equipment']['slots']): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of slots) {
        signatures[entry.slot] = buildStableProtocolSignature(entry.item ?? null);
    }
    return signatures;
}

export function buildArtifactSlotSignatures(slots: NonNullable<ProjectorPlayerLike['artifacts']>['slots']): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of slots) {
        signatures[entry.slot] = buildStableProtocolSignature({
            unlocked: entry.unlocked === true,
            enabled: entry.enabled !== false,
            qi: Math.max(0, Number(entry.qi) || 0),
            maxQi: Math.max(0, Number(entry.maxQi) || 0),
            item: entry.item ?? null,
        });
    }
    return signatures;
}

export function buildActionEntrySignatures(actions: ProjectedActionEntry[]): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of actions) {
        const { cooldownLeft: _cd, ...rest } = entry;
        signatures[entry.id] = buildStableProtocolSignature(rest);
    }
    return signatures;
}

export function buildBuffEntrySignatures(buffs: VisibleBuffState[]): Record<string, string> {
    const signatures: Record<string, string> = {};
    for (const entry of buffs) {
        const { remainingTicks: _rt, ...rest } = entry;
        signatures[entry.buffId] = buildStableProtocolSignature(rest);
    }
    return signatures;
}

export function buildStableProtocolSignature(value: unknown): string {
    return stableShallowSignature(value);
}

export function stableShallowSignature(value: unknown): string {
    return String(stableShallowHash(value));
}

/** FNV-1a 32-bit hash 常量 */

/** 递归 FNV-1a 数值 hash，替代字符串拼接签名。 */
export function stableShallowHash(value: unknown): number {
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

export function fnvHashString(str: string): number {
    let hash = FNV_OFFSET_BASIS;
    for (let i = 0; i < str.length; i += 1) {
        hash ^= str.charCodeAt(i);
        hash = Math.imul(hash, FNV_PRIME);
    }
    return hash >>> 0;
}

export function fnvHashNumber(num: number): number {
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

export function fnvMix(hash: number, value: number): number {
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


export function resolveAttrPanelChangeKind(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): AttrPanelChangeKind {
    const otherFieldsUnchanged = previousAttr.revision === player.attrs.revision
        && previousAttr.stage === player.attrs.stage
        && previousAttr.boneAgeBaseYears === player.boneAgeBaseYears
        && resolveLifeElapsedDayBucket(previousAttr.lifeElapsedTicks) === resolveLifeElapsedDayBucket(player.lifeElapsedTicks)
        && previousAttr.lifespanYears === player.lifespanYears
        && isSameCraftSkillState(previousAttr.alchemySkill, player.alchemySkill)
        && isSameCraftSkillState(previousAttr.forgingSkill, player.forgingSkill)
        && isSameCraftSkillState(previousAttr.buildingSkill, player.buildingSkill)
        && isSameCraftSkillState(previousAttr.gatherSkill, player.gatherSkill)
        && isSameCraftSkillState(previousAttr.enhancementSkill, player.enhancementSkill)
        && isSameCraftSkillState(previousAttr.miningSkill, player.miningSkill)
        && isSameCraftSkillState(previousAttr.formationSkill, player.formationSkill)
        && isSameCraftSkillState(previousAttr.transmissionSkill, player.transmissionSkill)
        && isSameCraftEffectStats(previousAttr.craftEffectStats, player.attrs.craftEffectStats)
        && previousAttr.comprehensionSpeedRate === resolveProjectedComprehensionSpeedRate(player)
        && isSameSpecialStats(previousAttr.specialStats, resolvePlayerSpecialStatsCached(player))
        && isSameAttrBonuses(previousAttr.bonuses, buildAttrBonuses(player));
    if (!otherFieldsUnchanged) {
        return 'full';
    }
    return previousAttr.realmProgress !== player.realm?.progress
        || previousAttr.realmProgressToNext !== player.realm?.progressToNext
        || previousAttr.realmBreakthroughReady !== player.realm?.breakthroughReady
        ? 'realm_progress'
        : 'none';
}

export function canReuseAttrPanelSlice(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): boolean {
    return resolveAttrPanelChangeKind(previousAttr, player) === 'none';
}

export function patchRealmProgressAttrPanelSlice(previousAttr: ProjectedAttrPanelState, player: ProjectorPlayerLike): ProjectedAttrPanelState {
    return {
        ...previousAttr,
        revision: player.attrs.revision,
        realmProgress: player.realm?.progress,
        realmProgressToNext: player.realm?.progressToNext,
        realmBreakthroughReady: player.realm?.breakthroughReady,
    };
}

export function isSameCraftEffectStats(left: CraftEffectStatsPatch | null | undefined, right: CraftEffectStatsPatch | null | undefined): boolean {
    for (const skillKind of CRAFT_EFFECT_SKILL_KINDS) {
        const leftBlock = left?.[skillKind];
        const rightBlock = right?.[skillKind];
        for (const effectKind of CRAFT_EFFECT_KINDS) {
            if ((Number(leftBlock?.[effectKind]) || 0) !== (Number(rightBlock?.[effectKind]) || 0)) {
                return false;
            }
        }
    }
    return true;
}

export function canReuseActionPanelSlice(previousAction: ProjectedActionPanelState, player: ProjectorPlayerLike): boolean {
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
        && previousAction.combatAttackIntensity === normalizeCombatAttackIntensity(player.combat.combatAttackIntensity)
        && previousAction.cultivationActive === player.combat.cultivationActive
        && previousAction.senseQiActive === player.combat.senseQiActive
        && previousAction.wangQiActive === (player.combat.wangQiActive === true);
}

export function canReuseBuffPanelSlice(previousBuff: ProjectedPanelState['buff'], player: ProjectorPlayerLike): boolean {
    return previousBuff.revision === player.buffs.revision
        && isSameBuffList(previousBuff.buffs, projectVisiblePlayerBuffs(player));
}

export function captureInventoryPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['inventory'] {
    return {
        revision: player.inventory.revision,
        capacity: player.inventory.capacity,
        items: player.inventory.items.map((entry) => cloneSyncedItemStack(entry)),
        cooldowns: Array.isArray(player.inventory.cooldowns)
            ? player.inventory.cooldowns.map((entry) => ({ ...entry }))
            : undefined,
        serverTick: Number.isFinite(Number(player.inventory.serverTick))
            ? Math.max(0, Math.trunc(Number(player.inventory.serverTick) || 0))
            : undefined,
    };
}

export function captureEquipmentPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['equipment'] {
    return {
        revision: player.equipment.revision,
        slots: player.equipment.slots.map((entry) => ({
            slot: entry.slot,
            item: entry.item ? cloneSyncedItemStack(entry.item) : null,
        })),
    };
}

export function captureArtifactPanelSlice(player: ProjectorPlayerLike): ProjectedPanelState['artifact'] {
    return {
        revision: resolveArtifactPanelRevision(player),
        slots: resolveArtifactPanelSlots(player).map((entry) => ({
            slot: entry.slot,
            unlocked: entry.unlocked === true,
            enabled: entry.enabled !== false,
            qi: Math.max(0, Number(entry.qi) || 0),
            maxQi: Math.max(0, Number(entry.maxQi) || 0),
            item: entry.item ? cloneSyncedItemStack(entry.item) : null,
        })),
    };
}

export function resolveArtifactPanelRevision(player: ProjectorPlayerLike): number {
    return Math.max(1, Math.trunc(Number(player.artifacts?.revision ?? 1) || 1));
}

export function resolveArtifactPanelSlots(player: ProjectorPlayerLike): NonNullable<ProjectorPlayerLike['artifacts']>['slots'] {
    return Array.isArray(player.artifacts?.slots) ? player.artifacts.slots : [];
}

export function captureTechniquePanelSlice(
    player: ProjectorPlayerLike,
    previous?: ProjectedPanelState['technique'] | null,
): ProjectedPanelState['technique'] {
    const sourceTechniques = player.techniques.techniques;
    return {
        revision: player.techniques.revision,
        techniques: reuseTechniquePanelEntries(sourceTechniques, previous?.techniques),
        cultivatingTechId: player.techniques.cultivatingTechId,
        bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : null,
        pendingComprehensions: clonePendingComprehensions(player.pendingTechniqueComprehensions, player.transmissionJob),
    };
}

/**
 * 功法 revision 可能因单个功法经验推进而每息变化；静态功法条目仍然共享同一份模板引用。
 * 逐条比较后复用未变化的前帧快照，避免为数百个功法重复 clone 和深层 diff。
 */
export function reuseTechniquePanelEntries(
    source: TechniqueUpdateEntryView[],
    previous: TechniqueUpdateEntryView[] | null | undefined,
): TechniqueUpdateEntryView[] {
    if (!Array.isArray(previous) || previous.length === 0) {
        return source.map((entry) => cloneTechniqueEntry(entry));
    }

    const sameOrder = previous.length === source.length
        && source.every((entry, index) => previous[index]?.techId === entry.techId);
    if (sameOrder) {
        return source.map((entry, index) => {
            const previousEntry = previous[index];
            return previousEntry && isSameTechniqueEntry(previousEntry, entry)
                ? previousEntry
                : cloneTechniqueEntry(entry);
        });
    }

    const previousById = new Map(previous.map((entry) => [entry.techId, entry]));
    return source.map((entry) => {
        const previousEntry = previousById.get(entry.techId);
        return previousEntry && isSameTechniqueEntry(previousEntry, entry)
            ? previousEntry
            : cloneTechniqueEntry(entry);
    });
}

export function captureAttrPanelSlice(player: ProjectorPlayerLike): ProjectedAttrPanelState {
    return {
        revision: player.attrs.revision,
        stage: player.attrs.stage,
        baseAttrs: cloneAttributes(player.attrs.baseAttrs),
        bonuses: buildAttrBonuses(player),
        finalAttrs: cloneAttributes(player.attrs.finalAttrs),
        numericStats: cloneNumericStats(player.attrs.numericStats),
        ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
        craftEffectStats: cloneCraftEffectStats(player.attrs.craftEffectStats),
        comprehensionSpeedRate: resolveProjectedComprehensionSpeedRate(player),
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

export function captureActionPanelSlice(player: ProjectorPlayerLike): ProjectedActionPanelState {
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
        combatAttackIntensity: normalizeCombatAttackIntensity(player.combat.combatAttackIntensity),
        cultivationActive: player.combat.cultivationActive,
        senseQiActive: player.combat.senseQiActive,
        wangQiActive: player.combat.wangQiActive === true,
    };
}

export function captureBuffPanelSlice(
    player: ProjectorPlayerLike,
    projectedBuffs?: VisibleBuffState[],
): ProjectedPanelState['buff'] {
    return { revision: player.buffs.revision, buffs: projectedBuffs ?? projectVisiblePlayerBuffs(player) };
}

export function combineProjectorState(worldState: WorldStateSlice, playerState: PlayerStateSlice): ProjectorState {
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

export function captureProjectorState(
    view: ProjectorViewLike,
    player: ProjectorPlayerLike,
    resolveMapName?: ((mapId: string | null | undefined) => string | null) | null,
): ProjectorState {
    return combineProjectorState(captureWorldState(view, resolveMapName), capturePlayerState(player));
}
