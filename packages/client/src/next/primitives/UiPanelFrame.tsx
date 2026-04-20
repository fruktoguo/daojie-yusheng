import type { PropsWithChildren, ReactNode } from 'react';
/**
 * UiPanelFrameProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiPanelFrameProps {
/**
 * title：UiPanelFrameProps 内部字段。
 */

  title: string;  
  /**
 * subtitle：UiPanelFrameProps 内部字段。
 */

  subtitle?: ReactNode;  
  /**
 * actions：UiPanelFrameProps 内部字段。
 */

  actions?: ReactNode;  
  /**
 * className：UiPanelFrameProps 内部字段。
 */

  className?: string;
}
/**
 * UiPanelFrame：执行核心业务逻辑。
 * @param {
  title,
  subtitle,
  actions,
  className,
  children,
} PropsWithChildren<UiPanelFrameProps> 参数说明。
 * @returns 函数返回值。
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
