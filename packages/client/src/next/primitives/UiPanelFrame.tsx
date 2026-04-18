import type { PropsWithChildren, ReactNode } from 'react';

export interface UiPanelFrameProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function UiPanelFrame({
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<UiPanelFrameProps>) {
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
