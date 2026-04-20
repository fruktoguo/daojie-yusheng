import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';
/**
 * UiQuestDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuestDetailProps {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * note：note相关字段。
 */

  note?: ReactNode;  
  /**
 * badges：badge相关字段。
 */

  badges?: ReactNode[];  
  /**
 * actions：action相关字段。
 */

  actions?: ReactNode;
}
/**
 * UiQuestDetail：渲染Ui任务详情组件。
 * @param {
  title,
  note,
  badges = [],
  actions,
} UiQuestDetailProps 参数说明。
 * @returns 无返回值，直接更新Ui任务详情相关状态。
 */


export function UiQuestDetail({
  title,
  note,
  badges = [],
  actions,
}: UiQuestDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={note}>
      {badges.length > 0 ? (
        <div className="next-ui-quest-detail-badges next-ui-badge-row">
          {badges.map((badge, index) => (
            <UiPill key={index}>{badge}</UiPill>
          ))}
        </div>
      ) : null}
      {actions}
    </UiPanelFrame>
  );
}
