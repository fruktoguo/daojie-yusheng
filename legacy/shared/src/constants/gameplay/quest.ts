import type { QuestLine, QuestObjectiveType, QuestStatus } from '../../types';

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
