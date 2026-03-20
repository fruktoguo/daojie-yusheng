import { Injectable } from '@nestjs/common';
import { ActionDef, AutoBattleSkillConfig, PlayerState, ratioValue } from '@mud/shared';
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
    const autoBattleSkills = this.normalizeAutoBattleSkills(skillActions, player.autoBattleSkills);
    const skillOrder = new Map(autoBattleSkills.map((entry, index) => [entry.skillId, index]));
    const skillEnabled = new Map(autoBattleSkills.map((entry) => [entry.skillId, entry.enabled]));
    const orderedSkillActions = [...skillActions]
      .sort((left, right) => (skillOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (skillOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER));
    const merged = [...contextActions, ...orderedSkillActions].map((action) => ({
      ...action,
      cooldownLeft: cooldowns.get(action.id) ?? action.cooldownLeft,
      autoBattleEnabled: action.type === 'skill' ? (skillEnabled.get(action.id) ?? true) : action.autoBattleEnabled,
      autoBattleOrder: action.type === 'skill' ? skillOrder.get(action.id) : action.autoBattleOrder,
    }));
    player.autoBattleSkills = autoBattleSkills;
    player.actions = merged;
  }

  updateAutoBattleSkills(player: PlayerState, input: AutoBattleSkillConfig[]): boolean {
    const skillActions = this.techniqueService.getSkillActions(player);
    const next = this.normalizeAutoBattleSkills(skillActions, input);
    const changed = JSON.stringify(player.autoBattleSkills) !== JSON.stringify(next);
    player.autoBattleSkills = next;
    return changed;
  }

  getAction(player: PlayerState, actionId: string): ActionDef | undefined {
    return player.actions.find((action) => action.id === actionId);
  }

  beginCooldown(player: PlayerState, actionId: string): string | null {
    const action = player.actions.find(a => a.id === actionId);
    if (!action) return '行动不存在';
    if (action.cooldownLeft > 0) return '技能冷却中';

    // 查找对应技能定义获取冷却时间
    for (const tech of player.techniques) {
      const skill = tech.skills.find(s => s.id === actionId);
      if (skill) {
        const ratioDivisors = this.attrService.getPlayerRatioDivisors(player);
        const numericStats = this.attrService.getPlayerNumericStats(player);
        const cooldownRate = Math.max(0, ratioValue(numericStats.cooldownSpeed, ratioDivisors.cooldownSpeed));
        action.cooldownLeft = Math.max(1, Math.ceil(skill.cooldown * (1 - cooldownRate)));
        break;
      }
    }

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

  private normalizeAutoBattleSkills(skillActions: ActionDef[], input: AutoBattleSkillConfig[] | undefined): AutoBattleSkillConfig[] {
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
      });
      seen.add(action.id);
    }

    return normalized;
  }
}
