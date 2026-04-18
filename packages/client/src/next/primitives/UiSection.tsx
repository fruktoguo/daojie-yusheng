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
  const sectionClasses = ['next-ui-section', 'next-ui-surface-pane', 'next-ui-surface-pane--stack'];
  if (className) {
    sectionClasses.push(className);
  }
  return (
    <section className={sectionClasses.join(' ')}>
      <div className="next-ui-section-head">
        <div>
          <div className="next-ui-section-title">{title}</div>
          {subtitle ? <div className="next-ui-section-subtext">{subtitle}</div> : null}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
