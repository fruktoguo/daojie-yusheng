/**
 * 玩家技能被动效果投影。
 *
 * 技能被动只由已解锁且 skillEnabled=true 的技能提供；纯被动技能仍占技能格，
 * 但不进入主动施法或自动战斗。这里构建运行期预解析投影，避免 tick 内重复遍历全技能表。
 */
import {
  addCraftEffectStatsPatch,
  getSkillPassiveEffects,
  resolvePlayerFacingContentName,
  type CraftEffectStats,
  type SkillDef,
  type SkillPassiveBuffEffectDef,
  type SkillPassiveCultivationTileQiEffectDef,
  type SkillPassiveEffectDef,
  type VisibleBuffState,
} from '@mud/shared';

type PassiveTechniqueLike = {
  techId?: string;
  name?: string;
  level?: number;
  realmLv?: number;
  skills?: SkillDef[];
};

type PassivePlayerLike = {
  playerId?: string;
  realm?: { realmLv?: number } | null;
  realmLv?: number;
  techniques?: {
    revision?: number;
    techniques?: PassiveTechniqueLike[];
  } | null;
  combat?: {
    autoBattleSkills?: Array<{ skillId?: string; skillEnabled?: boolean }>;
  } | null;
};

type EnabledSkillPassiveEffect = {
  technique: PassiveTechniqueLike;
  skill: SkillDef;
  effect: SkillPassiveEffectDef;
  effectIndex: number;
};

type PassiveProfile = {
  techniquesRef: unknown;
  techniqueRevision: number;
  autoBattleSkillsRef: unknown;
  realmLv: number;
  passiveEffects: EnabledSkillPassiveEffect[];
  passiveBuffs: VisibleBuffState[];
  cultivationTileQiEffects: Array<EnabledSkillPassiveEffect & { effect: SkillPassiveCultivationTileQiEffectDef }>;
  craftEffectBuffs: Array<EnabledSkillPassiveEffect & { effect: SkillPassiveBuffEffectDef }>;
};

const passiveProfileCache = new WeakMap<object, PassiveProfile>();

export function collectEnabledSkillPassiveBuffs(player: PassivePlayerLike | null | undefined): readonly VisibleBuffState[] {
  return resolveEnabledSkillPassiveProfile(player).passiveBuffs;
}

export function addEnabledSkillPassiveCraftEffects(
  target: CraftEffectStats,
  player: PassivePlayerLike | null | undefined,
): void {
  for (const entry of resolveEnabledSkillPassiveProfile(player).craftEffectBuffs) {
    addCraftEffectStatsPatch(target, entry.effect.craftEffectStats);
  }
}

export function collectEnabledCultivationTileQiPassives(
  player: PassivePlayerLike | null | undefined,
): ReadonlyArray<EnabledSkillPassiveEffect & { effect: SkillPassiveCultivationTileQiEffectDef }> {
  return resolveEnabledSkillPassiveProfile(player).cultivationTileQiEffects;
}

function resolveEnabledSkillPassiveProfile(player: PassivePlayerLike | null | undefined): PassiveProfile {
  const holder = player && typeof player === 'object' ? player : null;
  const techniquesRef = holder?.techniques?.techniques ?? null;
  const techniqueRevision = Math.max(0, Math.trunc(Number(holder?.techniques?.revision ?? 0) || 0));
  const autoBattleSkillsRef = holder?.combat?.autoBattleSkills ?? null;
  const realmLv = resolvePlayerRealmLv(holder);

  if (holder) {
    const cached = passiveProfileCache.get(holder);
    if (cached
      && cached.techniquesRef === techniquesRef
      && cached.techniqueRevision === techniqueRevision
      && cached.autoBattleSkillsRef === autoBattleSkillsRef
      && cached.realmLv === realmLv) {
      return cached;
    }
  }

  const passiveEffects = collectEnabledSkillPassiveEffects(holder);
  const passiveBuffs: VisibleBuffState[] = [];
  const cultivationTileQiEffects: PassiveProfile['cultivationTileQiEffects'] = [];
  const craftEffectBuffs: PassiveProfile['craftEffectBuffs'] = [];

  for (const entry of passiveEffects) {
    if (entry.effect.type === 'buff') {
      passiveBuffs.push(toPassiveVisibleBuff(entry, realmLv));
      if (entry.effect.craftEffectStats) {
        craftEffectBuffs.push(entry as EnabledSkillPassiveEffect & { effect: SkillPassiveBuffEffectDef });
      }
      continue;
    }
    if (entry.effect.type === 'cultivation_tile_qi') {
      cultivationTileQiEffects.push(entry as EnabledSkillPassiveEffect & { effect: SkillPassiveCultivationTileQiEffectDef });
    }
  }

  const profile: PassiveProfile = {
    techniquesRef,
    techniqueRevision,
    autoBattleSkillsRef,
    realmLv,
    passiveEffects,
    passiveBuffs,
    cultivationTileQiEffects,
    craftEffectBuffs,
  };
  if (holder) {
    passiveProfileCache.set(holder, profile);
  }
  return profile;
}

