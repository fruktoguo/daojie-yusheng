import { Injectable } from '@nestjs/common';
import {
  DEFAULT_PLAYER_REALM_STAGE,
  EQUIP_SLOTS,
  PLAYER_REALM_CONFIG,
  TechniqueRealm,
  calcTechniqueFinalAttrBonus,
  cloneNumericRatioDivisors,
  cloneNumericStats,
} from '@mud/shared-next';

/** player sync state 服务：承接 bootstrap self 状态与相关只读转换。 */
@Injectable()
export class WorldSyncPlayerStateService {
  buildPlayerSyncState(player, view, unlockedMinimapIds) {
    return buildPlayerSyncState(player, view, unlockedMinimapIds);
  }
}

function buildPlayerSyncState(player, view, unlockedMinimapIds) {
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
    combatExp: player.combatExp,
    boneAgeBaseYears: player.boneAgeBaseYears,
    lifeElapsedTicks: player.lifeElapsedTicks,
    lifespanYears: player.lifespanYears,
    baseAttrs: cloneAttributes(player.attrs.baseAttrs),
    bonuses: buildAttrBonuses(player),
    temporaryBuffs: player.buffs.buffs.map((entry) => cloneTemporaryBuff(entry)),
    finalAttrs: cloneAttributes(player.attrs.finalAttrs),
    numericStats: cloneNumericStats(player.attrs.numericStats),
    ratioDivisors: cloneNumericRatioDivisors(player.attrs.ratioDivisors),
    inventory: {
      capacity: player.inventory.capacity,
      items: player.inventory.items.map((entry) => toItemStackState(entry)),
    },
    marketStorage: {
      items: [],
    },
    equipment: buildEquipmentRecord(player.equipment.slots),
    techniques: player.techniques.techniques.map((entry) => toTechniqueState(entry)),
    bodyTraining: player.bodyTraining ? { ...player.bodyTraining } : undefined,
    alchemySkill: player.alchemySkill ? { ...player.alchemySkill } : undefined,
    gatherSkill: player.gatherSkill ? { ...player.gatherSkill } : undefined,
    enhancementSkill: player.enhancementSkill ? { ...player.enhancementSkill } : undefined,
    enhancementSkillLevel: player.enhancementSkillLevel,
    actions: player.actions.actions.map((entry) => toActionDefinition(entry)),
    quests: player.quests.quests.map((entry) => cloneQuestState(entry)),
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

function toTechniqueState(entry) {
  const skills = entry.skills?.map((skill) => cloneTechniqueSkill(skill)) ?? [];
  return {
    techId: entry.techId,
    name: '',
    level: entry.level ?? 1,
    exp: entry.exp ?? 0,
    expToNext: entry.expToNext ?? 0,
    realmLv: entry.realmLv ?? 1,
    realm: entry.realm ?? TechniqueRealm.Entry,
    skillsEnabled: entry.skillsEnabled !== false,
    skills,
    grade: entry.grade ?? undefined,
    category: entry.category ?? undefined,
    layers: entry.layers?.map((layer) => ({
      level: layer.level,
      expToNext: layer.expToNext,
      attrs: layer.attrs ? { ...layer.attrs } : undefined,
    })),
    attrCurves: entry.attrCurves ? { ...entry.attrCurves } : undefined,
  };
}

function toActionDefinition(entry) {
  const normalizedEntry = normalizeActionEntry(entry);
  return {
    id: normalizedEntry.id,
    name: normalizedEntry.name ?? normalizedEntry.id,
    type: normalizedEntry.type ?? 'interact',
    desc: normalizedEntry.desc ?? '',
    cooldownLeft: normalizedEntry.cooldownLeft ?? 0,
    range: normalizedEntry.range ?? undefined,
    requiresTarget: normalizedEntry.requiresTarget ?? undefined,
    targetMode: normalizedEntry.targetMode ?? undefined,
    autoBattleEnabled: normalizedEntry.autoBattleEnabled ?? undefined,
    autoBattleOrder: normalizedEntry.autoBattleOrder ?? undefined,
    skillEnabled: normalizedEntry.skillEnabled ?? undefined,
  };
}

function toItemStackState(entry) {
  return {
    itemId: entry.itemId,
    name: entry.name ?? entry.itemId,
    type: entry.type ?? 'material',
    count: entry.count,
    desc: entry.desc ?? '',
    groundLabel: entry.groundLabel,
    grade: entry.grade,
    level: entry.level,
    equipSlot: entry.equipSlot,
    equipAttrs: entry.equipAttrs ? { ...entry.equipAttrs } : undefined,
    equipStats: entry.equipStats ? { ...entry.equipStats } : undefined,
    equipValueStats: entry.equipValueStats ? { ...entry.equipValueStats } : undefined,
    effects: entry.effects?.map((effect) => ({ ...effect })),
    healAmount: entry.healAmount,
    healPercent: entry.healPercent,
    qiPercent: entry.qiPercent,
    consumeBuffs: entry.consumeBuffs?.map((buff) => ({ ...buff })),
    tags: entry.tags?.slice(),
    mapUnlockId: entry.mapUnlockId,
    mapUnlockIds: entry.mapUnlockIds?.slice(),
    tileAuraGainAmount: entry.tileAuraGainAmount,
    allowBatchUse: entry.allowBatchUse,
  };
}

function cloneActionEntry(source) {
  return { ...source };
}

function cloneTechniqueSkill(source) {
  return {
    ...source,
    name: '',
    desc: '',
  };
}

function buildAttrBonuses(player) {
  const bonuses = [];
  const realmStage = player.realm?.stage ?? player.attrs.stage ?? DEFAULT_PLAYER_REALM_STAGE;
  const realmConfig = PLAYER_REALM_CONFIG[realmStage];
  if (realmConfig && hasNonZeroAttributes(realmConfig.attrBonus)) {
    bonuses.push({
      source: `realm:${realmStage}`,
      label: player.realm?.displayName ?? player.realm?.name ?? '境界',
      attrs: clonePartialAttributes(realmConfig.attrBonus),
    });
  }
  for (const technique of player.techniques.techniques) {
    const techniqueAttrs = calcTechniqueFinalAttrBonus([toTechniqueState(technique)]);
    if (!hasNonZeroAttributes(techniqueAttrs)) {
      continue;
    }
    bonuses.push({
      source: `technique:${technique.techId}`,
      label: technique.techId,
      attrs: clonePartialAttributes(techniqueAttrs),
    });
  }
  for (const slot of player.equipment.slots) {
    const item = slot.item;
    if (!item || (!hasNonZeroAttributes(item.equipAttrs) && !hasNonZeroPartialNumericStats(item.equipStats))) {
      continue;
    }
    bonuses.push({
      source: `equipment:${slot.slot}`,
      label: item.name ?? item.itemId ?? slot.slot,
      attrs: clonePartialAttributes(item.equipAttrs),
      stats: item.equipStats ? { ...item.equipStats } : undefined,
    });
  }
  for (const buff of player.buffs.buffs) {
    if (!hasNonZeroAttributes(buff.attrs) && !hasNonZeroPartialNumericStats(buff.stats) && !Array.isArray(buff.qiProjection)) {
      continue;
    }
    bonuses.push({
      source: `buff:${buff.buffId}`,
      label: buff.name ?? buff.buffId,
      attrs: clonePartialAttributes(buff.attrs),
      stats: buff.stats ? { ...buff.stats } : undefined,
      qiProjection: buff.qiProjection?.map((entry) => ({ ...entry })),
    });
  }
  for (const bonus of player.attrBonuses ?? []) {
    if (
      !hasNonZeroAttributes(bonus.attrs)
      && !hasNonZeroPartialNumericStats(bonus.stats)
      && !hasNonZeroPartialNumericStats(bonus.meta)
      && !Array.isArray(bonus.qiProjection)
    ) {
      continue;
    }
    bonuses.push({
      source: bonus.source,
      label: bonus.label,
      attrs: clonePartialAttributes(bonus.attrs),
      stats: bonus.stats ? { ...bonus.stats } : undefined,
      meta: bonus.meta ? { ...bonus.meta } : undefined,
      qiProjection: bonus.qiProjection?.map((entry) => ({ ...entry })),
    });
  }
  return bonuses;
}

function hasNonZeroAttributes(attrs) {
  if (!attrs) {
    return false;
  }
  return Object.values(attrs).some((value) => Number(value ?? 0) !== 0);
}

function hasNonZeroPartialNumericStats(stats) {
  if (!stats) {
    return false;
  }
  return Object.values(stats).some((value) => Number(value ?? 0) !== 0);
}

function clonePartialAttributes(attrs) {
  if (!attrs) {
    return undefined;
  }
  const clone = {};
  for (const [key, value] of Object.entries(attrs)) {
    if (typeof value === 'number') {
      clone[key] = value;
    }
  }
  return Object.keys(clone).length > 0 ? clone : undefined;
}

function cloneTemporaryBuff(source) {
  return {
    ...source,
    attrs: source.attrs ? { ...source.attrs } : undefined,
    stats: source.stats ? { ...source.stats } : undefined,
    qiProjection: source.qiProjection?.map((entry) => ({ ...entry })),
  };
}

function cloneQuestState(source) {
  return {
    ...source,
    rewardItemIds: source.rewardItemIds.slice(),
    rewards: source.rewards.map((entry) => ({ ...entry })),
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
    comprehension: source.comprehension,
    luck: source.luck,
  };
}
