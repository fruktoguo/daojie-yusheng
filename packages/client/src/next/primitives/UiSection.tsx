import type { PropsWithChildren, ReactNode } from 'react';

export interface UiSectionProps {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function UiSection({
  title,
  subtitle,
  actions,
  className,
  children,
}: PropsWithChildren<UiSectionProps>) {
  const sectionClasses = ['panel-section', 'ui-panel-section', 'ui-surface-pane', 'ui-surface-pane--stack'];
  if (className) {
    sectionClasses.push(className);
  }
  return (
    <section className={sectionClasses.join(' ')}>
      <div className="panel-section-head ui-panel-section-head">
        <div>
          <div className="panel-section-title ui-panel-section-title">{title}</div>
          {subtitle ? <div className="panel-subtext ui-panel-subtext">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
