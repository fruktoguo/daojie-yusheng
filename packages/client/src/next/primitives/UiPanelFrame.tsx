import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiPanelFrameProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPanelFrameProps {
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
  /**
 * className：class名称名称或显示文本。
 */

  className?: string;
}
/**
 * UiPanelFrame：渲染Ui面板帧组件。
 * @param {
  title,
  subtitle,
  actions,
  className,
  children,
} PropsWithChildren<UiPanelFrameProps> 参数说明。
 * @returns 无返回值，直接更新Ui面板帧相关状态。
 */


export function UiPanelFrame({
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<UiPanelFrameProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

  const classes = ['next-ui-surface-pane', 'next-ui-surface-pane--stack', 'next-ui-panel-frame'];
  if (className) {
    classes.push(className);
  }

  return (
    <section className={classes.join(' ')}>
      <div className="next-ui-panel-frame-head">
        <div className="next-ui-panel-frame-heading">
          <div className="next-ui-section-title next-ui-panel-frame-title">{title}</div>
          {subtitle ? <div className="next-ui-section-subtext next-ui-panel-frame-subtitle">{subtitle}</div> : null}
        </div>
        {actions ? <div className="next-ui-panel-frame-actions">{actions}</div> : null}
      </div>
      <div className="next-ui-panel-frame-body">{children}</div>
    </section>
  );
}
