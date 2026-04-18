import type { CSSProperties, PropsWithChildren } from 'react';

export interface UiListProps {
  orientation?: 'vertical' | 'horizontal' | 'grid';
  scrollable?: boolean;
  columns?: number;
  gap?: 'sm' | 'md';
  className?: string;
}

export function UiList({
  orientation = 'vertical',
  scrollable = false,
  columns,
  gap = 'sm',
  className,
  children,
}: PropsWithChildren<UiListProps>) {
  const classes = ['next-ui-list', `next-ui-list--${orientation}`, `next-ui-list--gap-${gap}`];
  if (scrollable) {
    classes.push('next-ui-list--scrollable');
  }
  if (className) {
    classes.push(className);
  }

  const style = orientation === 'grid' && columns
    ? ({ '--next-ui-list-columns': `repeat(${columns}, minmax(0, 1fr))` } as CSSProperties)
    : undefined;

  return (
    <div className={classes.join(' ')} style={style}>
      {children}
    </div>
  );
}
