import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from 'react';

export interface UiItemCardProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  title: string;
  subtitle?: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  active?: boolean;
}

export function UiItemCard({
  title,
  subtitle,
  meta,
  badge,
  active = false,
  className,
  children,
  ...props
}: PropsWithChildren<UiItemCardProps>) {
  const classes = ['next-ui-surface-card', 'next-ui-surface-card--compact', 'next-ui-interactive-card', 'next-ui-item-card'];
  if (active) {
    classes.push('is-active');
  }
  if (className) {
    classes.push(className);
  }

  return (
    <button {...props} type={props.type ?? 'button'} className={classes.join(' ')}>
      <div className="next-ui-item-card-head next-ui-entry-head">
        <span className="next-ui-item-card-title next-ui-entry-title">{title}</span>
        {badge ? <span className="next-ui-item-card-badge next-ui-entry-state">{badge}</span> : null}
      </div>
      {subtitle ? <div className="next-ui-item-card-subtitle next-ui-entry-note">{subtitle}</div> : null}
      {meta ? <div className="next-ui-item-card-meta next-ui-entry-note">{meta}</div> : null}
      {children}
    </button>
  );
}
