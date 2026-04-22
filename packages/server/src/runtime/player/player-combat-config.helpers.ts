import type {
  AutoUsePillCondition,
  AutoUsePillConfig,
  CombatRelationBlockedReason,
  CombatRelationResolution,
  CombatRelationTargetKind,
  CombatTargetingRuleKey,
  CombatTargetingRuleScope,
  CombatTargetingRules,
} from '@mud/shared';

import {
  PVP_SHA_DEMONIZED_STACK_THRESHOLD,
  PVP_SHA_INFUSION_BUFF_ID,
} from '../../constants/gameplay/pvp';

type AutoUsePillConditionLike = AutoUsePillCondition & Record<string, unknown>;

interface PlayerCombatLike {
  allowAoePlayerHit?: boolean;
  retaliatePlayerTargetId?: string | null;
  combatTargetingRules?: CombatTargetingRules | null;
}

interface PlayerBuffLike {
  buffId?: string | null;
  stacks?: number | null;
  remainingTicks?: number | null;
}

interface PlayerTargetLike {
  playerId: string;
  combat?: PlayerCombatLike | null;
  buffs?: PlayerBuffLike[] | null;
}

interface CombatRelationTargetFlags {
  sameParty?: boolean;
  sameSect?: boolean;
  passivelyHostile?: boolean;
  retaliator?: boolean;
}

type CombatRelationTargetInput =
  | {
    kind: 'player';
    target: PlayerTargetLike | null | undefined;
    flags?: CombatRelationTargetFlags | null;
  }
  | {
    kind: 'monster';
  }
  | {
    kind: 'terrain';
  };

interface CanonicalCombatTargetingRules extends CombatTargetingRules {
  hostile: CombatTargetingRuleKey[];
  friendly: CombatTargetingRuleKey[];
  includeNormalMonsters: boolean;
  includeEliteMonsters: boolean;
  includeBosses: boolean;
  includePlayers: boolean;
}

function cloneAutoUsePillCondition(input: AutoUsePillConditionLike): AutoUsePillConditionLike {
  return {
    ...input,
  };
}

function cloneAutoUsePillEntry(input: AutoUsePillConfig): AutoUsePillConfig {
  return {
    ...input,
    conditions: Array.isArray(input.conditions)
      ? input.conditions.map((condition) => cloneAutoUsePillCondition(condition as AutoUsePillConditionLike))
      : [],
  };
}

export function cloneAutoUsePillList(input: AutoUsePillConfig[] | null | undefined): AutoUsePillConfig[] {
  return Array.isArray(input) ? input.map((entry) => cloneAutoUsePillEntry(entry)) : [];
}

function isSameAutoUsePillCondition(
  left: AutoUsePillConditionLike | null | undefined,
  right: AutoUsePillConditionLike | null | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }

  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    if (!Object.prototype.hasOwnProperty.call(right, key) || left[key] !== right[key]) {
      return false;
    }
  }
  return true;
}

function isSameAutoUsePillEntry(left: AutoUsePillConfig | null | undefined, right: AutoUsePillConfig | null | undefined): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  if (left.itemId !== right.itemId) {
    return false;
  }

  const leftConditions = Array.isArray(left.conditions) ? left.conditions : [];
  const rightConditions = Array.isArray(right.conditions) ? right.conditions : [];
  if (leftConditions.length !== rightConditions.length) {
    return false;
  }
  for (let index = 0; index < leftConditions.length; index += 1) {
    if (
      !isSameAutoUsePillCondition(
        leftConditions[index] as AutoUsePillConditionLike,
        rightConditions[index] as AutoUsePillConditionLike,
      )
    ) {
      return false;
    }
  }
  return true;
}

export function isSameAutoUsePillList(
  previous: AutoUsePillConfig[] | null | undefined,
  current: AutoUsePillConfig[] | null | undefined,
): boolean {
  if (previous === current) {
    return true;
  }
  const left = Array.isArray(previous) ? previous : [];
  const right = Array.isArray(current) ? current : [];
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (!isSameAutoUsePillEntry(left[index], right[index])) {
      return false;
    }
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function normalizePersistedAutoUsePills(input: unknown): AutoUsePillConfig[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.itemId === 'string' && entry.itemId.trim().length > 0)
    .map((entry) => ({
      itemId: String(entry.itemId).trim(),
      conditions: Array.isArray(entry.conditions)
        ? entry.conditions
            .filter((condition): condition is AutoUsePillConditionLike => isRecord(condition) && typeof condition.type === 'string')
            .map((condition) => cloneAutoUsePillCondition(condition))
        : [],
    }));
}

