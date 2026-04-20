import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
/**
 * UiMailDetailProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiMailDetailProps {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * from：from相关字段。
 */

  from: ReactNode;  
  /**
 * bodyLines：bodyLine相关字段。
 */

  bodyLines: string[];
}
/**
 * UiMailDetail：渲染Ui邮件详情组件。
 * @param {
  title,
  from,
  bodyLines,
} UiMailDetailProps 参数说明。
 * @returns 无返回值，直接更新Ui邮件详情相关状态。
 */


export function UiMailDetail({
  title,
  from,
  bodyLines,
}: UiMailDetailProps) {
  return (
    <UiPanelFrame title={title} subtitle={`来自 ${from}`}>
      <div className="next-ui-mail-detail-body next-ui-copy-block">
        {bodyLines.map((line, index) => (
          <p key={`${title}-${index}`}>{line}</p>
        ))}
      </div>
    </UiPanelFrame>
  );
}
