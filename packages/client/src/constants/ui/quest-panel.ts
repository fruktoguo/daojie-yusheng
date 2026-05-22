/**
 * 本文件定义客户端常量或展示配置，是 UI、地图、输入和本地渲染共同依赖的稳定来源。
 *
 * 维护时要保持常量含义清晰，并同步检查消费方，避免把服务端权威规则复制成客户端私有真源。
 */
/**
 * 任务面板结构常量。
 * 包括状态样式类、默认任务线顺序与状态排序权重，供面板配置与渲染复用。
 */
import { QuestState, QUEST_LINE_KEYS } from '@mud/shared';

export const STATUS_CLASS: Record<QuestState['status'], string> = {
  available: 'status-available',
  active: 'status-active',
  ready: 'status-ready',
  completed: 'status-completed',
};

export const LINE_ORDER: readonly QuestState['line'][] = QUEST_LINE_KEYS;
export const STATUS_PRIORITY = { ready: 0, active: 1, available: 2, completed: 3 } as const;
