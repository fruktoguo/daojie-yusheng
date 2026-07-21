import type { CombatDamageSummaryGroup, CombatEffect, CombatNoticePayload } from '@mud/shared';

export const SKILL_CAST_DETAIL_TARGET_LIMIT = 8;

export interface MutableDamageSummaryGroup extends CombatDamageSummaryGroup {
  firstDamage: number | null;
  uniform: boolean;
}

export interface PlayerSkillCastSummary {
  enemy: MutableDamageSummaryGroup;
  tile: MutableDamageSummaryGroup;
}

export function shouldAggregatePlayerSkillPresentation(
  targetCount: number,
  effects: unknown,
): boolean {
  return Math.max(0, Math.trunc(Number(targetCount) || 0)) > SKILL_CAST_DETAIL_TARGET_LIMIT
    && Array.isArray(effects)
    && effects.some((effect) => effect?.type === 'damage');
}

export function createPlayerSkillCastSummary(): PlayerSkillCastSummary {
  return {
    enemy: createMutableDamageSummaryGroup(),
    tile: createMutableDamageSummaryGroup(),
  };
}

export function recordPlayerSkillEnemySummary(
  summary: PlayerSkillCastSummary,
  appliedDamage: unknown,
  defeated = false,
): void {
  recordDamageSummaryGroup(summary.enemy, appliedDamage);
  if (defeated) {
    summary.enemy.defeatedCount = (summary.enemy.defeatedCount ?? 0) + 1;
  }
}

export function recordPlayerSkillTileSummary(
  summary: PlayerSkillCastSummary,
  appliedDamage: unknown,
  destroyed = false,
): void {
  recordDamageSummaryGroup(summary.tile, appliedDamage);
  if (destroyed) {
    summary.tile.destroyedCount = (summary.tile.destroyedCount ?? 0) + 1;
  }
}

export function buildPlayerSkillDamageSummaryEffect(input: {
  summary: PlayerSkillCastSummary;
  x: number;
  y: number;
  color?: string;
}): CombatEffect | null {
  const enemy = finalizeDamageSummaryGroup(input.summary.enemy);
  const tile = finalizeDamageSummaryGroup(input.summary.tile);
  if (!enemy && !tile) {
    return null;
  }
  return {
    type: 'damage_summary',
    x: Math.round(Number(input.x) || 0),
    y: Math.round(Number(input.y) || 0),
    color: input.color,
    ...(enemy ? { enemy } : undefined),
    ...(tile ? { tile } : undefined),
  };
}

export function buildPlayerSkillSummaryNotice(
  summary: PlayerSkillCastSummary,
  skillName: string,
): CombatNoticePayload | null {
  const enemy = finalizeDamageSummaryGroup(summary.enemy);
  const tile = finalizeDamageSummaryGroup(summary.tile);
  if (!enemy && !tile) {
    return null;
  }
  return {
    caster: '你',
    target: '',
    skill: skillName,
    summary: {
      ...(enemy ? { enemy } : undefined),
      ...(tile ? { tile } : undefined),
    },
  };
}

function createMutableDamageSummaryGroup(): MutableDamageSummaryGroup {
  return {
    targetCount: 0,
    hitCount: 0,
    totalDamage: 0,
    firstDamage: null,
    uniform: true,
  };
}

function recordDamageSummaryGroup(group: MutableDamageSummaryGroup, appliedDamage: unknown): void {
  const damage = Math.max(0, Math.round(Number(appliedDamage) || 0));
  group.targetCount += 1;
  if (damage <= 0) {
    return;
  }
  group.hitCount += 1;
  group.totalDamage += damage;
  if (group.firstDamage === null) {
    group.firstDamage = damage;
  } else if (group.firstDamage !== damage) {
    group.uniform = false;
  }
}

function finalizeDamageSummaryGroup(group: MutableDamageSummaryGroup): CombatDamageSummaryGroup | null {
  if (group.targetCount <= 0) {
    return null;
  }
  return {
    targetCount: group.targetCount,
    hitCount: group.hitCount,
    totalDamage: Math.max(0, Math.round(group.totalDamage)),
    ...(group.defeatedCount ? { defeatedCount: group.defeatedCount } : undefined),
    ...(group.destroyedCount ? { destroyedCount: group.destroyedCount } : undefined),
    ...(group.uniform && group.firstDamage !== null ? { uniformDamage: group.firstDamage } : undefined),
  };
}
