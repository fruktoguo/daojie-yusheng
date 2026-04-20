import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiModalScaffoldProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiModalScaffoldProps {
/**
 * title：title名称或显示文本。
 */

  title: string;  
  /**
 * subtitle：subtitle名称或显示文本。
 */

  subtitle?: ReactNode;  
  /**
 * actions：action相关字段。
 */

  actions?: ReactNode;
}
/**
 * UiModalScaffold：渲染Ui弹层Scaffold组件。
 * @param {
  title,
  subtitle,
  actions,
  children,
} PropsWithChildren<UiModalScaffoldProps> 参数说明。
 * @returns 无返回值，直接更新Ui弹层Scaffold相关状态。
 */


export function UiModalScaffold({
  title,
  subtitle,
  actions,
  children,
}: PropsWithChildren<UiModalScaffoldProps>) {
  return (
    <div className="next-ui-modal-scaffold">
      <div className="next-ui-modal-scaffold-head">
        <div className="next-ui-modal-scaffold-heading">
          <div className="next-ui-section-title next-ui-modal-scaffold-title">{title}</div>
          {subtitle ? <div className="next-ui-section-subtext next-ui-modal-scaffold-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div className="next-ui-modal-scaffold-actions">{actions}</div> : null}
      </div>
      <div className="next-ui-modal-scaffold-body">{children}</div>
    </div>
  );
}
