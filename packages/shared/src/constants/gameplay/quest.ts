/**
 * 本文件定义前后端共享的玩法常量，是协议和运行规则共同依赖的稳定来源。
 *
 * 维护时要同步检查客户端展示、服务端结算和配置编辑器，避免同一数值在多端分叉。
 */
import type { QuestLine, QuestObjectiveType, QuestStatus } from '../../quest-types';

/**
 * 任务系统通用键集合常量。
 */

/** 任务线顺序。 */
export const QUEST_LINE_KEYS: QuestLine[] = ['main', 'side', 'daily', 'encounter'];

/** 任务状态顺序。 */
export const QUEST_STATUS_KEYS: QuestStatus[] = ['available', 'active', 'ready', 'completed'];

/** 任务目标类型集合。 */
export const QUEST_OBJECTIVE_TYPE_KEYS: QuestObjectiveType[] = ['kill', 'talk', 'submit_item', 'learn_technique', 'realm_progress', 'realm_stage'];

/** 任务自动导航每次跨图后的冷却时长（息）。 */
export const QUEST_CROSS_MAP_NAV_COOLDOWN_TICKS = 1;
