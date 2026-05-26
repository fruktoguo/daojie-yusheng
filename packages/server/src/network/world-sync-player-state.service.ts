/**
 * 本文件负责服务端侧的权威运行、网络、持久化或运维辅助逻辑，是生产主线的一部分。
 *
 * 维护时要保持鉴权、恢复、幂等和数据真源边界清晰，避免把冷路径工具或查询逻辑卷入 tick 热路径。
 */
import { Injectable } from '@nestjs/common';
import {
  EQUIP_SLOTS,
  applyEquipmentAttributeEffectivenessToItemStack,
  calcTechniqueFinalSpecialStatBonus,
  cloneNumericRatioDivisors,
  cloneNumericStats,
} from '@mud/shared';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';
import { projectHeavenGateState, projectRealmState } from '../runtime/player/player-realm-projection.helpers';

const autoBattleSkillCloneCache = new WeakMap<any[], any[]>();
const autoUsePillCloneCache = new WeakMap<any[], any[]>();

/** player sync state 服务：承接 bootstrap self 状态与相关只读转换。 */
@Injectable()
export class WorldSyncPlayerStateService {
  buildPlayerSyncState(player, view, unlockedMinimapIds) {
    return buildPlayerSyncState(player, view, unlockedMinimapIds);
  }
}

function buildPlayerSyncState(player, view, unlockedMinimapIds) {
  const specialStats = resolvePlayerSpecialStats(player);
  const walletBalances = [];
  for (const entry of Array.isArray(player.wallet?.balances) ? player.wallet.balances : []) {
    const walletType = typeof entry?.walletType === 'string' ? entry.walletType.trim() : '';
    if (!walletType) {
      continue;
    }
    walletBalances.push({
      walletType,
      balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
      frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
      version: Math.max(1, Math.trunc(Number(entry?.version ?? 1))),
    });
  }
  return {
    id: player.playerId,
    name: player.name,
    displayName: player.displayName,
    online: true,
    inWorld: true,
    senseQiActive: player.combat.senseQiActive,
    wangQiActive: player.combat.wangQiActive === true,
    autoRetaliate: player.combat.autoRetaliate,
    autoBattleStationary: player.combat.autoBattleStationary,
    allowAoePlayerHit: player.combat.allowAoePlayerHit,
    autoIdleCultivation: player.combat.autoIdleCultivation,
    autoSwitchCultivation: player.combat.autoSwitchCultivation,
    autoRootFoundation: player.combat.autoRootFoundation === true,
    cultivationActive: player.combat.cultivationActive,
    instanceId: player.instanceId || view.instance.instanceId,
    mapId: view.instance.templateId,
    x: player.x,
    y: player.y,
    facing: player.facing,
    viewRange: Math.max(1, Math.round(player.attrs.numericStats.viewRange)),
    hp: player.hp,
    maxHp: player.maxHp,
    qi: player.qi,
    dead: player.hp <= 0,
    foundation: player.foundation,
    rootFoundation: Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)),
    combatExp: player.combatExp,
    comprehension: specialStats.comprehension,
    luck: specialStats.luck,
    boneAgeBaseYears: player.boneAgeBaseYears,
    lifeElapsedTicks: player.lifeElapsedTicks,
    lifespanYears: player.lifespanYears,
    baseAttrs: cloneAttributes(player.attrs.baseAttrs),
    temporaryBuffs: projectVisiblePlayerBuffs(player),
    finalAttrs: cloneAttributes(player.attrs.finalAttrs),
    numericStats: cloneNumericStats(player.attrs.numericStats),
    ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
    inventory: {
      capacity: player.inventory.capacity,
      items: player.inventory.items.map((entry) => toItemStackState(entry)),
    },
    wallet: {
      balances: walletBalances,
    },
    marketStorage: {
      items: [],
    },
    equipment: buildEquipmentRecord(player.equipment.slots),
    techniques: player.techniques.techniques.map((entry) => toBootstrapTechniqueState(entry)),
    bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : undefined,
    alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
    forgingSkill: player.forgingSkill ? { ...player.forgingSkill } : undefined,
    buildingSkill: player.buildingSkill ? { ...player.buildingSkill } : undefined,
    gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
    enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
    miningSkill: player.miningSkill ? { ...player.miningSkill } : undefined,
    formationSkill: player.formationSkill ? { ...player.formationSkill } : undefined,
    enhancementSkillLevel: player.enhancementSkillLevel,
    actions: player.actions.actions.map((entry) => toActionDefinition(entry)),
    quests: player.quests.quests.map((entry) => toQuestRuntimeState(entry)),
    realm: cloneRealmState(player.realm) ?? undefined,
    realmLv: player.realm?.realmLv,
    realmName: player.realm?.name,
    realmStage: player.realm?.shortName || undefined,
    realmReview: player.realm?.review,
    breakthroughReady: player.realm?.breakthroughReady,
    heavenGate: cloneHeavenGateState(player.heavenGate) ?? undefined,
    spiritualRoots: cloneHeavenGateRoots(player.spiritualRoots) ?? undefined,
    autoBattle: player.combat.autoBattle,
    autoBattleSkills: cloneAutoBattleSkills(player.combat.autoBattleSkills),
    autoUsePills: cloneAutoUsePills(player.combat.autoUsePills),
    combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
    autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
    combatTargetId: player.combat.combatTargetId ?? undefined,
    combatTargetLocked: player.combat.combatTargetLocked,
    cultivatingTechId: player.techniques.cultivatingTechId ?? undefined,
    unlockedMinimapIds,
  };
}

