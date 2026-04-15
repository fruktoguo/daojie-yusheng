import {
  Attributes,
  gridDistance,
  NumericStats,
  PlayerState,
  SkillDef,
  SkillFormula,
  SkillFormulaVar,
  TemporaryBuffState,
} from '@mud/shared';

export interface SkillFormulaMonsterLike {
  x?: number;
  y?: number;
  hp: number;
  maxHp: number;
  qi: number;
  temporaryBuffs?: TemporaryBuffState[];
}

export type SkillFormulaResolvedTarget =
  | { kind: 'monster'; x: number; y: number; monster: SkillFormulaMonsterLike }
  | { kind: 'player'; x: number; y: number; player: PlayerState }
  | { kind: 'container'; x: number; y: number }
  | { kind: 'tile'; x: number; y: number; tileType?: string };

export interface SkillFormulaContext {
  player?: PlayerState;
  monsterCaster?: SkillFormulaMonsterLike;
  skill: SkillDef;
  techLevel: number;
  targetCount: number;
  casterStats: NumericStats;
  casterAttrs?: Attributes;
  target?: SkillFormulaResolvedTarget;
  targetStats?: NumericStats;
  targetAttrs?: Attributes;
}

export interface SkillFormulaHelpers {
  getPlayerMaxQi(player: PlayerState): number;
}

export function parseBuffStackVariable(
  variable: SkillFormulaVar,
): { side: 'caster' | 'target'; buffId: string } | null {
  if (variable.startsWith('caster.buff.') && variable.endsWith('.stacks')) {
    return {
      side: 'caster',
      buffId: variable.slice('caster.buff.'.length, -'.stacks'.length),
    };
  }
  if (variable.startsWith('target.buff.') && variable.endsWith('.stacks')) {
    return {
      side: 'target',
      buffId: variable.slice('target.buff.'.length, -'.stacks'.length),
    };
  }
  return null;
}

export function resolveBuffStackVariable(
  side: 'caster' | 'target',
  buffId: string,
  context: SkillFormulaContext,
): number {
  if (side === 'caster') {
    return context.player?.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks
      ?? context.monsterCaster?.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks
      ?? 0;
  }
  if (context.target?.kind === 'player') {
    return context.target.player.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
  }
  if (context.target?.kind === 'monster') {
    return context.target.monster.temporaryBuffs?.find((buff) => buff.buffId === buffId && buff.remainingTicks > 0)?.stacks ?? 0;
  }
  return 0;
}

export function resolveSkillFormulaVar(
  variable: SkillFormulaVar,
  context: SkillFormulaContext,
  helpers: SkillFormulaHelpers,
): number {
  const parsedBuffVar = parseBuffStackVariable(variable);
  if (parsedBuffVar) {
    return resolveBuffStackVariable(parsedBuffVar.side, parsedBuffVar.buffId, context);
  }
  switch (variable) {
    case 'techLevel':
      return context.techLevel;
    case 'targetCount':
      return context.targetCount;
    case 'caster.hp':
      return context.player?.hp ?? context.monsterCaster?.hp ?? 0;
    case 'caster.maxHp':
      return context.player?.maxHp ?? context.monsterCaster?.maxHp ?? 0;
    case 'caster.qi':
      return context.player?.qi ?? context.monsterCaster?.qi ?? 0;
    case 'caster.maxQi':
      return Math.max(0, Math.round(context.casterStats.maxQi));
    case 'target.debuffCount':
      return Math.max(0, (context.target?.kind === 'player'
        ? context.target.player.temporaryBuffs
        : context.target?.kind === 'monster'
          ? context.target.monster.temporaryBuffs
          : []
      )?.filter((buff) => buff.remainingTicks > 0 && buff.category === 'debuff').length ?? 0);
    case 'target.distance': {
      const origin = context.player
        ?? (typeof context.monsterCaster?.x === 'number' && typeof context.monsterCaster?.y === 'number'
          ? { x: context.monsterCaster.x, y: context.monsterCaster.y }
          : { x: 0, y: 0 });
      return context.target ? gridDistance(origin, context.target) : 0;
    }
    case 'target.hp':
      return context.target?.kind === 'monster'
        ? context.target.monster.hp
        : context.target?.kind === 'player'
          ? context.target.player.hp
          : 0;
    case 'target.maxHp':
      return context.target?.kind === 'monster'
        ? context.target.monster.maxHp
        : context.target?.kind === 'player'
          ? context.target.player.maxHp
          : 0;
    case 'target.qi':
      return context.target?.kind === 'player' ? context.target.player.qi : 0;
    case 'target.maxQi':
      return context.target?.kind === 'player'
        ? Math.max(0, helpers.getPlayerMaxQi(context.target.player))
        : 0;
    default:
      if (variable.startsWith('caster.attr.')) {
        const key = variable.slice('caster.attr.'.length) as keyof Attributes;
        return typeof context.casterAttrs?.[key] === 'number' ? context.casterAttrs[key] as number : 0;
      }
      if (variable.startsWith('target.attr.')) {
        const key = variable.slice('target.attr.'.length) as keyof Attributes;
        return typeof context.targetAttrs?.[key] === 'number' ? context.targetAttrs[key] as number : 0;
      }
      if (variable.startsWith('caster.stat.')) {
        const key = variable.slice('caster.stat.'.length) as keyof NumericStats;
        return typeof context.casterStats[key] === 'number' ? context.casterStats[key] as number : 0;
      }
      if (variable.startsWith('target.stat.')) {
        const key = variable.slice('target.stat.'.length) as keyof NumericStats;
        const targetStats = context.targetStats;
        return targetStats && typeof targetStats[key] === 'number' ? targetStats[key] as number : 0;
      }
      return 0;
  }
}

export function evaluateSkillFormula(
  formula: SkillFormula,
  context: SkillFormulaContext,
  helpers: SkillFormulaHelpers,
): number {
  if (typeof formula === 'number') {
    return formula;
  }
  if ('var' in formula) {
    return resolveSkillFormulaVar(formula.var, context, helpers) * (formula.scale ?? 1);
  }
  if (formula.op === 'clamp') {
    const value = evaluateSkillFormula(formula.value, context, helpers);
    const min = formula.min === undefined ? Number.NEGATIVE_INFINITY : evaluateSkillFormula(formula.min, context, helpers);
    const max = formula.max === undefined ? Number.POSITIVE_INFINITY : evaluateSkillFormula(formula.max, context, helpers);
    return Math.min(max, Math.max(min, value));
  }

  const values = formula.args.map((entry) => evaluateSkillFormula(entry, context, helpers));
  switch (formula.op) {
    case 'add':
      return values.reduce((sum, value) => sum + value, 0);
    case 'sub':
      return values.slice(1).reduce((sum, value) => sum - value, values[0] ?? 0);
    case 'mul':
      return values.reduce((sum, value) => sum * value, 1);
    case 'div':
      return values.slice(1).reduce((sum, value) => (value === 0 ? sum : sum / value), values[0] ?? 0);
    case 'min':
      return values.length > 0 ? Math.min(...values) : 0;
    case 'max':
      return values.length > 0 ? Math.max(...values) : 0;
    default:
      return 0;
  }
}

