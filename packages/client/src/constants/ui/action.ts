/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 行动面板相关常量。
 */
import type { ActionDef } from '@mud/shared';
import { t } from '../../ui/i18n';

function actionText(key: string): string {
  return t(key);
}

/** 遁返命石绑定复活点的行动 id。 */
export const RETURN_TO_SPAWN_ACTION_ID = 'travel:return_spawn';

/** localStorage 键，用于保存行动快捷键配置。 */
export const ACTION_SHORTCUTS_KEY = 'mud.action.shortcuts.v1';

/** 行动快捷键配置发生变化时广播给其他面板的事件名。 */
export const ACTION_SHORTCUTS_CHANGED_EVENT = 'mud:action-shortcuts-changed';

/** localStorage 键，用于保存技能方案配置。 */
export const ACTION_SKILL_PRESETS_KEY = 'mud.action.skill-presets.v1';

const CRAFT_OPEN_ACTION_IDS = {
  alchemy: 'alchemy:open',
  building: 'building:open',
  forging: 'forging:open',
  enhancement: 'enhancement:open',
  transmission: 'transmission:open',
} as const;

/** 读取指定技艺页对应的打开动作 ID。 */
export function getCraftOpenActionId(key: string): string | null {
  return CRAFT_OPEN_ACTION_IDS[key as keyof typeof CRAFT_OPEN_ACTION_IDS] ?? null;
}

/** 客户端可稳定识别的静态行动定义，用于补齐缺字段的 bootstrap/delta。 */
const STATIC_CLIENT_ACTION_DEFS: Record<string, ActionDef> = {
  'battle:force_attack': {
    id: 'battle:force_attack',
    name: actionText('action.static.force-attack.name'),
    type: 'battle',
    desc: actionText('action.static.force-attack.desc'),
    cooldownLeft: 0,
    requiresTarget: true,
    targetMode: 'any',
  },
  [RETURN_TO_SPAWN_ACTION_ID]: {
    id: RETURN_TO_SPAWN_ACTION_ID,
    name: actionText('action.static.return-spawn.name'),
    type: 'travel',
    desc: actionText('action.static.return-spawn.desc'),
    cooldownLeft: 0,
  },
  'alchemy:open': {
    id: 'alchemy:open',
    name: actionText('action.static.alchemy-open.name'),
    type: 'craft',
    desc: actionText('action.static.alchemy-open.desc'),
    cooldownLeft: 0,
  },
  'forging:open': {
    id: 'forging:open',
    name: actionText('action.static.forging-open.name'),
    type: 'craft',
    desc: actionText('action.static.forging-open.desc'),
    cooldownLeft: 0,
  },
  'enhancement:open': {
    id: 'enhancement:open',
    name: actionText('action.static.enhancement-open.name'),
    type: 'craft',
    desc: actionText('action.static.enhancement-open.desc'),
    cooldownLeft: 0,
  },
  'building:open': {
    id: 'building:open',
    name: actionText('action.static.building-open.name'),
    type: 'craft',
    desc: actionText('action.static.building-open.desc'),
    cooldownLeft: 0,
  },
  'transmission:open': {
    id: 'transmission:open',
    name: actionText('action.static.transmission-open.name'),
    type: 'craft',
    desc: actionText('action.static.transmission-open.desc'),
    cooldownLeft: 0,
  },
  'toggle:auto_battle': {
    id: 'toggle:auto_battle',
    name: actionText('action.static.auto-battle.name'),
    type: 'toggle',
    desc: actionText('action.static.auto-battle.desc'),
    cooldownLeft: 0,
  },
  'toggle:auto_retaliate': {
    id: 'toggle:auto_retaliate',
    name: actionText('action.static.auto-retaliate.name'),
    type: 'toggle',
    desc: actionText('action.static.auto-retaliate.desc'),
    cooldownLeft: 0,
  },
  'toggle:auto_battle_stationary': {
    id: 'toggle:auto_battle_stationary',
    name: actionText('action.static.stationary-battle.name'),
    type: 'toggle',
    desc: actionText('action.static.stationary-battle.desc'),
    cooldownLeft: 0,
  },
  'toggle:allow_aoe_player_hit': {
    id: 'toggle:allow_aoe_player_hit',
    name: actionText('action.static.allow-aoe-player-hit.name'),
    type: 'toggle',
    desc: actionText('action.static.allow-aoe-player-hit.desc'),
    cooldownLeft: 0,
  },
  'toggle:auto_idle_cultivation': {
    id: 'toggle:auto_idle_cultivation',
    name: actionText('action.static.auto-idle-cultivation.name'),
    type: 'toggle',
    desc: actionText('action.static.auto-idle-cultivation.desc'),
    cooldownLeft: 0,
  },
  'cultivation:toggle': {
    id: 'cultivation:toggle',
    name: actionText('action.static.cultivation-toggle.name'),
    type: 'toggle',
    desc: actionText('action.static.cultivation-toggle.desc'),
    cooldownLeft: 0,
  },
  'toggle:auto_switch_cultivation': {
    id: 'toggle:auto_switch_cultivation',
    name: actionText('action.static.auto-switch-cultivation.name'),
    type: 'toggle',
    desc: actionText('action.static.auto-switch-cultivation.desc'),
    cooldownLeft: 0,
  },
  'sense_qi:toggle': {
    id: 'sense_qi:toggle',
    name: actionText('action.static.sense-qi.name'),
    type: 'toggle',
    desc: actionText('action.static.sense-qi.desc'),
    cooldownLeft: 0,
  },
  'wang_qi:toggle': {
    id: 'wang_qi:toggle',
    name: actionText('action.static.wang-qi.name'),
    type: 'interact',
    desc: actionText('action.static.wang-qi.desc'),
    cooldownLeft: 0,
  },
};

/** 读取静态行动定义副本，避免面板状态误改常量。 */
export function getStaticClientActionDef(actionId: string): ActionDef | null {
  const action = STATIC_CLIENT_ACTION_DEFS[actionId];
  return action ? { ...action } : null;
}