function cloneAutoBattleSkills(source) {
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }
  const cached = autoBattleSkillCloneCache.get(source);
  if (cached && isSameAutoBattleSkillList(cached, source)) {
    return cached;
  }
  const cloned = source.map((entry) => ({ ...entry }));
  autoBattleSkillCloneCache.set(source, cloned);
  return cloned;
}

function cloneAutoUsePills(source) {
  if (!Array.isArray(source) || source.length === 0) {
    return [];
  }
  const cached = autoUsePillCloneCache.get(source);
  if (cached && isSameAutoUsePillList(cached, source)) {
    return cached;
  }
  const cloned = source.map((entry) => ({
    ...entry,
    conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
  }));
  autoUsePillCloneCache.set(source, cloned);
  return cloned;
}

function isSameAutoBattleSkillList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? {};
    const b = right[index] ?? {};
    if (a.skillId !== b.skillId
      || a.enabled !== b.enabled
      || a.skillEnabled !== b.skillEnabled
      || a.order !== b.order) {
      return false;
    }
  }
  return true;
}

function isSameAutoUsePillList(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? {};
    const b = right[index] ?? {};
    if (a.itemId !== b.itemId
      || a.enabled !== b.enabled
      || a.threshold !== b.threshold
      || a.cooldownTicks !== b.cooldownTicks
      || !isSameConditionList(a.conditions, b.conditions)) {
      return false;
    }
  }
  return true;
}

function isSameConditionList(left, right) {
  const aList = Array.isArray(left) ? left : [];
  const bList = Array.isArray(right) ? right : [];
  if (aList.length !== bList.length) {
    return false;
  }
  for (let index = 0; index < aList.length; index += 1) {
    const a = aList[index] ?? {};
    const b = bList[index] ?? {};
    if (a.type !== b.type || a.op !== b.op || a.value !== b.value) {
      return false;
    }
  }
  return true;
}

function resolvePlayerSpecialStats(player) {
  const techniqueSpecialStats = calcTechniqueFinalSpecialStatBonus(player.techniques?.techniques ?? []);
  const equipmentSpecialStats = resolveEquipmentSpecialStats(player);
  return {
    foundation: Math.max(0, Math.trunc(Number(player.foundation ?? 0) || 0)),
    rootFoundation: Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)),
    bodyTrainingLevel: Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0)),
    combatExp: Math.max(0, Math.trunc(Number(player.combatExp ?? 0) || 0)),
    comprehension: Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.comprehension ?? 0) || 0)),
    luck: Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(equipmentSpecialStats.luck ?? 0) || 0))
      + Math.trunc(Number(player.fengShuiLuck ?? 0) || 0),
  };
}

function resolveEquipmentSpecialStats(player) {
  const result = { comprehension: 0, luck: 0 };
  const realmLv = Math.max(1, Math.floor(Number(player?.realm?.realmLv ?? 1) || 1));
  for (const entry of player?.equipment?.slots ?? []) {
    const item = entry?.item;
    if (!item) {
      continue;
    }
    const effectiveItem = applyEquipmentAttributeEffectivenessToItemStack(item, realmLv);
    result.comprehension += Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.comprehension ?? 0) || 0));
    result.luck += Math.max(0, Math.trunc(Number(effectiveItem.equipSpecialStats?.luck ?? 0) || 0));
  }
  return result;
}

