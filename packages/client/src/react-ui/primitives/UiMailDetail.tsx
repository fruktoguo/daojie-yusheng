/**
 * 本文件提供 React UI 的 UiMailDetail 基础组件，用于复用面板内的视觉和交互片段。
 *
 * 维护时应保持组件无业务真源，只通过 props 呈现状态，并兼顾浅色、深色与移动端可用性。
 */
import type { ReactNode } from 'react';
import { UiPanelFrame } from './UiPanelFrame';
import { t } from '../../ui/i18n';
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
    <UiPanelFrame title={title} subtitle={t('react.mail.from', { from: String(from) })}>
      <div className="react-ui-mail-detail-body react-ui-copy-block">
        {bodyLines.map((line, index) => (
          <p key={`${title}-${index}`}>{line}</p>
        ))}
      </div>
    </UiPanelFrame>
  );
}
