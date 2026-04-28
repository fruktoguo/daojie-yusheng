/**
 * 行动面板相关常量。
 */
import type { ActionDef } from '@mud/shared';

/** 遁返命石绑定复活点的行动 id。 */
export const RETURN_TO_SPAWN_ACTION_ID = 'travel:return_spawn';

/** localStorage 键，用于保存行动快捷键配置。 */
export const ACTION_SHORTCUTS_KEY = 'mud.action.shortcuts.v1';

/** localStorage 键，用于保存技能方案配置。 */
export const ACTION_SKILL_PRESETS_KEY = 'mud.action.skill-presets.v1';

/** 客户端可稳定识别的静态行动定义，用于补齐缺字段的 bootstrap/delta。 */
const STATIC_CLIENT_ACTION_DEFS: Record<string, ActionDef> = {
  'battle:force_attack': {
    id: 'battle:force_attack',
    name: '强制攻击',
    type: 'battle',
    desc: '无视自动索敌限制，直接锁定你选中的目标发起攻击。',
    cooldownLeft: 0,
    requiresTarget: true,
    targetMode: 'any',
  },
  [RETURN_TO_SPAWN_ACTION_ID]: {
    id: RETURN_TO_SPAWN_ACTION_ID,
    name: '遁返',
    type: 'travel',
    desc: '催动归引灵符，遁返回 云来镇，之后需调息 1800 息。',
    cooldownLeft: 0,
  },
  'toggle:auto_battle': {
    id: 'toggle:auto_battle',
    name: '自动战斗',
    type: 'toggle',
    desc: '自动追击附近妖兽并释放技能，可随时切换开关。',
    cooldownLeft: 0,
  },
  'toggle:auto_retaliate': {
    id: 'toggle:auto_retaliate',
    name: '自动反击',
    type: 'toggle',
    desc: '控制被攻击时是否自动开战。',
    cooldownLeft: 0,
  },
  'toggle:auto_battle_stationary': {
    id: 'toggle:auto_battle_stationary',
    name: '原地战斗',
    type: 'toggle',
    desc: '控制自动战斗时是否原地输出，还是按射程追击目标。',
    cooldownLeft: 0,
  },
  'toggle:allow_aoe_player_hit': {
    id: 'toggle:allow_aoe_player_hit',
    name: '全体攻击',
    type: 'toggle',
    desc: '控制群体攻击是否会误伤其他玩家。',
    cooldownLeft: 0,
  },
  'toggle:auto_idle_cultivation': {
    id: 'toggle:auto_idle_cultivation',
    name: '闲置自动修炼',
    type: 'toggle',
    desc: '控制角色闲置一段时间后是否自动开始修炼。',
    cooldownLeft: 0,
  },
  'cultivation:toggle': {
    id: 'cultivation:toggle',
    name: '当前修炼',
    type: 'toggle',
    desc: '切换角色修炼状态；没有主修时只推进境界修为。',
    cooldownLeft: 0,
  },
  'toggle:auto_switch_cultivation': {
    id: 'toggle:auto_switch_cultivation',
    name: '修满自动切换',
    type: 'toggle',
    desc: '控制主修功法圆满后是否自动切到下一门未圆满功法。',
    cooldownLeft: 0,
  },
  'sense_qi:toggle': {
    id: 'sense_qi:toggle',
    name: '感气视角',
    type: 'toggle',
    desc: '切换感气视角，观察地块灵气层次与变化。',
    cooldownLeft: 0,
  },
};

/** 读取静态行动定义副本，避免面板状态误改常量。 */
export function getStaticClientActionDef(actionId: string): ActionDef | null {
  const action = STATIC_CLIENT_ACTION_DEFS[actionId];
  return action ? { ...action } : null;
}
