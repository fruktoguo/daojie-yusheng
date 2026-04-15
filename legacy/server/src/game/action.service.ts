/**
 * 行动管理：技能行动列表构建、冷却计算、自动战斗配置
 */
import { Injectable } from '@nestjs/common';
import {
  ActionDef,
  AutoBattleSkillConfig,
  PlayerState,
  enforceSkillEnabledLimit,
  percentModifierToMultiplier,
  resolvePlayerSkillSlotLimit,
  signedRatioValue,
} from '@mud/shared';
import { AttrService } from './attr.service';
import { TechniqueService } from './technique.service';

@Injectable()
export class ActionService {
  constructor(
    private readonly techniqueService: TechniqueService,
    private readonly attrService: AttrService,
  ) {}

  /** 根据功法技能重建可用行动列表 */
  rebuildActions(player: PlayerState, contextActions: ActionDef[] = []): void {
    const cooldowns = new Map(player.actions.map((action) => [action.id, action.cooldownLeft]));
    const skillActions = this.techniqueService.getSkillActions(player);
    const autoBattleSkills = this.normalizeAutoBattleSkills(
      skillActions,
      player.autoBattleSkills,
      resolvePlayerSkillSlotLimit(player),
    );
    const skillOrder = new Map(autoBattleSkills.map((entry, index) => [entry.skillId, index]));
    const autoBattleEnabledMap = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.enabled]));
    const skillPanelEnabled = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.skillEnabled !== false]));
    const orderedSkillActions = [...skillActions]
      .sort((left, right) => (skillOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (skillOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    const merged = [...contextActions, ...orderedSkillActions].map((action) => ({
      ...action,
      cooldownLeft: cooldowns.get(action.id) ?? action.cooldownLeft,
      autoBattleEnabled: action.type === 'skill' ? (autoBattleEnabledMap.get(action.id) ?? true) : action.autoBattleEnabled,
      autoBattleOrder: action.type === 'skill' ? skillOrder.get(action.id) : action.autoBattleOrder,
      skillEnabled: action.type === 'skill' ? (skillPanelEnabled.get(action.id) ?? true) : action.skillEnabled,
    }));
    player.autoBattleSkills = autoBattleSkills;
    player.actions = merged;
  }

  /** 更新自动战斗技能配置，返回是否有变化 */
  updateAutoBattleSkills(player: PlayerState, input: AutoBattleSkillConfig[]): boolean {
    const skillActions = this.techniqueService.getSkillActions(player);
    const next = this.normalizeAutoBattleSkills(skillActions, input, resolvePlayerSkillSlotLimit(player));
    const contextActions = player.actions.filter((action) => action.type !== 'skill');
    const changed = !this.isSameAutoBattleSkillConfigList(player.autoBattleSkills, next);
    player.autoBattleSkills = next;
    this.rebuildActions(player, contextActions);
    return changed;
  }

  /** 获取玩家指定行动定义 */
  getAction(player: PlayerState, actionId: string): ActionDef | undefined {
    return player.actions.find((action) => action.id === actionId);
  }

  /** 触发技能冷却，返回 null 表示成功 */
  beginCooldown(player: PlayerState, actionId: string): string | null {
    const action = player.actions.find((entry) => entry.id === actionId);
    if (!action) return '行动不存在';
    if (action.cooldownLeft > 0) return '招式尚在调息中';

    // 查找对应技能定义获取冷却时间
    for (const tech of player.techniques) {
      const skill = tech.skills.find((entry) => entry.id === actionId);
      if (skill) {
        const ratioDivisors = this.attrService.getPlayerRatioDivisors(player);
        const numericStats = this.attrService.getPlayerNumericStats(player);
        const cooldownRate = signedRatioValue(numericStats.cooldownSpeed, ratioDivisors.cooldownSpeed);
        const cooldownMultiplier = percentModifierToMultiplier(-cooldownRate * 100);
        action.cooldownLeft = Math.max(1, Math.ceil(skill.cooldown * cooldownMultiplier));
        break;
      }
    }

    return null;
  }

  /** 触发固定时长行动冷却，返回 null 表示成功 */
  beginFixedCooldown(player: PlayerState, actionId: string, cooldownTicks: number): string | null {
    const action = player.actions.find((entry) => entry.id === actionId);
    if (!action) return '行动不存在';
    if (action.cooldownLeft > 0) return '行动尚在调息中';
    action.cooldownLeft = Math.max(1, Math.floor(cooldownTicks));
    return null;
  }

  /** 每 tick 冷却递减，返回是否有变化 */
  tickCooldowns(player: PlayerState): boolean {
    let changed = false;
    for (const action of player.actions) {
      if (action.cooldownLeft > 0) {
        action.cooldownLeft -= 1;
        changed = true;
      }
    }
    return changed;
  }

  /** 规范化自动战斗技能列表，补全缺失的技能条目 */
  private normalizeAutoBattleSkills(
    skillActions: ActionDef[],
    input: AutoBattleSkillConfig[] | undefined,
    skillSlotLimit: number,
  ): AutoBattleSkillConfig[] {
    const availableIds = new Set(skillActions.map((action) => action.id));
    const normalized: AutoBattleSkillConfig[] = [];
    const seen = new Set<string>();

    for (const entry of input ?? []) {
      if (seen.has(entry.skillId) || !availableIds.has(entry.skillId)) {
        continue;
      }
      normalized.push({
        skillId: entry.skillId,
        enabled: entry.enabled !== false,
        skillEnabled: entry.skillEnabled !== false,
      });
      seen.add(entry.skillId);
    }

    for (const action of skillActions) {
      if (seen.has(action.id)) {
        continue;
      }
      normalized.push({
        skillId: action.id,
        enabled: true,
        skillEnabled: true,
      });
      seen.add(action.id);
    }

    return enforceSkillEnabledLimit(normalized, skillSlotLimit);
  }

  private isSameAutoBattleSkillConfigList(
    left: AutoBattleSkillConfig[] | undefined,
    right: AutoBattleSkillConfig[],
  ): boolean {
    if ((left?.length ?? 0) !== right.length) {
      return false;
    }
    for (let index = 0; index < right.length; index += 1) {
      const previous = left?.[index];
      const next = right[index]!;
      if (
        previous?.skillId !== next.skillId
        || previous.enabled !== next.enabled
        || (previous.skillEnabled !== false) !== (next.skillEnabled !== false)
      ) {
        return false;
      }
    }
    return true;
  }
}

