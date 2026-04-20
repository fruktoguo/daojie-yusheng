import type { CSSProperties, PropsWithChildren } from 'react';
/**
 * UiListProps：定义接口结构约束，明确可交付字段含义。
 */


export interface UiListProps {
/**
 * orientation：UiListProps 内部字段。
 */

  orientation?: 'vertical' | 'horizontal' | 'grid';  
  /**
 * scrollable：UiListProps 内部字段。
 */

  scrollable?: boolean;  
  /**
 * columns：UiListProps 内部字段。
 */

  columns?: number;  
  /**
 * gap：UiListProps 内部字段。
 */

  gap?: 'sm' | 'md';  
  /**
 * className：UiListProps 内部字段。
 */

  className?: string;
}
/**
 * UiList：执行核心业务逻辑。
 * @param {
  orientation = 'vertical',
  scrollable = false,
  columns,
  gap = 'sm',
  className,
  children,
} PropsWithChildren<UiListProps> 参数说明。
 * @returns 函数返回值。
 */


export function UiList({
  orientation = 'vertical',
  scrollable = false,
  columns,
  gap = 'sm',
  className,
  children,
}: PropsWithChildren<UiListProps>) {
  // 关键分支按状态与边界条件处理，非法路径会被提前拦截。

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
