/**
 * 任务面板结构常量。
 * 包括状态样式类、默认任务线顺序与状态排序权重，供面板配置与渲染复用。
 */
import { QuestState, QUEST_LINE_KEYS } from '@mud/shared-next';

/** STATUS_CLASS：定义该变量以承载业务值。 */
export const STATUS_CLASS: Record<QuestState['status'], string> = {
  available: 'status-available',
  active: 'status-active',
  ready: 'status-ready',
  completed: 'status-completed',
};

/** LINE_ORDER：定义该变量以承载业务值。 */
export const LINE_ORDER: readonly QuestState['line'][] = QUEST_LINE_KEYS;
/** STATUS_PRIORITY：定义该变量以承载业务值。 */
export const STATUS_PRIORITY = { ready: 0, active: 1, available: 2, completed: 3 } as const;
