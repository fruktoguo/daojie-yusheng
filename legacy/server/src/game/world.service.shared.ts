import { ActionDef, Attributes, percentModifierToMultiplier } from '@mud/shared';

export const MONSTER_ATTR_KEYS: readonly (keyof Attributes)[] = [
  'constitution',
  'spirit',
  'perception',
  'talent',
  'comprehension',
  'luck',
];

export function createMonsterAttributeSnapshot(initial = 0): Attributes {
  return {
    constitution: initial,
    spirit: initial,
    perception: initial,
    talent: initial,
    comprehension: initial,
    luck: initial,
  };
}

export function applyAttributeAdditions(target: Attributes, patch: Partial<Attributes> | undefined): void {
  if (!patch) {
    return;
  }
  for (const key of MONSTER_ATTR_KEYS) {
    const value = patch[key];
    if (value === undefined || value === 0) {
      continue;
    }
    target[key] += value;
  }
}

export function applyAttributePercentMultipliers(target: Attributes, patch: Partial<Attributes> | undefined): void {
  if (!patch) {
    return;
  }
  for (const key of MONSTER_ATTR_KEYS) {
    const value = patch[key];
    if (value === undefined || value === 0) {
      continue;
    }
    target[key] = Math.max(0, target[key] * percentModifierToMultiplier(value));
  }
}

export const STATIC_CONTEXT_TOGGLE_ACTIONS: readonly ActionDef[] = [{
  id: 'toggle:auto_battle',
  name: '自动战斗',
  type: 'toggle',
  desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_retaliate',
  name: '自动反击',
  type: 'toggle',
  desc: '控制被攻击时是否自动开战。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_battle_stationary',
  name: '原地战斗',
  type: 'toggle',
  desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
  cooldownLeft: 0,
}, {
  id: 'toggle:allow_aoe_player_hit',
  name: '全体攻击',
  type: 'toggle',
  desc: '控制是否允许主动攻击其他玩家；关闭后只会对袭击你的玩家进行反击。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_idle_cultivation',
  name: '闲置自动修炼',
  type: 'toggle',
  desc: '控制角色闲置一段时间后是否自动开始修炼。',
  cooldownLeft: 0,
}, {
  id: 'toggle:auto_switch_cultivation',
  name: '修满自动切换',
  type: 'toggle',
  desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
  cooldownLeft: 0,
}, {
  id: 'sense_qi:toggle',
  name: '感气视角',
  type: 'toggle',
  desc: '切换感气视角，观察地块灵气层次与变化。',
  cooldownLeft: 0,
}];

export const INTRO_BODY_TECHNIQUE_ID = 'standing_stake_art';
export const INTRO_BODY_TECHNIQUE_BOOK_ID = 'book.standing_stake_art';
export const INTRO_BODY_TEMPERING_QUEST_ID = 'q_intro_body_tempering';
export const HUANLING_ZHENREN_MONSTER_ID = 'm_huanling_zhenren';
export const HUANLING_FAXIANG_SKILL_ID = 'skill.huanling_candan_faxiang';
export const HUANLING_LIEFU_WAIHUAN_SKILL_ID = 'skill.huanling_liefu_waihuan';
export const HUANLING_XINGLUO_CANPAN_SKILL_ID = 'skill.huanling_xingluo_canpan';
export const HUANLING_RONGHE_GUANMAI_SKILL_ID = 'skill.huanling_ronghe_guanmai';
export const HUANLING_LIEQI_ZHIXIAN_SKILL_ID = 'skill.huanling_lieqi_zhixian';
export const HUANLING_SUOGONG_NEIHUAN_SKILL_ID = 'skill.huanling_suogong_neihuan';
export const HUANLING_DIFU_CHENYIN_SKILL_ID = 'skill.huanling_difu_chenyin';
export const HUANLING_DUANHUN_DING_SKILL_ID = 'skill.huanling_duanhun_ding';
export const HUANLING_CANPO_ZHANG_SKILL_ID = 'skill.huanling_canpo_zhang';
export const HUANLING_FAXIANG_BUFF_ID = 'buff.huanling_candan_faxiang';
export const HUANLING_RONGMAI_YIN_BUFF_ID = 'buff.huanling_rongmai_yin';
export const HUANLING_CANMAI_SUOBU_BUFF_ID = 'buff.huanling_canmai_suobu';
export const TERRAIN_MOLTEN_POOL_BURN_BUFF_ID = 'terrain_molten_pool_burn';

export const RUNTIME_STATE_SCOPE = 'runtime_state';
export const MAP_MONSTER_RUNTIME_DOCUMENT_KEY = 'map_monster';
export const NPC_SHOP_RUNTIME_DOCUMENT_KEY = 'npc_shop';

export function getMonsterDisplayName(name: string, tier: 'mortal_blood' | 'variant' | 'demon_king'): string {
  if (tier !== 'variant') {
    return name;
  }
  const sanitized = name.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : name;
}

export const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
export const DEFENSE_REDUCTION_BASELINE = 100;