function buildDefaultCombatTargetingRules(includeAllPlayersHostile = false): CanonicalCombatTargetingRules {
  const hostile: CombatTargetingRuleKey[] = ['monster', 'demonized_players', 'retaliators', 'terrain'];
  if (includeAllPlayersHostile && !hostile.includes('all_players')) {
    hostile.push('all_players');
  }
  const friendly: CombatTargetingRuleKey[] = ['non_hostile_players'];
  return {
    hostile,
    friendly,
    includeNormalMonsters: hostile.includes('monster'),
    includeEliteMonsters: hostile.includes('monster'),
    includeBosses: hostile.includes('monster'),
    includePlayers: hostile.includes('all_players'),
  };
}

function hasLegacyMonsterOverride(input: Partial<CombatTargetingRules> | null | undefined): boolean {
  return input?.includeNormalMonsters !== undefined
    || input?.includeEliteMonsters !== undefined
    || input?.includeBosses !== undefined;
}

function resolveLegacyMonsterEnabled(input: Partial<CombatTargetingRules> | null | undefined, defaults: CombatTargetingRuleKey[]): boolean {
  if (hasLegacyMonsterOverride(input)) {
    return input?.includeNormalMonsters === true
      || input?.includeEliteMonsters === true
      || input?.includeBosses === true;
  }
  return defaults.includes('monster');
}

function buildLegacyHostileFallback(
  input: Partial<CombatTargetingRules> | null | undefined,
  defaults: CombatTargetingRuleKey[],
): CombatTargetingRuleKey[] {
  const fallback: CombatTargetingRuleKey[] = defaults.filter((entry) => entry !== 'monster' && entry !== 'all_players');
  if (resolveLegacyMonsterEnabled(input, defaults)) {
    fallback.unshift('monster');
  }
  const includePlayers = input?.includePlayers ?? defaults.includes('all_players');
  if (includePlayers && !fallback.includes('all_players')) {
    fallback.push('all_players');
  }
  return fallback;
}

function normalizeCombatTargetingScope(
  input: CombatTargetingRuleKey[] | null | undefined,
  scope: CombatTargetingRuleScope,
  fallback: CombatTargetingRuleKey[],
): CombatTargetingRuleKey[] {
  const allowed = scope === 'hostile'
    ? new Set<CombatTargetingRuleKey>(['monster', 'all_players', 'demonized_players', 'retaliators', 'party', 'sect', 'terrain'])
    : new Set<CombatTargetingRuleKey>(['monster', 'all_players', 'retaliators', 'non_hostile_players', 'terrain', 'party', 'sect']);
  const source = Array.isArray(input) ? input : fallback;
  const normalized: CombatTargetingRuleKey[] = [];
  const seen = new Set<CombatTargetingRuleKey>();

  for (const raw of source) {
    if (!allowed.has(raw) || seen.has(raw)) {
      continue;
    }
    seen.add(raw);
    normalized.push(raw);
  }
  return normalized;
}

export function cloneCombatTargetingRules(
  input: CombatTargetingRules | null | undefined,
): CanonicalCombatTargetingRules | undefined {
  if (!input) {
    return undefined;
  }

  const defaults = buildDefaultCombatTargetingRules(input.includePlayers === true);
  const hostile = normalizeCombatTargetingScope(
    input.hostile,
    'hostile',
    buildLegacyHostileFallback(input, defaults.hostile),
  );
  const friendly = normalizeCombatTargetingScope(input.friendly, 'friendly', defaults.friendly);

  return {
    hostile,
    friendly,
    includeNormalMonsters: hostile.includes('monster'),
    includeEliteMonsters: hostile.includes('monster'),
    includeBosses: hostile.includes('monster'),
    includePlayers: hostile.includes('all_players'),
  };
}

