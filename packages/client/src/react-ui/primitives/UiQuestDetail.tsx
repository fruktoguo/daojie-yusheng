/**
 * 本文件提供 React UI 的 UiQuestDetail 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
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
        <div className="react-ui-quest-detail-badges react-ui-badge-row">
          {badges.map((badge, index) => (
            <UiPill key={index}>{badge}</UiPill>
          ))}
        </div>
      ) : null}
      {actions}
    </UiPanelFrame>
  );
}
