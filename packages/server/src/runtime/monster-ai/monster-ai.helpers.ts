import {
  buildEffectiveTargetingGeometry,
  calcQiCostWithOutputLimit,
  chebyshevDistance,
  computeAffectedCellsFromAnchor,
  resolveSkillRequiresTarget,
  type SkillDef,
} from '@mud/shared';
import type { MonsterAiTarget, MonsterRuntimeLike } from './monster-ai.types.js';

export function resolveSkillRange(skill: SkillDef): number {
  const targetingRange = skill.targeting?.range;
  if (typeof targetingRange === 'number' && Number.isFinite(targetingRange)) {
    return Math.max(1, Math.round(targetingRange));
  }
  return Math.max(1, Math.round(skill.range));
}

export function resolveMonsterSkillQiCost(monster: MonsterRuntimeLike, skill: SkillDef): number {
  return Math.round(
    calcQiCostWithOutputLimit(
      Math.max(0, Math.round(Number(skill?.cost) || 0)),
      Math.max(0, monster?.numericStats?.maxQiOutputPerTick ?? 0),
    ),
  );
}

export function buildEffectiveMonsterSkillGeometry(monster: MonsterRuntimeLike, skill: SkillDef) {
  return buildEffectiveTargetingGeometry(
    {
      range: resolveSkillRange(skill),
      shape: skill.targeting?.shape ?? 'single',
      radius: skill.targeting?.radius,
      innerRadius: skill.targeting?.innerRadius,
      width: skill.targeting?.width,
      height: skill.targeting?.height,
      checkerParity: skill.targeting?.checkerParity,
    },
    {
      extraRange: Math.max(0, Math.floor(monster.numericStats?.extraRange ?? 0)),
      extraArea: Math.max(0, Math.floor(monster.numericStats?.extraArea ?? 0)),
    },
  );
}

export function buildMonsterSkillAffectedCells(
  monster: MonsterRuntimeLike,
  skill: SkillDef,
  anchor: { x: number; y: number },
): Array<{ x: number; y: number }> {
  const geometry = buildEffectiveMonsterSkillGeometry(monster, skill);
  const shape = geometry.shape ?? 'single';
  if (shape === 'single') {
    return chebyshevDistance({ x: monster.x, y: monster.y }, { x: anchor.x, y: anchor.y }) <= geometry.range
      ? [{ x: anchor.x, y: anchor.y }]
      : [];
  }
  return computeAffectedCellsFromAnchor({ x: monster.x, y: monster.y }, anchor, geometry);
}

export function monsterSkillHasHostileTargetEffect(skill: SkillDef): boolean {
  const effects = Array.isArray(skill?.effects) ? skill.effects : [];
  return effects.some(
    (effect) =>
      effect?.type === 'damage' ||
      (effect?.type === 'buff' && effect.target !== 'self' && effect.target !== 'allies'),
  );
}

export function isMonsterTargetInsideSelfAnchoredSkillArea(
  monster: MonsterRuntimeLike,
  skill: SkillDef,
  target: MonsterAiTarget | null,
): boolean {
  if (!target) {
    return false;
  }
  const anchor = { x: monster.x, y: monster.y };
  return buildMonsterSkillAffectedCells(monster, skill, anchor).some(
    (cell) => cell.x === target.x && cell.y === target.y,
  );
}

export function entityHasActiveBuff(buffs: unknown, buffId: string, minStacks = 1): boolean {
  const list = Array.isArray(buffs)
    ? buffs
    : typeof buffs === 'object' && buffs !== null && Array.isArray((buffs as any).buffs)
      ? (buffs as any).buffs
      : [];
  return list.some(
    (buff: any) =>
      buff?.buffId === buffId &&
      (buff.remainingTicks === undefined || buff.remainingTicks > 0) &&
      Math.max(1, Math.round(Number(buff.stacks) || 1)) >= minStacks,
  );
}

export function getEntityBuffStacks(buffs: unknown, buffId: string): number {
  const list = Array.isArray(buffs)
    ? buffs
    : typeof buffs === 'object' && buffs !== null && Array.isArray((buffs as any).buffs)
      ? (buffs as any).buffs
      : [];
  let total = 0;
  for (const buff of list) {
    if (buff?.buffId !== buffId) {
      continue;
    }
    if (buff.remainingTicks !== undefined && buff.remainingTicks <= 0) {
      continue;
    }
    total += Math.max(1, Math.round(Number(buff.stacks) || 1));
  }
  return total;
}

export function matchesMonsterSkillConditions(monster: MonsterRuntimeLike, skill: SkillDef): boolean {
  const group = skill?.monsterCast?.conditions;
  if (!group || !Array.isArray(group.items) || group.items.length === 0) {
    return true;
  }
  const matches = (condition: any) => matchesMonsterSkillCondition(monster, condition);
  return group.mode === 'any' ? group.items.some(matches) : group.items.every(matches);
}

export function matchesMonsterSkillCondition(monster: MonsterRuntimeLike, condition: any): boolean {
  switch (condition?.type) {
    case 'hp_ratio': {
      const maxHp = Math.max(1, Math.round(monster.maxHp));
      const ratio = maxHp > 0 ? monster.hp / maxHp : 0;
      return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
    }
    case 'qi_ratio': {
      const maxQi = Math.max(0, Math.round(monster.numericStats?.maxQi ?? 0));
      const qi = Math.max(0, Math.round(monster.qi ?? 0));
      const ratio = maxQi > 0 ? qi / maxQi : 0;
      return condition.op === '<=' ? ratio <= condition.value : ratio >= condition.value;
    }
    case 'has_buff':
      return entityHasActiveBuff(monster.buffs, condition.buffId, condition.minStacks ?? 1);
    case 'is_cultivating':
    case 'target_kind':
      return condition.value === false;
    default:
      return true;
  }
}

export function canMonsterCastSkill(
  monster: MonsterRuntimeLike,
  skill: SkillDef,
  target: MonsterAiTarget | null,
  distance: number,
  currentTick: number,
): boolean {
  if (!matchesMonsterSkillConditions(monster, skill)) {
    return false;
  }
  const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
  if (resolveSkillRequiresTarget(skill) && distance > skillRange) {
    return false;
  }
  if (
    !resolveSkillRequiresTarget(skill) &&
    monsterSkillHasHostileTargetEffect(skill) &&
    !isMonsterTargetInsideSelfAnchoredSkillArea(monster, skill, target)
  ) {
    return false;
  }

  const qiCost = resolveMonsterSkillQiCost(monster, skill);
  if (qiCost > 0 && (monster.qi ?? 0) < qiCost) {
    return false;
  }

  const readyTick = monster.cooldownReadyTickBySkillId[skill.id] ?? 0;
  return currentTick >= readyTick;
}

export function pickFirstCastableMonsterSkill(
  monster: MonsterRuntimeLike,
  target: MonsterAiTarget | null,
  distance: number,
  currentTick: number,
  skillIds: readonly string[],
): SkillDef | null {
  for (const skillId of skillIds) {
    const skill = monster.skills.find((entry) => entry.id === skillId);
    if (!skill) {
      continue;
    }
    if (!canMonsterCastSkill(monster, skill, target, distance, currentTick)) {
      continue;
    }
    return skill;
  }
  return null;
}
