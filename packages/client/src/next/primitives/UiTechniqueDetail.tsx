import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';
/**
 * UiTechniqueDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTechniqueDetailProps {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: ReactNode;  
  /**
 * badges：badge相关字段。
 */

  badges?: ReactNode[];  
  /**
 * footer：footer相关字段。
 */

  footer?: ReactNode;
}
/**
 * UiTechniqueDetail：渲染Ui功法详情组件。
 * @param {
  title,
  subtitle,
  badges = [],
  footer,
} UiTechniqueDetailProps 参数说明。
 * @returns 无返回值，直接更新Ui功法详情相关状态。
 */


export function UiTechniqueDetail({
  title,
  subtitle,
  badges = [],
  footer,
}: UiTechniqueDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={subtitle}>
      {badges.length > 0 ? (
        <div className="next-ui-technique-detail-badges next-ui-badge-row">
          {badges.map((badge, index) => (
            <UiPill key={index}>{badge}</UiPill>
          ))}
        </div>
      ) : null}
      {footer}
    </UiPanelFrame>
  );
}
