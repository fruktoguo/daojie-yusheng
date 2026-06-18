/**
 * 客户端技能释放可用性派生。这里只做本地已知状态预判，最终结果仍以服务端 tick 结算为准。
 */
import {
  calcQiCostWithOutputLimit,
  resolveSkillEffectiveRange,
  resolveSkillRequiresTarget,
  type ActionDef,
  type PlayerState,
  type SkillDef,
} from '@mud/shared';
import { getEstimatedPlayerTick, getEstimatedServerTick } from './runtime/server-tick';

export type ClientSkillCastUnavailableReason =
  | 'missing_player'
  | 'missing_action'
  | 'disabled'
  | 'dead'
  | 'missing_skill'
  | 'cooldown'
  | 'insufficient_qi'
  | 'missing_qi_output';

export type ClientSkillCastAvailability =
  | {
      ok: true;
      action: ActionDef;
      skill: SkillDef;
      cooldownLeft: number;
      qiCost: number | null;
      range: number;
      requiresTarget: boolean;
    }
  | {
      ok: false;
      reason: ClientSkillCastUnavailableReason;
      message: string;
      action?: ActionDef;
      skill?: SkillDef;
      cooldownLeft?: number;
      qiCost?: number | null;
      range?: number;
      requiresTarget?: boolean;
    };

export function resolveClientActionCooldownLeft(action: ActionDef, player: PlayerState | null | undefined): number {
  const readyTick = Number(action.cooldownReadyTick);
  const currentTick = getEstimatedPlayerTick(player) ?? getEstimatedServerTick();
  if (Number.isFinite(readyTick) && readyTick > 0 && currentTick !== null) {
    return Math.max(0, Math.trunc(readyTick) - currentTick);
  }
  return Math.max(0, Math.trunc(Number(action.cooldownLeft) || 0));
}

export function resolveClientSkillQiCost(player: PlayerState, skill: SkillDef): number | null {
  const baseCost = Number.isFinite(Number(skill.cost))
    ? Math.max(0, Math.round(Number(skill.cost)))
    : 0;
  if (baseCost <= 0) {
    return 0;
  }
  const outputCap = Number(player.numericStats?.maxQiOutputPerTick);
  if (!Number.isFinite(outputCap)) {
    return null;
  }
  return Math.round(calcQiCostWithOutputLimit(baseCost, Math.max(0, outputCap)));
}

export function resolveClientSkillCastAvailability(
  player: PlayerState | null | undefined,
  action: ActionDef | null | undefined,
): ClientSkillCastAvailability {
  if (!player) {
    return { ok: false, reason: 'missing_player', message: '角色状态尚未就绪，暂时不能释放技能。' };
  }
  if (!action || action.type !== 'skill') {
    return { ok: false, reason: 'missing_action', message: '技能动作尚未就绪，暂时不能释放。' };
  }
  if (action.skillEnabled === false) {
    return { ok: false, reason: 'disabled', message: '技能已禁用，无法释放。', action };
  }
  if (player.dead === true || Math.max(0, Number(player.hp) || 0) <= 0) {
    return { ok: false, reason: 'dead', message: '角色已倒下，无法释放技能。', action };
  }

  const skill = findPlayerSkill(player, action.id);
  if (!skill) {
    return { ok: false, reason: 'missing_skill', message: '技能模板尚未就绪，暂时不能释放。', action };
  }

  const range = resolveSkillEffectiveRange(skill);
  const requiresTarget = resolveSkillRequiresTarget(skill);
  const cooldownLeft = resolveClientActionCooldownLeft(action, player);
  if (cooldownLeft > 0) {
    return {
      ok: false,
      reason: 'cooldown',
      message: `${skill.name || action.name || '技能'}尚在冷却，还需 ${cooldownLeft} 息。`,
      action,
      skill,
      cooldownLeft,
      range,
      requiresTarget,
    };
  }

  const qiCost = resolveClientSkillQiCost(player, skill);
  if (qiCost === null) {
    return {
      ok: false,
      reason: 'missing_qi_output',
      message: `${skill.name || action.name || '技能'}暂时无法计算灵力消耗。`,
      action,
      skill,
      cooldownLeft,
      qiCost,
      range,
      requiresTarget,
    };
  }
  if (!Number.isFinite(qiCost)) {
    return {
      ok: false,
      reason: 'missing_qi_output',
      message: `${skill.name || action.name || '技能'}需要灵力输出，当前无法释放。`,
      action,
      skill,
      cooldownLeft,
      qiCost,
      range,
      requiresTarget,
    };
  }
  const currentQi = Math.max(0, Math.round(Number(player.qi) || 0));
  if (currentQi < qiCost) {
    return {
      ok: false,
      reason: 'insufficient_qi',
      message: `${skill.name || action.name || '技能'}灵力不足，需要 ${qiCost}，当前 ${currentQi}。`,
      action,
      skill,
      cooldownLeft,
      qiCost,
      range,
      requiresTarget,
    };
  }

  return {
    ok: true,
    action,
    skill,
    cooldownLeft,
    qiCost,
    range,
    requiresTarget,
  };
}

function findPlayerSkill(player: PlayerState, skillId: string): SkillDef | null {
  for (const technique of player.techniques ?? []) {
    const skill = technique.skills?.find((entry) => entry.id === skillId);
    if (skill) {
      return skill;
    }
  }
  return null;
}
