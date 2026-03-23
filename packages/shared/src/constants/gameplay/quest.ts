import type { QuestLine, QuestObjectiveType, QuestStatus } from '../../types';

/**
 * 任务系统通用键集合常量。
 */

/** 任务线顺序。 */
export const QUEST_LINE_KEYS: QuestLine[] = ['main', 'side', 'daily', 'encounter'];

/** 任务状态顺序。 */
export const QUEST_STATUS_KEYS: QuestStatus[] = ['available', 'active', 'ready', 'completed'];

/** 任务目标类型集合。 */
export const QUEST_OBJECTIVE_TYPE_KEYS: QuestObjectiveType[] = ['kill', 'learn_technique', 'realm_progress', 'realm_stage'];
