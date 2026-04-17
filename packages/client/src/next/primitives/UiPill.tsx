import type { PropsWithChildren } from 'react';

export interface UiPillProps {
  tone?: 'default' | 'accent';
  className?: string;
}

export function UiPill({
  tone = 'default',
  className,
  children,
}: PropsWithChildren<UiPillProps>) {
  const classes = ['next-ui-pill', `next-ui-pill--${tone}`];
  if (className) {
    classes.push(className);
  }
  return <span className={classes.join(' ')}>{children}</span>;
}