export function isSameCombatTargetingRules(
  left: CombatTargetingRules | null | undefined,
  right: CombatTargetingRules | null | undefined,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return left === right;
  }

  const leftHostile = Array.isArray(left.hostile) ? left.hostile : [];
  const rightHostile = Array.isArray(right.hostile) ? right.hostile : [];
  const leftFriendly = Array.isArray(left.friendly) ? left.friendly : [];
  const rightFriendly = Array.isArray(right.friendly) ? right.friendly : [];
  if (leftHostile.length !== rightHostile.length || leftFriendly.length !== rightFriendly.length) {
    return false;
  }
  for (let index = 0; index < leftHostile.length; index += 1) {
    if (leftHostile[index] !== rightHostile[index]) {
      return false;
    }
  }
  for (let index = 0; index < leftFriendly.length; index += 1) {
    if (leftFriendly[index] !== rightFriendly[index]) {
      return false;
    }
  }
  return left.includeNormalMonsters === right.includeNormalMonsters
    && left.includeEliteMonsters === right.includeEliteMonsters
    && left.includeBosses === right.includeBosses
    && left.includePlayers === right.includePlayers;
}

export function normalizePersistedCombatTargetingRules(input: unknown): CanonicalCombatTargetingRules | undefined {
  if (!isRecord(input)) {
    return undefined;
  }

  return cloneCombatTargetingRules({
    hostile: Array.isArray(input.hostile) ? (input.hostile as CombatTargetingRuleKey[]) : undefined,
    friendly: Array.isArray(input.friendly) ? (input.friendly as CombatTargetingRuleKey[]) : undefined,
    includeNormalMonsters: input.includeNormalMonsters === true ? true : input.includeNormalMonsters === false ? false : undefined,
    includeEliteMonsters: input.includeEliteMonsters === true ? true : input.includeEliteMonsters === false ? false : undefined,
    includeBosses: input.includeBosses === true ? true : input.includeBosses === false ? false : undefined,
    includePlayers: input.includePlayers === true ? true : input.includePlayers === false ? false : undefined,
  });
}

export function isPlayerPassivelyHostileTarget(target: PlayerTargetLike | null | undefined): boolean {
  return Array.isArray(target?.buffs)
    && target.buffs.some((buff) =>
      buff?.buffId === PVP_SHA_INFUSION_BUFF_ID
      && Math.max(0, Math.round(buff?.stacks ?? 0)) > PVP_SHA_DEMONIZED_STACK_THRESHOLD
      && Math.max(0, Math.round(buff?.remainingTicks ?? 0)) > 0,
    );
}

function buildEffectiveCombatTargetingRules(attacker: PlayerTargetLike | null | undefined): CanonicalCombatTargetingRules {
  const normalized = cloneCombatTargetingRules(attacker?.combat?.combatTargetingRules);
  const fallback = buildDefaultCombatTargetingRules(attacker?.combat?.allowAoePlayerHit === true);
  const hostile = [...(normalized?.hostile ?? fallback.hostile)];
  if (attacker?.combat?.allowAoePlayerHit === true && !hostile.includes('all_players')) {
    hostile.push('all_players');
  }
  const friendly = [...(normalized?.friendly ?? fallback.friendly)];
  return {
    hostile,
    friendly,
    includeNormalMonsters: hostile.includes('monster'),
    includeEliteMonsters: hostile.includes('monster'),
    includeBosses: hostile.includes('monster'),
    includePlayers: hostile.includes('all_players'),
  };
}

function buildNeutralResolution(reason: CombatRelationBlockedReason = 'rule_not_matched'): CombatRelationResolution {
  return {
    relation: 'neutral',
    matchedRules: [],
    blockedReason: reason,
  };
}

function buildBlockedResolution(reason: CombatRelationBlockedReason): CombatRelationResolution {
  return {
    relation: 'blocked',
    matchedRules: [],
    blockedReason: reason,
  };
}

