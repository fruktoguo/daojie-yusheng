import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';
/**
 * UiQuestDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiQuestDetailProps {
/**
 * title：UiQuestDetailProps 内部字段。
 */

  title: string;  
  /**
 * note：UiQuestDetailProps 内部字段。
 */

  note?: ReactNode;  
  /**
 * badges：UiQuestDetailProps 内部字段。
 */

  badges?: ReactNode[];  
  /**
 * actions：UiQuestDetailProps 内部字段。
 */

  actions?: ReactNode;
}
/**
 * UiQuestDetail：执行核心业务逻辑。
 * @param {
  title,
  note,
  badges = [],
  actions,
} UiQuestDetailProps 参数说明。
 * @returns 函数返回值。
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