function normalizeActionEntry(entry) {
  const normalizedId = entry.id.startsWith('npc_quests:')
    ? `npc:${entry.id.slice('npc_quests:'.length)}`
    : entry.id;
  if (normalizedId === entry.id) {
    return cloneActionEntry(entry);
  }
  return {
    ...cloneActionEntry(entry),
    id: normalizedId,
  };
}

function buildEquipmentRecord(entries) {
  const record = {
    weapon: null,
    head: null,
    body: null,
    legs: null,
    accessory: null,
  };
  for (const slot of EQUIP_SLOTS) {
    const entry = entries.find((candidate) => candidate.slot === slot);
    record[slot] = entry?.item ? toItemStackState(entry.item) : null;
  }
  return record;
}

export function projectBootstrapTechniqueStateForSync(entry) {
  return {
    techId: entry.techId,
    name: entry.name,
    level: entry.level ?? 1,
    exp: entry.exp ?? 0,
    expToNext: entry.expToNext ?? 0,
    realmLv: entry.realmLv,
    realm: entry.realm,
    skillsEnabled: entry.skillsEnabled !== false,
    grade: entry.grade ?? null,
    category: entry.category ?? null,
    skills: Array.isArray(entry.skills) ? entry.skills : [],
    layers: Array.isArray(entry.layers) ? entry.layers : [],
  };
}

function toBootstrapTechniqueState(entry) {
  return projectBootstrapTechniqueStateForSync(entry);
}

function toActionDefinition(entry) {
  const normalizedEntry = normalizeActionEntry(entry);
  const action: Record<string, unknown> = {
    id: normalizedEntry.id,
    cooldownLeft: normalizedEntry.cooldownLeft ?? 0,
    autoBattleEnabled: normalizedEntry.autoBattleEnabled !== false,
    autoBattleOrder: normalizedEntry.autoBattleOrder ?? undefined,
    skillEnabled: normalizedEntry.skillEnabled !== false,
  };
  if (typeof normalizedEntry.name === 'string' && normalizedEntry.name.trim()) {
    action.name = normalizedEntry.name;
  }
  if (typeof normalizedEntry.type === 'string' && normalizedEntry.type.trim()) {
    action.type = normalizedEntry.type;
  }
  if (typeof normalizedEntry.desc === 'string') {
    action.desc = normalizedEntry.desc;
  }
  if (Number.isFinite(Number(normalizedEntry.range))) {
    action.range = Math.max(0, Math.trunc(Number(normalizedEntry.range)));
  }
  if (normalizedEntry.requiresTarget !== undefined) {
    action.requiresTarget = normalizedEntry.requiresTarget === true;
  }
  if (typeof normalizedEntry.targetMode === 'string' && normalizedEntry.targetMode.trim()) {
    action.targetMode = normalizedEntry.targetMode;
  }
  return action;
}

function toItemStackState(entry) {
  const normalizedEnhanceLevel = Number.isFinite(Number(entry.enhanceLevel))
    ? Math.max(0, Math.trunc(Number(entry.enhanceLevel)))
    : 0;
  const itemInstanceId = typeof entry.itemInstanceId === 'string' && entry.itemInstanceId.trim()
    ? entry.itemInstanceId.trim()
    : undefined;
  const stack = {
    itemId: entry.itemId,
    ...(itemInstanceId ? { itemInstanceId } : {}),
    count: entry.count,
  };
  return normalizedEnhanceLevel > 0 ? { ...stack, enhanceLevel: normalizedEnhanceLevel } : stack;
}

function cloneActionEntry(source) {
  return { ...source };
}

function toQuestRuntimeState(source) {
  return {
    id: source.id,
    status: source.status,
    progress: Math.max(0, Math.trunc(Number(source.progress ?? 0))),
  };
}

function cloneRealmState(source) {
  return projectRealmState(source);
}

function cloneHeavenGateState(source) {
  return projectHeavenGateState(source);
}

function cloneHeavenGateRoots(source) {
  if (!source) {
    return null;
  }
  return {
    metal: source.metal,
    wood: source.wood,
    water: source.water,
    fire: source.fire,
    earth: source.earth,
  };
}

function cloneAttributes(source) {
  return {
    constitution: source.constitution,
    spirit: source.spirit,
    perception: source.perception,
    talent: source.talent,
    strength: source.strength ?? source.comprehension ?? 0,
    meridians: source.meridians ?? source.luck ?? 0,
  };
}