function resolveRelationMatchesForPlayerTarget(
  rules: CanonicalCombatTargetingRules,
  attacker: PlayerTargetLike,
  target: PlayerTargetLike,
  flags?: CombatRelationTargetFlags | null,
): CombatRelationResolution {
  if (attacker.playerId === target.playerId) {
    return buildBlockedResolution('self_target');
  }
  const effectiveFlags: CombatRelationTargetFlags = {
    sameParty: flags?.sameParty === true,
    sameSect: flags?.sameSect === true,
    passivelyHostile: flags?.passivelyHostile ?? isPlayerPassivelyHostileTarget(target),
    retaliator: flags?.retaliator ?? attacker.combat?.retaliatePlayerTargetId === target.playerId,
  };
  const hostileMatches: CombatTargetingRuleKey[] = [];
  const friendlyMatches: CombatTargetingRuleKey[] = [];
  const isPartyOrSectTarget = effectiveFlags.sameParty === true || effectiveFlags.sameSect === true;
  const playerExplicitlyHostile = effectiveFlags.retaliator === true
    || effectiveFlags.passivelyHostile === true
    || isPartyOrSectTarget === true;
  if (rules.hostile.includes('all_players')) {
    hostileMatches.push('all_players');
  }
  if (effectiveFlags.retaliator && rules.hostile.includes('retaliators')) {
    hostileMatches.push('retaliators');
  }
  if (effectiveFlags.passivelyHostile && rules.hostile.includes('demonized_players')) {
    hostileMatches.push('demonized_players');
  }
  if (effectiveFlags.sameParty && rules.hostile.includes('party')) {
    hostileMatches.push('party');
  }
  if (effectiveFlags.sameSect && rules.hostile.includes('sect')) {
    hostileMatches.push('sect');
  }
  if (hostileMatches.length > 0) {
    return {
      relation: 'hostile',
      matchedRules: hostileMatches,
    };
  }
  if (rules.friendly.includes('all_players')) {
    friendlyMatches.push('all_players');
  }
  if (effectiveFlags.retaliator && rules.friendly.includes('retaliators')) {
    friendlyMatches.push('retaliators');
  }
  if (!playerExplicitlyHostile && rules.friendly.includes('non_hostile_players')) {
    friendlyMatches.push('non_hostile_players');
  }
  if (effectiveFlags.sameParty && rules.friendly.includes('party')) {
    friendlyMatches.push('party');
  }
  if (effectiveFlags.sameSect && rules.friendly.includes('sect')) {
    friendlyMatches.push('sect');
  }
  if (friendlyMatches.length > 0) {
    return {
      relation: 'friendly',
      matchedRules: friendlyMatches,
    };
  }
  return buildNeutralResolution();
}

function resolveRelationMatchesForRuleOnlyTarget(
  rules: CanonicalCombatTargetingRules,
  hostileRule: CombatTargetingRuleKey,
  friendlyRule: CombatTargetingRuleKey,
): CombatRelationResolution {
  if (rules.hostile.includes(hostileRule)) {
    return {
      relation: 'hostile',
      matchedRules: [hostileRule],
    };
  }
  if (rules.friendly.includes(friendlyRule)) {
    return {
      relation: 'friendly',
      matchedRules: [friendlyRule],
    };
  }
  return buildNeutralResolution();
}

export function resolveCombatRelation(
  attacker: PlayerTargetLike | null | undefined,
  input: CombatRelationTargetInput,
): CombatRelationResolution {
  if (!attacker) {
    return buildBlockedResolution('target_missing');
  }
  const rules = buildEffectiveCombatTargetingRules(attacker);
  if (input.kind === 'player') {
    if (!input.target) {
      return buildBlockedResolution('target_missing');
    }
    return resolveRelationMatchesForPlayerTarget(rules, attacker, input.target, input.flags);
  }
  if (input.kind === 'monster') {
    return resolveRelationMatchesForRuleOnlyTarget(rules, 'monster', 'monster');
  }
  return resolveRelationMatchesForRuleOnlyTarget(rules, 'terrain', 'terrain');
}

export function resolveCombatRelationForTargetKind(
  attacker: PlayerTargetLike | null | undefined,
  targetKind: CombatRelationTargetKind,
): CombatRelationResolution {
  if (targetKind === 'player') {
    return buildNeutralResolution();
  }
  if (targetKind === 'monster') {
    return resolveCombatRelation(attacker, { kind: 'monster' });
  }
  return resolveCombatRelation(attacker, { kind: 'terrain' });
}

export function isHostileCombatRelationResolution(input: CombatRelationResolution | null | undefined): boolean {
  return input?.relation === 'hostile';
}

export function canPlayerDealDamageToPlayer(
  attacker: PlayerTargetLike | null | undefined,
  target: PlayerTargetLike | null | undefined,
): boolean {
  return isHostileCombatRelationResolution(resolveCombatRelation(attacker, {
    kind: 'player',
    target,
  }));
}
