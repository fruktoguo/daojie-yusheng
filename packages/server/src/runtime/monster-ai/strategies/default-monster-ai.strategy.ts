import type { SkillDef } from '@mud/shared';
import { buildEffectiveMonsterSkillGeometry, canMonsterCastSkill } from '../monster-ai.helpers.js';
import type { MonsterAiContext, MonsterAiStrategy } from '../monster-ai.types.js';

/**
 * 通用怪物技能选择策略：
 * 遍历怪物当前装备的全部技能，按可施法条件（CD、灵力、距离、范围等）筛选出射程最远、优先级最高的可用技能。
 */
export class DefaultMonsterAiStrategy implements MonsterAiStrategy {
  public readonly id = 'default';

  public chooseSkill(context: MonsterAiContext): SkillDef | null {
    const { monster, target, distance, currentTick } = context;
    let selected: SkillDef | null = null;
    let selectedRange = 0;

    for (const skill of monster.skills) {
      if (!canMonsterCastSkill(monster, skill, target, distance, currentTick)) {
        continue;
      }
      const skillRange = buildEffectiveMonsterSkillGeometry(monster, skill).range;
      if (!selected) {
        selected = skill;
        selectedRange = skillRange;
        continue;
      }
      if (skillRange > selectedRange || (skillRange === selectedRange && skill.id < selected.id)) {
        selected = skill;
        selectedRange = skillRange;
      }
    }

    return selected;
  }
}
