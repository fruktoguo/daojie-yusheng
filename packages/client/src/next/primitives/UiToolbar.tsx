import type { PropsWithChildren } from 'react';

export interface UiToolbarProps {
  className?: string;
}

export function UiToolbar({
  className,
  children,
}: PropsWithChildren<UiToolbarProps>) {
  const classes = ['next-ui-toolbar'];
  if (className) {
    classes.push(className);
  }

  return <div className={classes.join(' ')}>{children}</div>;
}
