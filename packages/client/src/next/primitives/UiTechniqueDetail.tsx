import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { UiPill } from './UiPill';
/**
 * UiTechniqueDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiTechniqueDetailProps {
/**
 * title：UiTechniqueDetailProps 内部字段。
 */

  title: string;  
  /**
 * subtitle：UiTechniqueDetailProps 内部字段。
 */

  subtitle?: ReactNode;  
  /**
 * badges：UiTechniqueDetailProps 内部字段。
 */

  badges?: ReactNode[];  
  /**
 * footer：UiTechniqueDetailProps 内部字段。
 */

  footer?: ReactNode;
}
/**
 * UiTechniqueDetail：执行核心业务逻辑。
 * @param {
  title,
  subtitle,
  badges = [],
  footer,
} UiTechniqueDetailProps 参数说明。
 * @returns 函数返回值。
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
