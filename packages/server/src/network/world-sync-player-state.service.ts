import { Injectable } from '@nestjs/common';
import {
  EQUIP_SLOTS,
  calcTechniqueFinalSpecialStatBonus,
  cloneNumericRatioDivisors,
  cloneNumericStats,
} from '@mud/shared';
import { projectVisiblePlayerBuffs } from '../runtime/player/player-buff-projection.helpers';

/** player sync state 服务：承接 bootstrap self 状态与相关只读转换。 */
@Injectable()
export class WorldSyncPlayerStateService {
  buildPlayerSyncState(player, view, unlockedMinimapIds) {
    return buildPlayerSyncState(player, view, unlockedMinimapIds);
  }
}

function buildPlayerSyncState(player, view, unlockedMinimapIds) {
  const specialStats = resolvePlayerSpecialStats(player);
  return {
    id: player.playerId,
    name: player.name,
    displayName: player.displayName,
    online: true,
    inWorld: true,
    senseQiActive: player.combat.senseQiActive,
    autoRetaliate: player.combat.autoRetaliate,
    autoBattleStationary: player.combat.autoBattleStationary,
    allowAoePlayerHit: player.combat.allowAoePlayerHit,
    autoIdleCultivation: player.combat.autoIdleCultivation,
    autoSwitchCultivation: player.combat.autoSwitchCultivation,
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
      balances: Array.isArray(player.wallet?.balances)
        ? player.wallet.balances.map((entry) => ({
          walletType: typeof entry?.walletType === 'string' ? entry.walletType.trim() : '',
          balance: Math.max(0, Math.trunc(Number(entry?.balance ?? 0))),
          frozenBalance: Math.max(0, Math.trunc(Number(entry?.frozenBalance ?? 0))),
          version: Math.max(1, Math.trunc(Number(entry?.version ?? 1))),
        })).filter((entry) => entry.walletType)
        : [],
    },
    marketStorage: {
      items: [],
    },
    equipment: buildEquipmentRecord(player.equipment.slots),
    techniques: player.techniques.techniques.map((entry) => toBootstrapTechniqueState(entry)),
    bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : undefined,
    alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
    gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
    enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
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
    autoBattleSkills: player.combat.autoBattleSkills.map((entry) => ({ ...entry })),
    autoUsePills: player.combat.autoUsePills.map((entry) => ({
      ...entry,
      conditions: Array.isArray(entry.conditions) ? entry.conditions.map((condition) => ({ ...condition })) : [],
    })),
    combatTargetingRules: player.combat.combatTargetingRules ? { ...player.combat.combatTargetingRules } : undefined,
    autoBattleTargetingMode: player.combat.autoBattleTargetingMode,
    combatTargetId: player.combat.combatTargetId ?? undefined,
    combatTargetLocked: player.combat.combatTargetLocked,
    cultivatingTechId: player.techniques.cultivatingTechId ?? undefined,
    unlockedMinimapIds,
  };
}

function resolvePlayerSpecialStats(player) {
  const techniqueSpecialStats = calcTechniqueFinalSpecialStatBonus(player.techniques?.techniques ?? []);
  return {
    foundation: Math.max(0, Math.trunc(Number(player.foundation ?? 0) || 0)),
    rootFoundation: Math.max(0, Math.trunc(Number(player.rootFoundation ?? 0) || 0)),
    bodyTrainingLevel: Math.max(0, Math.trunc(Number(player.bodyTraining?.level ?? 0) || 0)),
    combatExp: Math.max(0, Math.trunc(Number(player.combatExp ?? 0) || 0)),
    comprehension: Math.max(0, Math.trunc(Number(player.comprehension ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.comprehension ?? 0) || 0)),
    luck: Math.max(0, Math.trunc(Number(player.luck ?? 0) || 0))
      + Math.max(0, Math.trunc(Number(techniqueSpecialStats.luck ?? 0) || 0)),
  };
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

function toBootstrapTechniqueState(entry) {
  return {
    techId: entry.techId,
    level: entry.level ?? 1,
    exp: entry.exp ?? 0,
    expToNext: entry.expToNext ?? 0,
    skillsEnabled: entry.skillsEnabled !== false,
  };
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
  const stack = {
    itemId: entry.itemId,
    count: entry.count,
  };
  return normalizedEnhanceLevel > 0 ? { ...stack, enhanceLevel: normalizedEnhanceLevel } : stack;
}

function cloneActionEntry(source) {
  return { ...source };
}

function cloneTemporaryBuff(source) {
  return {
    ...source,
    attrs: source.attrs ? { ...source.attrs } : undefined,
    stats: source.stats ? { ...source.stats } : undefined,
    qiProjection: source.qiProjection?.map((entry) => ({ ...entry })),
  };
}

function toQuestRuntimeState(source) {
  return {
    id: source.id,
    status: source.status,
    progress: Math.max(0, Math.trunc(Number(source.progress ?? 0))),
  };
}

function cloneRealmState(source) {
  if (!source) {
    return null;
  }
  return {
    ...source,
    breakthroughItems: source.breakthroughItems.map((entry) => ({ ...entry })),
    breakthrough: source.breakthrough
      ? {
        ...source.breakthrough,
        requirements: source.breakthrough.requirements.map((entry) => ({ ...entry })),
      }
      : undefined,
    heavenGate: cloneHeavenGateState(source.heavenGate),
  };
}

function cloneHeavenGateState(source) {
  if (!source) {
    return null;
  }
  return {
    unlocked: source.unlocked,
    severed: source.severed.slice(),
    roots: cloneHeavenGateRoots(source.roots),
    entered: source.entered,
    averageBonus: source.averageBonus,
  };
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