function collectEnabledSkillPassiveEffects(player: PassivePlayerLike | null): EnabledSkillPassiveEffect[] {
  const techniques = Array.isArray(player?.techniques?.techniques) ? player.techniques.techniques : [];
  if (techniques.length === 0) {
    return [];
  }
  const enabledSkillIds = buildEnabledSkillIdSet(player);
  const result: EnabledSkillPassiveEffect[] = [];
  for (const technique of techniques) {
    const techniqueLevel = Math.max(1, Math.trunc(Number(technique?.level ?? 1) || 1));
    for (const skill of technique?.skills ?? []) {
      const skillId = typeof skill?.id === 'string' ? skill.id.trim() : '';
      if (!skillId || !enabledSkillIds.has(skillId)) {
        continue;
      }
      const unlockLevel = Math.max(1, Math.trunc(Number(skill.unlockLevel ?? 1) || 1));
      if (techniqueLevel < unlockLevel) {
        continue;
      }
      const effects = getSkillPassiveEffects(skill);
      for (let index = 0; index < effects.length; index += 1) {
        result.push({ technique, skill, effect: effects[index], effectIndex: index });
      }
    }
  }
  return result;
}

function buildEnabledSkillIdSet(player: PassivePlayerLike | null): Set<string> {
  const configs = Array.isArray(player?.combat?.autoBattleSkills) ? player.combat.autoBattleSkills : [];
  const enabled = new Set<string>();
  for (const entry of configs) {
    const skillId = typeof entry?.skillId === 'string' ? entry.skillId.trim() : '';
    if (skillId && entry.skillEnabled !== false) {
      enabled.add(skillId);
    }
  }
  if (enabled.size > 0 || configs.length > 0) {
    return enabled;
  }
  for (const technique of player?.techniques?.techniques ?? []) {
    for (const skill of technique?.skills ?? []) {
      if (typeof skill?.id === 'string' && skill.id.trim()) {
        enabled.add(skill.id.trim());
      }
    }
  }
  return enabled;
}

function toPassiveVisibleBuff(entry: EnabledSkillPassiveEffect, playerRealmLv: number): VisibleBuffState {
  const effect = entry.effect as SkillPassiveBuffEffectDef;
  const buffId = typeof effect.buffId === 'string' && effect.buffId.trim()
    ? effect.buffId.trim()
    : `passive:${entry.skill.id}:${entry.effectIndex + 1}`;
  const name = typeof effect.name === 'string' && effect.name.trim()
    ? effect.name.trim()
    : entry.skill.name;
  return {
    buffId,
    name: resolvePlayerFacingContentName(buffId, '未知被动', name),
    desc: effect.desc ?? entry.skill.desc,
    shortMark: effect.shortMark ?? (name.slice(0, 1) || '被'),
    category: effect.category ?? 'buff',
    visibility: effect.visibility ?? 'public',
    remainingTicks: 1,
    duration: 1,
    stacks: 1,
    maxStacks: Math.max(1, Math.trunc(Number(effect.maxStacks ?? 1) || 1)),
    sourceSkillId: entry.skill.id,
    sourceSkillName: resolvePlayerFacingContentName(entry.skill.id, '未知技能', entry.skill.name),
    realmLv: Math.max(1, Math.trunc(Number(entry.technique.realmLv ?? playerRealmLv) || playerRealmLv)),
    color: effect.color,
    attrs: effect.attrs,
    attrMode: effect.attrMode,
    stats: effect.stats,
    statMode: effect.statMode,
    qiProjection: effect.qiProjection,
    infiniteDuration: true,
    presentationScale: effect.presentationScale,
  };
}

function resolvePlayerRealmLv(player: PassivePlayerLike | null): number {
  return Math.max(1, Math.trunc(Number(player?.realm?.realmLv ?? player?.realmLv ?? 1) || 1));
}
