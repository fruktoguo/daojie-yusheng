/** 技能公式中的技艺等级变量解析与固定快照。 */
import {
  CRAFT_EFFECT_SKILL_KINDS,
  type CraftEffectSkillKind,
  type SkillFormulaVar,
} from '@mud/shared';

export type CombatCraftSkillLevels = Record<CraftEffectSkillKind, number>;

const FORMULA_VAR_TO_CRAFT_SKILL_KIND = {
  'caster.craft.alchemy.level': 'alchemy',
  'caster.craft.forging.level': 'forging',
  'caster.craft.enhancement.level': 'enhancement',
  'caster.craft.transmission.level': 'transmission',
  'caster.craft.gather.level': 'gather',
  'caster.craft.mining.level': 'mining',
  'caster.craft.building.level': 'building',
  'caster.craft.formation.level': 'formation',
} as const satisfies Partial<Record<SkillFormulaVar, CraftEffectSkillKind>>;

const PLAYER_SKILL_STATE_FIELD_BY_KIND = {
  alchemy: 'alchemySkill',
  forging: 'forgingSkill',
  enhancement: 'enhancementSkill',
  transmission: 'transmissionSkill',
  gather: 'gatherSkill',
  mining: 'miningSkill',
  building: 'buildingSkill',
  formation: 'formationSkill',
} as const satisfies Record<CraftEffectSkillKind, string>;

export function resolveCraftSkillKindFromFormulaVar(variable: unknown): CraftEffectSkillKind | null {
  if (typeof variable !== 'string' || !Object.hasOwn(FORMULA_VAR_TO_CRAFT_SKILL_KIND, variable)) {
    return null;
  }
  return FORMULA_VAR_TO_CRAFT_SKILL_KIND[variable as keyof typeof FORMULA_VAR_TO_CRAFT_SKILL_KIND];
}

export function resolveCombatantCraftSkillLevel(
  combatant: unknown,
  kind: CraftEffectSkillKind,
): number {
  const source = asRecord(combatant);
  const snapshot = asRecord(source?.craftSkillLevels);
  const snapshotLevel = normalizeLevel(snapshot?.[kind]);
  if (snapshotLevel !== null) {
    return snapshotLevel;
  }

  const state = asRecord(source?.[PLAYER_SKILL_STATE_FIELD_BY_KIND[kind]]);
  const stateLevel = normalizeLevel(state?.level);
  if (stateLevel !== null) {
    return stateLevel;
  }
  if (kind === 'enhancement') {
    return normalizeLevel(source?.enhancementSkillLevel) ?? 0;
  }
  return 0;
}

export function snapshotCombatantCraftSkillLevels(combatant: unknown): CombatCraftSkillLevels {
  const result = {} as CombatCraftSkillLevels;
  for (const kind of CRAFT_EFFECT_SKILL_KINDS) {
    result[kind] = resolveCombatantCraftSkillLevel(combatant, kind);
  }
  return result;
}

export function areCombatCraftSkillLevelsEqual(
  expected: CombatCraftSkillLevels | null | undefined,
  combatant: unknown,
): boolean {
  if (!expected) {
    return false;
  }
  for (const kind of CRAFT_EFFECT_SKILL_KINDS) {
    if (expected[kind] !== resolveCombatantCraftSkillLevel(combatant, kind)) {
      return false;
    }
  }
  return true;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function normalizeLevel(value: unknown): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : null;
}
