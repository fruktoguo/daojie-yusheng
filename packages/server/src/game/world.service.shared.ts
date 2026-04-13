import { ActionDef, Attributes, percentModifierToMultiplier } from '@mud/shared';

/** MONSTER_ATTR_KEYS：定义该变量以承载业务值。 */
export const MONSTER_ATTR_KEYS: readonly (keyof Attributes)[] = [
  'constitution',
  'spirit',
  'perception',
  'talent',
  'comprehension',
  'luck',
];

/** createMonsterAttributeSnapshot：执行对应的业务逻辑。 */
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

/** applyAttributeAdditions：执行对应的业务逻辑。 */
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

/** applyAttributePercentMultipliers：执行对应的业务逻辑。 */
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

/** STATIC_CONTEXT_TOGGLE_ACTIONS：定义该变量以承载业务值。 */
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

/** INTRO_BODY_TECHNIQUE_ID：定义该变量以承载业务值。 */
export const INTRO_BODY_TECHNIQUE_ID = 'standing_stake_art';
/** INTRO_BODY_TECHNIQUE_BOOK_ID：定义该变量以承载业务值。 */
export const INTRO_BODY_TECHNIQUE_BOOK_ID = 'book.standing_stake_art';
/** INTRO_BODY_TEMPERING_QUEST_ID：定义该变量以承载业务值。 */
export const INTRO_BODY_TEMPERING_QUEST_ID = 'q_intro_body_tempering';
/** HUANLING_ZHENREN_MONSTER_ID：定义该变量以承载业务值。 */
export const HUANLING_ZHENREN_MONSTER_ID = 'm_huanling_zhenren';
/** HUANLING_FAXIANG_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_FAXIANG_SKILL_ID = 'skill.huanling_candan_faxiang';
/** HUANLING_LIEFU_WAIHUAN_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_LIEFU_WAIHUAN_SKILL_ID = 'skill.huanling_liefu_waihuan';
/** HUANLING_XINGLUO_CANPAN_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_XINGLUO_CANPAN_SKILL_ID = 'skill.huanling_xingluo_canpan';
/** HUANLING_RONGHE_GUANMAI_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_RONGHE_GUANMAI_SKILL_ID = 'skill.huanling_ronghe_guanmai';
/** HUANLING_LIEQI_ZHIXIAN_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_LIEQI_ZHIXIAN_SKILL_ID = 'skill.huanling_lieqi_zhixian';
/** HUANLING_SUOGONG_NEIHUAN_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_SUOGONG_NEIHUAN_SKILL_ID = 'skill.huanling_suogong_neihuan';
/** HUANLING_DIFU_CHENYIN_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_DIFU_CHENYIN_SKILL_ID = 'skill.huanling_difu_chenyin';
/** HUANLING_DUANHUN_DING_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_DUANHUN_DING_SKILL_ID = 'skill.huanling_duanhun_ding';
/** HUANLING_CANPO_ZHANG_SKILL_ID：定义该变量以承载业务值。 */
export const HUANLING_CANPO_ZHANG_SKILL_ID = 'skill.huanling_canpo_zhang';
/** HUANLING_FAXIANG_BUFF_ID：定义该变量以承载业务值。 */
export const HUANLING_FAXIANG_BUFF_ID = 'buff.huanling_candan_faxiang';
/** HUANLING_RONGMAI_YIN_BUFF_ID：定义该变量以承载业务值。 */
export const HUANLING_RONGMAI_YIN_BUFF_ID = 'buff.huanling_rongmai_yin';
/** HUANLING_CANMAI_SUOBU_BUFF_ID：定义该变量以承载业务值。 */
export const HUANLING_CANMAI_SUOBU_BUFF_ID = 'buff.huanling_canmai_suobu';
/** TERRAIN_MOLTEN_POOL_BURN_BUFF_ID：定义该变量以承载业务值。 */
export const TERRAIN_MOLTEN_POOL_BURN_BUFF_ID = 'terrain_molten_pool_burn';

/** RUNTIME_STATE_SCOPE：定义该变量以承载业务值。 */
export const RUNTIME_STATE_SCOPE = 'runtime_state';
/** MAP_MONSTER_RUNTIME_DOCUMENT_KEY：定义该变量以承载业务值。 */
export const MAP_MONSTER_RUNTIME_DOCUMENT_KEY = 'map_monster';
/** NPC_SHOP_RUNTIME_DOCUMENT_KEY：定义该变量以承载业务值。 */
export const NPC_SHOP_RUNTIME_DOCUMENT_KEY = 'npc_shop';

/** getMonsterDisplayName：执行对应的业务逻辑。 */
export function getMonsterDisplayName(name: string, tier: 'mortal_blood' | 'variant' | 'demon_king'): string {
  if (tier !== 'variant') {
    return name;
  }
/** sanitized：定义该变量以承载业务值。 */
  const sanitized = name.replaceAll('精英', '').trim();
  return sanitized.length > 0 ? sanitized : name;
}

/** DEFENSE_REDUCTION_ATTACK_RATIO：定义该变量以承载业务值。 */
export const DEFENSE_REDUCTION_ATTACK_RATIO = 0.1;
/** DEFENSE_REDUCTION_BASELINE：定义该变量以承载业务值。 */
export const DEFENSE_REDUCTION_BASELINE = 100;
